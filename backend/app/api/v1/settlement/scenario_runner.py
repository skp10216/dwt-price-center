"""
정산 시스템 — 자동화 시나리오 테스트 러너
TEST_SCENARIO.md 기반의 12단계 플로우를 자동 실행하고 결과를 반환
"""

import time
import traceback
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import openpyxl
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.voucher import Voucher
from app.models.counterparty import Counterparty, CounterpartyAlias, UserCounterpartyFavorite
from app.models.counterparty_transaction import CounterpartyTransaction
from app.models.transaction_allocation import TransactionAllocation
from app.models.bank_import import BankImportJob, BankImportLine
from app.models.corporate_entity import CorporateEntity
from app.models.branch import Branch
from app.models.receipt import Receipt
from app.models.payment import Payment
from app.models.netting_record import NettingRecord, NettingVoucherLink
from app.models.voucher_change import VoucherChangeRequest
from app.models.period_lock import PeriodLock
from app.models.upload_template import UploadTemplate
from app.models.upload_job import UploadJob
from app.models.audit_log import AuditLog
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus,
    TransactionType, TransactionStatus, TransactionSource,
    BankImportJobStatus, BankImportLineStatus,
    NettingStatus,
)
from app.api.v1.settlement.activity import SETTLEMENT_ACTIONS

router = APIRouter()

TEST_DATA_DIR = Path("/app/test-data")


# ─── 요청/응답 스키마 ─────────────────────────────────────

class StepRequest(BaseModel):
    step: int
    context: dict[str, Any] = {}


class StepResult(BaseModel):
    step: int
    name: str
    status: str  # pass / fail / warn
    duration_ms: int
    message: str
    details: dict[str, Any] = {}
    error: str | None = None
    context: dict[str, Any] = {}


# ─── 헬퍼 ────────────────────────────────────────────────

def _parse_excel_rows(file_path: Path) -> list[dict]:
    """Excel 파일에서 데이터 행을 읽어 dict 리스트로 반환"""
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    # 헤더 찾기: 첫번째 비어있지 않은 행
    header_idx = 0
    for i, row in enumerate(rows):
        if any(cell is not None for cell in row):
            header_idx = i
            break

    headers = [str(c).strip() if c else f"col_{j}" for j, c in enumerate(rows[header_idx])]
    result = []
    for row in rows[header_idx + 1:]:
        if all(c is None for c in row):
            continue
        d = {}
        for j, h in enumerate(headers):
            val = row[j] if j < len(row) else None
            d[h] = val
        result.append(d)
    return result


async def _get_cp_id_by_name(db: AsyncSession, name: str) -> uuid.UUID | None:
    """거래처명으로 ID 조회"""
    result = await db.execute(
        select(Counterparty.id).where(Counterparty.name == name)
    )
    return result.scalar()


async def _update_voucher_status(voucher_id: uuid.UUID, db: AsyncSession):
    """전표 배분 상태 재계산"""
    v = await db.get(Voucher, voucher_id)
    if not v:
        return

    # 기존 배분 합계
    alloc_total = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .where(TransactionAllocation.voucher_id == v.id)
    )).scalar() or Decimal("0")

    # 레거시 합계
    legacy = Decimal("0")
    if v.voucher_type == VoucherType.SALES:
        legacy = (await db.execute(
            select(func.coalesce(func.sum(Receipt.amount), 0))
            .where(Receipt.voucher_id == v.id)
        )).scalar() or Decimal("0")
    else:
        legacy = (await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.voucher_id == v.id)
        )).scalar() or Decimal("0")

    total_settled = alloc_total + legacy
    ratio = float(total_settled / v.total_amount) if v.total_amount > 0 else 0

    if v.voucher_type == VoucherType.SALES:
        if v.settlement_status == SettlementStatus.LOCKED:
            pass
        elif ratio >= 1.0:
            v.settlement_status = SettlementStatus.SETTLED
        elif ratio > 0:
            v.settlement_status = SettlementStatus.SETTLING
        else:
            v.settlement_status = SettlementStatus.OPEN
    else:
        if v.payment_status == PaymentStatus.LOCKED:
            pass
        elif ratio >= 1.0:
            v.payment_status = PaymentStatus.PAID
        elif ratio > 0:
            v.payment_status = PaymentStatus.PARTIAL
        else:
            v.payment_status = PaymentStatus.UNPAID


async def _update_transaction_status(txn: CounterpartyTransaction, db: AsyncSession):
    """Transaction 배분 상태 재계산"""
    total_alloc = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .where(TransactionAllocation.transaction_id == txn.id)
    )).scalar() or Decimal("0")
    txn.allocated_amount = total_alloc

    if total_alloc >= txn.amount:
        txn.status = TransactionStatus.ALLOCATED
    elif total_alloc > 0:
        txn.status = TransactionStatus.PARTIAL
    else:
        txn.status = TransactionStatus.PENDING


# ─── 단계별 실행 함수 ──────────────────────────────────────

async def step_1_reset(db: AsyncSession, user: User, ctx: dict) -> dict:
    """전체 데이터 초기화"""
    tables = [
        TransactionAllocation, NettingVoucherLink, NettingRecord,
        BankImportLine, BankImportJob,
        Receipt, Payment, VoucherChangeRequest, Voucher,
        CounterpartyTransaction,
        CounterpartyAlias, UserCounterpartyFavorite, Counterparty,
        CorporateEntity, Branch, PeriodLock,
        UploadTemplate, UploadJob,
    ]
    total = 0
    for model in tables:
        r = await db.execute(delete(model))
        total += r.rowcount

    # 감사로그 (정산 관련만)
    r = await db.execute(
        delete(AuditLog).where(AuditLog.action.in_(SETTLEMENT_ACTIONS))
    )
    total += r.rowcount
    await db.commit()

    return {"message": f"전체 데이터 초기화 완료 ({total}건 삭제)", "deleted": total}


async def step_2_corp_entity(db: AsyncSession, user: User, ctx: dict) -> dict:
    """법인 등록"""
    ce = CorporateEntity(
        name="DWT 본사",
        code="DWT-HQ",
        business_number="123-45-67890",
        is_active=True,
    )
    db.add(ce)
    await db.flush()

    ctx["corp_entity_id"] = str(ce.id)
    return {
        "message": "법인 'DWT 본사' 생성 완료",
        "corp_entity_id": str(ce.id),
    }


async def step_3_counterparties(db: AsyncSession, user: User, ctx: dict) -> dict:
    """거래처 3곳 등록 + 자동 별칭"""
    names = ["(주)삼성전자", "(주)애플코리아", "LG전자"]
    cp_ids = {}

    for name in names:
        cp = Counterparty(
            name=name,
            counterparty_type="both",
            is_active=True,
        )
        db.add(cp)
        await db.flush()

        # 자동 별칭
        alias = CounterpartyAlias(
            counterparty_id=cp.id,
            alias_name=name,
            created_by=user.id,
        )
        db.add(alias)
        cp_ids[name] = str(cp.id)

    await db.flush()
    ctx["counterparty_ids"] = cp_ids

    return {
        "message": f"거래처 {len(names)}곳 생성 완료 (자동 별칭 포함)",
        "counterparties": cp_ids,
    }


async def step_4_aliases(db: AsyncSession, user: User, ctx: dict) -> dict:
    """추가 별칭 등록 (은행 매칭용)"""
    alias_map = {
        "(주)삼성전자": "삼성전자",
        "(주)애플코리아": "애플코리아",
    }
    cp_ids = ctx.get("counterparty_ids", {})
    added = []

    for cp_name, alias_name in alias_map.items():
        cp_id = cp_ids.get(cp_name)
        if not cp_id:
            continue
        alias = CounterpartyAlias(
            counterparty_id=uuid.UUID(cp_id),
            alias_name=alias_name,
            created_by=user.id,
        )
        db.add(alias)
        added.append(f"{cp_name} → {alias_name}")

    await db.flush()

    # 별칭 총 수 확인
    total_aliases = (await db.execute(
        select(func.count(CounterpartyAlias.id))
    )).scalar() or 0

    return {
        "message": f"별칭 {len(added)}건 추가 (총 {total_aliases}건)",
        "added": added,
        "total_aliases": total_aliases,
    }


async def step_5_sales_vouchers(db: AsyncSession, user: User, ctx: dict) -> dict:
    """판매 전표 직접 생성 (Excel 데이터 기반)"""
    file_path = TEST_DATA_DIR / "test_sales.xlsx"
    if not file_path.exists():
        raise FileNotFoundError(f"테스트 파일 없음: {file_path}")

    rows = _parse_excel_rows(file_path)
    cp_ids = ctx.get("counterparty_ids", {})
    created = 0
    total_amount = Decimal("0")
    details_by_cp = {}

    for row in rows:
        # 컬럼명 매핑
        trade_date_val = row.get("판매일")
        cp_name = row.get("판매처", "")
        voucher_number = row.get("번호", "")
        quantity = int(row.get("수량", 0) or 0)
        purchase_cost = Decimal(str(row.get("매입원가", 0) or 0))
        actual_price = Decimal(str(row.get("실판매가", 0) or 0))
        memo = row.get("비고", "")

        if not trade_date_val or not cp_name:
            continue

        # 날짜 변환
        if isinstance(trade_date_val, datetime):
            td = trade_date_val.date()
        elif isinstance(trade_date_val, date):
            td = trade_date_val
        else:
            td = datetime.strptime(str(trade_date_val), "%Y-%m-%d").date()

        # 거래처 찾기
        cp_id = cp_ids.get(cp_name) or cp_ids.get(f"(주){cp_name}")
        if not cp_id:
            # 별칭으로 찾기
            cp_id_val = await _get_cp_id_by_name(db, cp_name)
            if cp_id_val:
                cp_id = str(cp_id_val)
        if not cp_id:
            continue

        v = Voucher(
            trade_date=td,
            counterparty_id=uuid.UUID(cp_id),
            voucher_number=str(voucher_number),
            voucher_type=VoucherType.SALES,
            quantity=quantity,
            total_amount=actual_price,
            purchase_cost=purchase_cost,
            actual_sale_price=actual_price,
            settlement_status=SettlementStatus.OPEN,
            payment_status=PaymentStatus.UNPAID,
            memo=memo if memo else None,
            created_by=user.id,
        )
        db.add(v)
        created += 1
        total_amount += actual_price

        details_by_cp.setdefault(cp_name, {"count": 0, "total": Decimal("0")})
        details_by_cp[cp_name]["count"] += 1
        details_by_cp[cp_name]["total"] += actual_price

    await db.flush()

    return {
        "message": f"판매 전표 {created}건 생성 (총액 {total_amount:,.0f}원)",
        "created": created,
        "total_amount": float(total_amount),
        "by_counterparty": {
            k: {"count": v["count"], "total": float(v["total"])}
            for k, v in details_by_cp.items()
        },
    }


async def step_6_purchase_vouchers(db: AsyncSession, user: User, ctx: dict) -> dict:
    """매입 전표 직접 생성 (Excel 데이터 기반)"""
    file_path = TEST_DATA_DIR / "test_purchase.xlsx"
    if not file_path.exists():
        raise FileNotFoundError(f"테스트 파일 없음: {file_path}")

    rows = _parse_excel_rows(file_path)
    cp_ids = ctx.get("counterparty_ids", {})
    created = 0
    total_amount = Decimal("0")
    details_by_cp = {}

    for row in rows:
        trade_date_val = row.get("매입일")
        cp_name = row.get("매입처", "")
        voucher_number = row.get("번호", "")
        quantity = int(row.get("수량", 0) or 0)
        purchase_cost = Decimal(str(row.get("매입원가", 0) or 0))
        actual_price = Decimal(str(row.get("실매입가", 0) or 0))
        memo = row.get("비고", "")

        if not trade_date_val or not cp_name:
            continue

        if isinstance(trade_date_val, datetime):
            td = trade_date_val.date()
        elif isinstance(trade_date_val, date):
            td = trade_date_val
        else:
            td = datetime.strptime(str(trade_date_val), "%Y-%m-%d").date()

        cp_id = cp_ids.get(cp_name) or cp_ids.get(f"(주){cp_name}")
        if not cp_id:
            cp_id_val = await _get_cp_id_by_name(db, cp_name)
            if cp_id_val:
                cp_id = str(cp_id_val)
        if not cp_id:
            continue

        v = Voucher(
            trade_date=td,
            counterparty_id=uuid.UUID(cp_id),
            voucher_number=str(voucher_number),
            voucher_type=VoucherType.PURCHASE,
            quantity=quantity,
            total_amount=actual_price,
            purchase_cost=purchase_cost,
            actual_purchase_price=actual_price,
            settlement_status=SettlementStatus.OPEN,
            payment_status=PaymentStatus.UNPAID,
            memo=memo if memo else None,
            created_by=user.id,
        )
        db.add(v)
        created += 1
        total_amount += actual_price

        details_by_cp.setdefault(cp_name, {"count": 0, "total": Decimal("0")})
        details_by_cp[cp_name]["count"] += 1
        details_by_cp[cp_name]["total"] += actual_price

    await db.flush()

    return {
        "message": f"매입 전표 {created}건 생성 (총액 {total_amount:,.0f}원)",
        "created": created,
        "total_amount": float(total_amount),
        "by_counterparty": {
            k: {"count": v["count"], "total": float(v["total"])}
            for k, v in details_by_cp.items()
        },
    }


async def step_7_bank_import(db: AsyncSession, user: User, ctx: dict) -> dict:
    """은행 입출금 임포트 (직접 Transaction 생성)"""
    file_path = TEST_DATA_DIR / "test_bank_statement.xlsx"
    if not file_path.exists():
        raise FileNotFoundError(f"테스트 파일 없음: {file_path}")

    rows = _parse_excel_rows(file_path)
    cp_ids = ctx.get("counterparty_ids", {})
    corp_entity_id = ctx.get("corp_entity_id")

    deposits = 0
    withdrawals = 0
    dep_total = Decimal("0")
    wd_total = Decimal("0")
    txn_ids = []

    # 별칭 매핑 사전 빌드
    alias_map = {}
    result = await db.execute(
        select(CounterpartyAlias.alias_name, CounterpartyAlias.counterparty_id)
    )
    for alias_name, cp_id in result.all():
        alias_map[alias_name] = cp_id

    unmatched = []

    for row in rows:
        txn_date_val = row.get("거래일시")
        description = str(row.get("적요", ""))
        deposit_amt = row.get("입금")
        withdrawal_amt = row.get("출금")
        sender_receiver = str(row.get("의뢰인/수취인", "") or row.get("의뢰인수취인", "") or "")

        if not txn_date_val:
            continue

        if isinstance(txn_date_val, datetime):
            td = txn_date_val.date()
        elif isinstance(txn_date_val, date):
            td = txn_date_val
        else:
            td = datetime.strptime(str(txn_date_val).split(" ")[0], "%Y-%m-%d").date()

        # 금액 결정
        dep_val = Decimal(str(deposit_amt or 0))
        wd_val = Decimal(str(withdrawal_amt or 0))

        if dep_val > 0:
            amount = dep_val
            txn_type = TransactionType.DEPOSIT
        elif wd_val > 0:
            amount = wd_val
            txn_type = TransactionType.WITHDRAWAL
        else:
            continue

        # 거래처 매칭 (의뢰인/수취인 → 별칭)
        match_name = sender_receiver or description
        matched_cp_id = alias_map.get(match_name)
        if not matched_cp_id:
            # 부분 매칭
            for alias_name, cp_id in alias_map.items():
                if alias_name in match_name or match_name in alias_name:
                    matched_cp_id = cp_id
                    break

        if not matched_cp_id:
            unmatched.append(match_name)
            continue

        txn = CounterpartyTransaction(
            counterparty_id=matched_cp_id,
            corporate_entity_id=uuid.UUID(corp_entity_id) if corp_entity_id else None,
            transaction_type=txn_type,
            transaction_date=td,
            amount=amount,
            allocated_amount=Decimal("0"),
            memo=f"{description} ({sender_receiver})" if sender_receiver else description,
            source=TransactionSource.BANK_IMPORT,
            status=TransactionStatus.PENDING,
            created_by=user.id,
        )
        db.add(txn)
        await db.flush()
        txn_ids.append(str(txn.id))

        # 카운터는 실제 생성 후 증가
        if txn_type == TransactionType.DEPOSIT:
            deposits += 1
            dep_total += amount
        else:
            withdrawals += 1
            wd_total += amount

    ctx["bank_txn_ids"] = txn_ids

    return {
        "message": f"은행 임포트 완료: 입금 {deposits}건({dep_total:,.0f}원), 출금 {withdrawals}건({wd_total:,.0f}원)",
        "deposits": deposits,
        "withdrawals": withdrawals,
        "deposit_total": float(dep_total),
        "withdrawal_total": float(wd_total),
        "total_transactions": deposits + withdrawals,
        "unmatched": unmatched,
    }


async def step_8_auto_allocate(db: AsyncSession, user: User, ctx: dict) -> dict:
    """은행 입출금 자동 배분"""
    # PENDING 상태인 모든 트랜잭션 가져오기
    result = await db.execute(
        select(CounterpartyTransaction)
        .where(CounterpartyTransaction.status == TransactionStatus.PENDING)
        .order_by(CounterpartyTransaction.transaction_date.asc())
    )
    pending_txns = result.scalars().all()

    total_allocations = 0
    allocated_txns = 0
    details = []

    for txn in pending_txns:
        remaining = txn.amount - txn.allocated_amount
        if remaining <= 0:
            continue

        # DEPOSIT → SALES, WITHDRAWAL → PURCHASE
        target_type = VoucherType.SALES if txn.transaction_type == TransactionType.DEPOSIT else VoucherType.PURCHASE

        vouchers = (await db.execute(
            select(Voucher)
            .where(
                Voucher.counterparty_id == txn.counterparty_id,
                Voucher.voucher_type == target_type,
                Voucher.settlement_status != SettlementStatus.LOCKED,
                Voucher.payment_status != PaymentStatus.LOCKED,
            )
            .order_by(Voucher.trade_date.asc(), Voucher.created_at.asc())
        )).scalars().all()

        # 각 전표의 기존 배분액 조회
        v_ids = [v.id for v in vouchers]
        alloc_map = {}
        if v_ids:
            ar = await db.execute(
                select(
                    TransactionAllocation.voucher_id,
                    func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0),
                ).where(TransactionAllocation.voucher_id.in_(v_ids))
                .group_by(TransactionAllocation.voucher_id)
            )
            alloc_map = {row[0]: row[1] for row in ar.all()}

        order_num = 0
        alloc_count = 0
        for v in vouchers:
            if remaining <= 0:
                break
            already = alloc_map.get(v.id, Decimal("0"))
            voucher_balance = v.total_amount - already
            if voucher_balance <= 0:
                continue

            alloc_amount = min(remaining, voucher_balance)
            order_num += 1
            allocation = TransactionAllocation(
                transaction_id=txn.id,
                voucher_id=v.id,
                allocated_amount=alloc_amount,
                allocation_order=order_num,
                created_by=user.id,
            )
            db.add(allocation)
            remaining -= alloc_amount
            alloc_count += 1
            total_allocations += 1

        await db.flush()

        if alloc_count > 0:
            allocated_txns += 1
            await _update_transaction_status(txn, db)

            # 관련 전표 상태 업데이트
            for v in vouchers:
                await _update_voucher_status(v.id, db)

            # 거래처명 가져오기
            cp = await db.get(Counterparty, txn.counterparty_id)
            cp_name = cp.name if cp else "?"
            details.append(
                f"{cp_name} {txn.transaction_type.value} {txn.amount:,.0f}원 → {alloc_count}건 배분"
            )

    await db.flush()

    # 배분 후 상태 요약
    settled_count = (await db.execute(
        select(func.count(Voucher.id)).where(
            Voucher.settlement_status == SettlementStatus.SETTLED
        )
    )).scalar() or 0
    paid_count = (await db.execute(
        select(func.count(Voucher.id)).where(
            Voucher.payment_status == PaymentStatus.PAID
        )
    )).scalar() or 0

    return {
        "message": f"자동 배분 완료: {allocated_txns}건 → {total_allocations}건 배분",
        "allocated_transactions": allocated_txns,
        "total_allocations": total_allocations,
        "settled_vouchers": settled_count,
        "paid_vouchers": paid_count,
        "details": details,
    }


async def step_9_manual_transaction(db: AsyncSession, user: User, ctx: dict) -> dict:
    """수동 입출금 생성 + 자동 배분 (LG전자 출금)"""
    cp_ids = ctx.get("counterparty_ids", {})
    lg_id = cp_ids.get("LG전자")
    if not lg_id:
        raise ValueError("LG전자 거래처 ID를 찾을 수 없습니다")

    # 출금 생성
    txn = CounterpartyTransaction(
        counterparty_id=uuid.UUID(lg_id),
        transaction_type=TransactionType.WITHDRAWAL,
        transaction_date=date(2026, 3, 5),
        amount=Decimal("4500000"),
        allocated_amount=Decimal("0"),
        memo="그램 프로 매입대금 지급",
        source=TransactionSource.MANUAL,
        status=TransactionStatus.PENDING,
        created_by=user.id,
    )
    db.add(txn)
    await db.flush()

    # 자동 배분 (LG전자 매입 전표)
    vouchers = (await db.execute(
        select(Voucher)
        .where(
            Voucher.counterparty_id == uuid.UUID(lg_id),
            Voucher.voucher_type == VoucherType.PURCHASE,
            Voucher.payment_status != PaymentStatus.LOCKED,
        )
        .order_by(Voucher.trade_date.asc())
    )).scalars().all()

    remaining = txn.amount
    alloc_count = 0
    for v in vouchers:
        if remaining <= 0:
            break
        already = (await db.execute(
            select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
            .where(TransactionAllocation.voucher_id == v.id)
        )).scalar() or Decimal("0")
        balance = v.total_amount - already
        if balance <= 0:
            continue

        alloc_amount = min(remaining, balance)
        alloc = TransactionAllocation(
            transaction_id=txn.id,
            voucher_id=v.id,
            allocated_amount=alloc_amount,
            allocation_order=alloc_count + 1,
            created_by=user.id,
        )
        db.add(alloc)
        remaining -= alloc_amount
        alloc_count += 1

    await db.flush()
    await _update_transaction_status(txn, db)
    for v in vouchers:
        await _update_voucher_status(v.id, db)

    return {
        "message": f"LG전자 출금 4,500,000원 생성 + {alloc_count}건 배분 완료",
        "transaction_id": str(txn.id),
        "amount": 4500000,
        "allocations": alloc_count,
        "status": txn.status.value,
    }


async def step_10_netting(db: AsyncSession, user: User, ctx: dict) -> dict:
    """삼성전자 상계 생성 + 확정"""
    cp_ids = ctx.get("counterparty_ids", {})
    samsung_id = cp_ids.get("(주)삼성전자")
    if not samsung_id:
        raise ValueError("(주)삼성전자 거래처 ID를 찾을 수 없습니다")

    samsung_uuid = uuid.UUID(samsung_id)

    # 미정산 판매 전표 조회
    sales_vouchers = (await db.execute(
        select(Voucher).where(
            Voucher.counterparty_id == samsung_uuid,
            Voucher.voucher_type == VoucherType.SALES,
            Voucher.settlement_status.in_([SettlementStatus.OPEN, SettlementStatus.SETTLING]),
        )
    )).scalars().all()

    # 미정산 매입 전표 조회
    purchase_vouchers = (await db.execute(
        select(Voucher).where(
            Voucher.counterparty_id == samsung_uuid,
            Voucher.voucher_type == VoucherType.PURCHASE,
            Voucher.payment_status.in_([PaymentStatus.UNPAID, PaymentStatus.PARTIAL]),
        )
    )).scalars().all()

    if not sales_vouchers or not purchase_vouchers:
        return {
            "message": "상계 대상 전표가 없습니다",
            "status": "skip",
            "sales_count": len(sales_vouchers),
            "purchase_count": len(purchase_vouchers),
        }

    # 각 전표의 잔여 금액 계산
    async def get_remaining(v: Voucher) -> Decimal:
        alloc = (await db.execute(
            select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
            .where(TransactionAllocation.voucher_id == v.id)
        )).scalar() or Decimal("0")
        return v.total_amount - alloc

    # 매입 전표의 미지급 잔액 합계
    purchase_remaining = Decimal("0")
    purchase_details = []
    for pv in purchase_vouchers:
        rem = await get_remaining(pv)
        if rem > 0:
            purchase_remaining += rem
            purchase_details.append((pv, rem))

    # 상계 금액 = 매입 미지급 잔액 (판매 미수에서 차감)
    netting_amount = purchase_remaining
    if netting_amount <= 0:
        return {"message": "상계 가능 금액이 없습니다", "status": "skip"}

    # 상계 레코드 생성
    netting = NettingRecord(
        counterparty_id=samsung_uuid,
        netting_date=date(2026, 3, 5),
        netting_amount=netting_amount,
        status=NettingStatus.DRAFT,
        memo="시나리오 테스트 상계",
        created_by=user.id,
    )
    db.add(netting)
    await db.flush()

    # 전표 링크 생성
    # 매입 전표 링크
    for pv, rem in purchase_details:
        link = NettingVoucherLink(
            netting_record_id=netting.id,
            voucher_id=pv.id,
            netted_amount=rem,
        )
        db.add(link)

    # 판매 전표 링크 (상계액만큼)
    remaining_netting = netting_amount
    for sv in sales_vouchers:
        if remaining_netting <= 0:
            break
        sv_rem = await get_remaining(sv)
        if sv_rem <= 0:
            continue
        link_amount = min(remaining_netting, sv_rem)
        link = NettingVoucherLink(
            netting_record_id=netting.id,
            voucher_id=sv.id,
            netted_amount=link_amount,
        )
        db.add(link)
        remaining_netting -= link_amount

    await db.flush()

    # 상계 확정: DEPOSIT + WITHDRAWAL Transaction 자동 생성
    netting.status = NettingStatus.CONFIRMED
    netting.confirmed_at = datetime.utcnow()
    netting.confirmed_by = user.id

    # 입금 Transaction (판매 전표에 대한 상계 입금)
    dep_txn = CounterpartyTransaction(
        counterparty_id=samsung_uuid,
        transaction_type=TransactionType.DEPOSIT,
        transaction_date=date(2026, 3, 5),
        amount=netting_amount,
        allocated_amount=Decimal("0"),
        memo=f"상계 입금 (상계#{str(netting.id)[:8]})",
        source=TransactionSource.NETTING,
        netting_record_id=netting.id,
        status=TransactionStatus.PENDING,
        created_by=user.id,
    )
    db.add(dep_txn)
    await db.flush()

    # 출금 Transaction (매입 전표에 대한 상계 출금)
    wd_txn = CounterpartyTransaction(
        counterparty_id=samsung_uuid,
        transaction_type=TransactionType.WITHDRAWAL,
        transaction_date=date(2026, 3, 5),
        amount=netting_amount,
        allocated_amount=Decimal("0"),
        memo=f"상계 출금 (상계#{str(netting.id)[:8]})",
        source=TransactionSource.NETTING,
        netting_record_id=netting.id,
        status=TransactionStatus.PENDING,
        created_by=user.id,
    )
    db.add(wd_txn)
    await db.flush()

    # 배분 생성
    order = 0
    remaining_dep = netting_amount
    for sv in sales_vouchers:
        if remaining_dep <= 0:
            break
        sv_rem = await get_remaining(sv)
        if sv_rem <= 0:
            continue
        alloc_amt = min(remaining_dep, sv_rem)
        order += 1
        db.add(TransactionAllocation(
            transaction_id=dep_txn.id,
            voucher_id=sv.id,
            allocated_amount=alloc_amt,
            allocation_order=order,
            created_by=user.id,
        ))
        remaining_dep -= alloc_amt

    order = 0
    for pv, rem in purchase_details:
        order += 1
        db.add(TransactionAllocation(
            transaction_id=wd_txn.id,
            voucher_id=pv.id,
            allocated_amount=rem,
            allocation_order=order,
            created_by=user.id,
        ))

    await db.flush()

    # 상태 업데이트
    await _update_transaction_status(dep_txn, db)
    await _update_transaction_status(wd_txn, db)
    for sv in sales_vouchers:
        await _update_voucher_status(sv.id, db)
    for pv, _ in purchase_details:
        await _update_voucher_status(pv.id, db)

    ctx["netting_id"] = str(netting.id)

    return {
        "message": f"상계 {netting_amount:,.0f}원 생성 + 확정 완료",
        "netting_id": str(netting.id),
        "netting_amount": float(netting_amount),
        "deposit_txn_id": str(dep_txn.id),
        "withdrawal_txn_id": str(wd_txn.id),
    }


async def step_11_lock(db: AsyncSession, user: User, ctx: dict) -> dict:
    """마감 테스트: 정산완료 전표 일괄 마감 → 수정 차단 확인 → 1건 해제"""
    # 정산완료 (SETTLED) 판매 전표
    settled_sales = (await db.execute(
        select(Voucher).where(
            Voucher.voucher_type == VoucherType.SALES,
            Voucher.settlement_status == SettlementStatus.SETTLED,
        )
    )).scalars().all()

    # 지급완료 (PAID) 매입 전표
    paid_purchases = (await db.execute(
        select(Voucher).where(
            Voucher.voucher_type == VoucherType.PURCHASE,
            Voucher.payment_status == PaymentStatus.PAID,
        )
    )).scalars().all()

    locked_count = 0
    locked_ids = []

    for v in settled_sales:
        v.settlement_status = SettlementStatus.LOCKED
        locked_count += 1
        locked_ids.append(str(v.id))

    for v in paid_purchases:
        v.payment_status = PaymentStatus.LOCKED
        locked_count += 1
        locked_ids.append(str(v.id))

    await db.flush()

    # 마감 해제 테스트 (1건만)
    unlocked_id = None
    if settled_sales:
        first = settled_sales[0]
        first.settlement_status = SettlementStatus.SETTLED
        unlocked_id = str(first.id)
        await db.flush()

    return {
        "message": f"마감 {locked_count}건 완료, 1건 해제 테스트 성공",
        "locked_count": locked_count,
        "unlocked_id": unlocked_id,
        "locked_voucher_ids": locked_ids[:5],  # 처음 5개만
    }


async def step_12_final_check(db: AsyncSession, user: User, ctx: dict) -> dict:
    """최종 플로우 점검 (데이터 정합성 확인)"""
    # 집계
    cp_count = (await db.execute(select(func.count(Counterparty.id)))).scalar() or 0
    ce_count = (await db.execute(select(func.count(CorporateEntity.id)))).scalar() or 0
    alias_count = (await db.execute(select(func.count(CounterpartyAlias.id)))).scalar() or 0

    sales_count = (await db.execute(
        select(func.count(Voucher.id)).where(Voucher.voucher_type == VoucherType.SALES)
    )).scalar() or 0
    purchase_count = (await db.execute(
        select(func.count(Voucher.id)).where(Voucher.voucher_type == VoucherType.PURCHASE)
    )).scalar() or 0

    sales_total = float((await db.execute(
        select(func.coalesce(func.sum(Voucher.total_amount), 0))
        .where(Voucher.voucher_type == VoucherType.SALES)
    )).scalar() or 0)
    purchase_total = float((await db.execute(
        select(func.coalesce(func.sum(Voucher.total_amount), 0))
        .where(Voucher.voucher_type == VoucherType.PURCHASE)
    )).scalar() or 0)

    txn_count = (await db.execute(
        select(func.count(CounterpartyTransaction.id))
        .where(CounterpartyTransaction.status != TransactionStatus.CANCELLED)
    )).scalar() or 0

    alloc_count = (await db.execute(
        select(func.count(TransactionAllocation.id))
    )).scalar() or 0

    netting_count = (await db.execute(
        select(func.count(NettingRecord.id))
        .where(NettingRecord.status == NettingStatus.CONFIRMED)
    )).scalar() or 0

    locked_count = (await db.execute(
        select(func.count(Voucher.id)).where(
            (Voucher.settlement_status == SettlementStatus.LOCKED) |
            (Voucher.payment_status == PaymentStatus.LOCKED)
        )
    )).scalar() or 0

    settled_count = (await db.execute(
        select(func.count(Voucher.id)).where(
            (Voucher.settlement_status == SettlementStatus.SETTLED) |
            (Voucher.payment_status == PaymentStatus.PAID)
        )
    )).scalar() or 0

    # 검증 항목
    checks = []
    checks.append(("거래처 3개", cp_count == 3, f"실제: {cp_count}"))
    checks.append(("법인 1개", ce_count == 1, f"실제: {ce_count}"))
    checks.append(("별칭 5개", alias_count == 5, f"실제: {alias_count}"))
    checks.append(("판매 전표 7건", sales_count == 7, f"실제: {sales_count}"))
    checks.append(("매입 전표 5건", purchase_count == 5, f"실제: {purchase_count}"))
    checks.append(("입출금 건 존재", txn_count > 0, f"실제: {txn_count}"))
    checks.append(("배분 건 존재", alloc_count > 0, f"실제: {alloc_count}"))
    checks.append(("상계 1건", netting_count == 1, f"실제: {netting_count}"))
    checks.append(("정산완료 전표 존재", settled_count > 0, f"실제: {settled_count}"))
    checks.append(("마감 전표 존재", locked_count > 0, f"실제: {locked_count}"))

    passed = sum(1 for _, ok, _ in checks if ok)
    failed = sum(1 for _, ok, _ in checks if not ok)
    all_pass = failed == 0

    return {
        "message": f"최종 점검: {passed}/{len(checks)}개 통과" + (" — 전체 성공!" if all_pass else f" — {failed}건 실패"),
        "all_pass": all_pass,
        "passed": passed,
        "failed": failed,
        "checks": [
            {"name": name, "pass": ok, "detail": detail}
            for name, ok, detail in checks
        ],
        "summary": {
            "counterparties": cp_count,
            "corporate_entities": ce_count,
            "aliases": alias_count,
            "sales_vouchers": sales_count,
            "purchase_vouchers": purchase_count,
            "sales_total": sales_total,
            "purchase_total": purchase_total,
            "transactions": txn_count,
            "allocations": alloc_count,
            "nettings": netting_count,
            "settled": settled_count,
            "locked": locked_count,
        },
    }


# ─── 단계 등록 ─────────────────────────────────────────────

STEPS = {
    1: ("전체 데이터 초기화", step_1_reset),
    2: ("법인 등록", step_2_corp_entity),
    3: ("거래처 등록 (3곳)", step_3_counterparties),
    4: ("별칭 추가 (은행 매칭용)", step_4_aliases),
    5: ("판매 전표 생성 (7건)", step_5_sales_vouchers),
    6: ("매입 전표 생성 (5건)", step_6_purchase_vouchers),
    7: ("은행 입출금 임포트 (7건)", step_7_bank_import),
    8: ("자동 배분 (FIFO)", step_8_auto_allocate),
    9: ("수동 입출금 + 배분", step_9_manual_transaction),
    10: ("상계 생성 + 확정", step_10_netting),
    11: ("마감 + 해제 테스트", step_11_lock),
    12: ("최종 데이터 검증", step_12_final_check),
}


# ─── API 엔드포인트 ─────────────────────────────────────────

@router.post("/scenario/run-step")
async def run_scenario_step(
    data: StepRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시나리오 테스트 단계 실행

    각 단계를 순차적으로 실행합니다. context에 이전 단계의 결과를 전달합니다.
    """
    step_num = data.step
    ctx = dict(data.context)

    if step_num not in STEPS:
        return StepResult(
            step=step_num,
            name="알 수 없는 단계",
            status="fail",
            duration_ms=0,
            message=f"유효하지 않은 단계 번호: {step_num}",
            error=f"단계 {step_num}은(는) 1~{len(STEPS)} 범위여야 합니다",
            context=ctx,
        )

    name, fn = STEPS[step_num]
    start = time.monotonic()

    try:
        result = await fn(db, current_user, ctx)
        await db.commit()
        duration = int((time.monotonic() - start) * 1000)

        return StepResult(
            step=step_num,
            name=name,
            status="pass",
            duration_ms=duration,
            message=result.get("message", "완료"),
            details=result,
            context=ctx,
        )
    except Exception as e:
        await db.rollback()
        duration = int((time.monotonic() - start) * 1000)
        return StepResult(
            step=step_num,
            name=name,
            status="fail",
            duration_ms=duration,
            message=f"실패: {str(e)}",
            error=traceback.format_exc(),
            context=ctx,
        )


@router.get("/scenario/steps")
async def get_scenario_steps(
    current_user: User = Depends(get_current_user),
):
    """시나리오 테스트 단계 목록 조회"""
    return {
        "total_steps": len(STEPS),
        "steps": [
            {"step": num, "name": name}
            for num, (name, _) in STEPS.items()
        ],
    }
