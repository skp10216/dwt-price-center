"""
정산 시스템 — 자동화 시나리오 테스트 러너
14단계 플로우를 자동 실행하고 결과를 반환
"""

import hashlib
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
from sqlalchemy import select, func, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_settlement_user
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
from app.models.scenario_test_record import ScenarioTestRecord

router = APIRouter()

TEST_DATA_DIR = Path("/app/test-data")


# ─── 테스트 데이터 레지스트리 헬퍼 ─────────────────────────

async def _register_test_record(db: AsyncSession, table_name: str, record_id: uuid.UUID):
    """테스트에서 생성한 루트 엔티티를 레지스트리에 등록"""
    db.add(ScenarioTestRecord(table_name=table_name, record_id=record_id))


async def cleanup_test_data(db: AsyncSession) -> dict:
    """레지스트리 기반 테스트 데이터만 선별 삭제 (사용자 데이터 보호)

    루트 엔티티(거래처, 법인, 은행임포트 job)로부터
    FK 체인을 따라 캐스케이드 삭제합니다.
    """
    summary: dict[str, int] = {}

    # 1. 레지스트리에서 루트 엔티티 ID 조회
    result = await db.execute(
        select(ScenarioTestRecord.table_name, ScenarioTestRecord.record_id)
    )
    registry: dict[str, list[uuid.UUID]] = {}
    for table_name, record_id in result.all():
        registry.setdefault(table_name, []).append(record_id)

    if not registry:
        return {"total_deleted": 0, "summary": {}}

    test_cp_ids = registry.get("counterparties", [])
    test_ce_ids = registry.get("corporate_entities", [])
    test_bij_ids = registry.get("bank_import_jobs", [])

    # 2. 파생 ID 조회 (캐스케이드용)
    test_voucher_ids: list[uuid.UUID] = []
    test_txn_ids: list[uuid.UUID] = []

    if test_cp_ids:
        vr = await db.execute(
            select(Voucher.id).where(Voucher.counterparty_id.in_(test_cp_ids))
        )
        test_voucher_ids = [r[0] for r in vr.all()]

        tr = await db.execute(
            select(CounterpartyTransaction.id).where(
                CounterpartyTransaction.counterparty_id.in_(test_cp_ids)
            )
        )
        test_txn_ids = [r[0] for r in tr.all()]

    # 3. FK 안전 순서로 삭제 (자식 → 부모)

    # 3-1. TransactionAllocation
    if test_voucher_ids or test_txn_ids:
        conditions = []
        if test_voucher_ids:
            conditions.append(TransactionAllocation.voucher_id.in_(test_voucher_ids))
        if test_txn_ids:
            conditions.append(TransactionAllocation.transaction_id.in_(test_txn_ids))
        r = await db.execute(delete(TransactionAllocation).where(or_(*conditions)))
        summary["transaction_allocations"] = r.rowcount

    # 3-2. NettingVoucherLink
    if test_voucher_ids:
        r = await db.execute(
            delete(NettingVoucherLink).where(NettingVoucherLink.voucher_id.in_(test_voucher_ids))
        )
        summary["netting_voucher_links"] = r.rowcount

    # 3-3. Receipt / Payment (레거시)
    if test_voucher_ids:
        r = await db.execute(delete(Receipt).where(Receipt.voucher_id.in_(test_voucher_ids)))
        summary["receipts"] = r.rowcount
        r = await db.execute(delete(Payment).where(Payment.voucher_id.in_(test_voucher_ids)))
        summary["payments"] = r.rowcount

    # 3-4. VoucherChangeRequest
    if test_voucher_ids:
        r = await db.execute(
            delete(VoucherChangeRequest).where(VoucherChangeRequest.voucher_id.in_(test_voucher_ids))
        )
        summary["voucher_change_requests"] = r.rowcount

    # 3-5. Voucher
    if test_cp_ids:
        r = await db.execute(
            delete(Voucher).where(Voucher.counterparty_id.in_(test_cp_ids))
        )
        summary["vouchers"] = r.rowcount

    # 3-6. CounterpartyTransaction (bank_import_line_id, netting_record_id 는 SET NULL이므로 바로 삭제 가능)
    if test_cp_ids:
        r = await db.execute(
            delete(CounterpartyTransaction).where(
                CounterpartyTransaction.counterparty_id.in_(test_cp_ids)
            )
        )
        summary["counterparty_transactions"] = r.rowcount

    # 3-7. NettingRecord
    if test_cp_ids:
        r = await db.execute(
            delete(NettingRecord).where(NettingRecord.counterparty_id.in_(test_cp_ids))
        )
        summary["netting_records"] = r.rowcount

    # 3-8. BankImportLine → BankImportJob
    if test_bij_ids:
        r = await db.execute(
            delete(BankImportLine).where(BankImportLine.import_job_id.in_(test_bij_ids))
        )
        summary["bank_import_lines"] = r.rowcount
        r = await db.execute(
            delete(BankImportJob).where(BankImportJob.id.in_(test_bij_ids))
        )
        summary["bank_import_jobs"] = r.rowcount

    # 3-9. CounterpartyAlias / UserCounterpartyFavorite
    if test_cp_ids:
        r = await db.execute(
            delete(CounterpartyAlias).where(CounterpartyAlias.counterparty_id.in_(test_cp_ids))
        )
        summary["counterparty_aliases"] = r.rowcount
        r = await db.execute(
            delete(UserCounterpartyFavorite).where(
                UserCounterpartyFavorite.counterparty_id.in_(test_cp_ids)
            )
        )
        summary["user_counterparty_favorites"] = r.rowcount

    # 3-10. Counterparty
    if test_cp_ids:
        r = await db.execute(
            delete(Counterparty).where(Counterparty.id.in_(test_cp_ids))
        )
        summary["counterparties"] = r.rowcount

    # 3-11. CorporateEntity
    if test_ce_ids:
        r = await db.execute(
            delete(CorporateEntity).where(CorporateEntity.id.in_(test_ce_ids))
        )
        summary["corporate_entities"] = r.rowcount

    # 3-12. AuditLog (테스트 엔티티 관련만)
    all_test_ids: set[uuid.UUID] = set()
    for ids in registry.values():
        all_test_ids.update(ids)
    all_test_ids.update(test_voucher_ids)
    all_test_ids.update(test_txn_ids)
    if all_test_ids:
        r = await db.execute(
            delete(AuditLog).where(
                AuditLog.action.in_(SETTLEMENT_ACTIONS),
                AuditLog.target_id.in_(list(all_test_ids)),
            )
        )
        summary["audit_logs"] = r.rowcount

    # 레지스트리 클리어
    r = await db.execute(delete(ScenarioTestRecord))
    summary["registry_cleared"] = r.rowcount

    await db.commit()

    total = sum(v for k, v in summary.items() if k != "registry_cleared")
    return {"total_deleted": total, "summary": summary}


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


def _serialize_for_json(obj: Any) -> Any:
    """JSONB 저장을 위해 비직렬화 가능한 값을 변환"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _serialize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_serialize_for_json(v) for v in obj]
    return obj


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

    alloc_total = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
        .where(TransactionAllocation.voucher_id == v.id)
    )).scalar() or Decimal("0")

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
    """전체 정산 데이터 초기화"""
    from app.models.return_item import ReturnItem
    from app.models.intake_item import IntakeItem

    summary: dict[str, int] = {}

    r = await db.execute(delete(TransactionAllocation)); summary["allocations"] = r.rowcount
    r = await db.execute(delete(NettingVoucherLink)); summary["netting_links"] = r.rowcount
    r = await db.execute(delete(Receipt)); summary["receipts"] = r.rowcount
    r = await db.execute(delete(Payment)); summary["payments"] = r.rowcount
    r = await db.execute(delete(VoucherChangeRequest)); summary["change_requests"] = r.rowcount
    r = await db.execute(delete(ReturnItem)); summary["return_items"] = r.rowcount
    r = await db.execute(delete(IntakeItem)); summary["intake_items"] = r.rowcount
    r = await db.execute(delete(Voucher)); summary["vouchers"] = r.rowcount
    r = await db.execute(delete(CounterpartyTransaction)); summary["transactions"] = r.rowcount
    r = await db.execute(delete(NettingRecord)); summary["nettings"] = r.rowcount
    r = await db.execute(delete(BankImportLine)); summary["bank_lines"] = r.rowcount
    r = await db.execute(delete(BankImportJob)); summary["bank_jobs"] = r.rowcount
    r = await db.execute(delete(CounterpartyAlias)); summary["aliases"] = r.rowcount
    r = await db.execute(delete(UserCounterpartyFavorite)); summary["favorites"] = r.rowcount
    r = await db.execute(delete(Counterparty)); summary["counterparties"] = r.rowcount
    r = await db.execute(delete(CorporateEntity)); summary["corp_entities"] = r.rowcount
    r = await db.execute(delete(UploadJob)); summary["upload_jobs"] = r.rowcount
    r = await db.execute(delete(PeriodLock)); summary["period_locks"] = r.rowcount
    r = await db.execute(delete(AuditLog).where(AuditLog.action.in_(SETTLEMENT_ACTIONS))); summary["audit_logs"] = r.rowcount
    r = await db.execute(delete(ScenarioTestRecord)); summary["registry"] = r.rowcount

    total = sum(v for v in summary.values())
    return {"message": f"전체 데이터 초기화 완료 ({total}건 삭제)", "deleted": total, "summary": summary}


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

    await _register_test_record(db, "corporate_entities", ce.id)
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

        await _register_test_record(db, "counterparties", cp.id)

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
            cp_uuid = await _get_cp_id_by_name(db, cp_name)
            cp_id = str(cp_uuid) if cp_uuid else None
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
        trade_date_val = row.get("판매일")
        cp_name = row.get("판매처", "")
        voucher_number = row.get("번호", "")
        quantity = int(row.get("수량", 0) or 0)
        purchase_cost = Decimal(str(row.get("매입원가", 0) or 0))
        actual_price = Decimal(str(row.get("실판매가", 0) or 0))
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


# ─── Step 7~9: 은행 임포트 (업로드 → 매칭 → 확정) ─────────

async def step_7_bank_import_upload(db: AsyncSession, user: User, ctx: dict) -> dict:
    """은행 파일 업로드 + 파싱 (BankImportJob/BankImportLine 생성)"""
    file_path = TEST_DATA_DIR / "test_bank_statement.xlsx"
    if not file_path.exists():
        raise FileNotFoundError(f"테스트 파일 없음: {file_path}")

    corp_entity_id = ctx.get("corp_entity_id")
    if not corp_entity_id:
        ce = (await db.execute(select(CorporateEntity.id).limit(1))).scalar()
        corp_entity_id = str(ce) if ce else None

    file_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()

    job = BankImportJob(
        file_path=str(file_path),
        original_filename="test_bank_statement.xlsx",
        file_hash=file_hash,
        corporate_entity_id=uuid.UUID(corp_entity_id) if corp_entity_id else None,
        bank_name="테스트은행",
        account_number="123-456-789",
        status=BankImportJobStatus.UPLOADED,
        total_lines=0,
        matched_lines=0,
        confirmed_lines=0,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    await _register_test_record(db, "bank_import_jobs", job.id)

    rows = _parse_excel_rows(file_path)
    line_num = 0
    deposit_count = 0
    withdrawal_count = 0
    dep_total = Decimal("0")
    wd_total = Decimal("0")
    date_min = None
    date_max = None

    for row in rows:
        txn_date_val = row.get("거래일시")
        description = str(row.get("적요", ""))
        deposit_amt = row.get("입금")
        withdrawal_amt = row.get("출금")
        balance = row.get("거래후잔액")
        sender_receiver = str(row.get("의뢰인/수취인", "") or row.get("의뢰인수취인", "") or "")

        if not txn_date_val:
            continue

        if isinstance(txn_date_val, datetime):
            td = txn_date_val.date()
        elif isinstance(txn_date_val, date):
            td = txn_date_val
        else:
            td = datetime.strptime(str(txn_date_val).split(" ")[0], "%Y-%m-%d").date()

        dep_val = Decimal(str(deposit_amt or 0))
        wd_val = Decimal(str(withdrawal_amt or 0))

        if dep_val > 0:
            amount = dep_val
            deposit_count += 1
            dep_total += dep_val
        elif wd_val > 0:
            amount = -wd_val
            withdrawal_count += 1
            wd_total += wd_val
        else:
            continue

        if date_min is None or td < date_min:
            date_min = td
        if date_max is None or td > date_max:
            date_max = td

        line_num += 1
        dup_key_src = f"{td.isoformat()}|{amount}|{description}"
        dup_key = hashlib.sha256(dup_key_src.encode()).hexdigest()

        line = BankImportLine(
            import_job_id=job.id,
            line_number=line_num,
            transaction_date=td,
            description=description,
            amount=amount,
            balance_after=Decimal(str(balance or 0)) if balance else None,
            counterparty_name_raw=sender_receiver or None,
            sender_receiver=sender_receiver or None,
            status=BankImportLineStatus.UNMATCHED,
            duplicate_key=dup_key,
            raw_data=_serialize_for_json(row),
        )
        db.add(line)

    job.total_lines = line_num
    job.status = BankImportJobStatus.PARSED
    job.completed_at = datetime.utcnow()
    if date_min:
        job.import_date_from = date_min
    if date_max:
        job.import_date_to = date_max
    await db.flush()

    ctx["bank_import_job_id"] = str(job.id)

    return {
        "message": f"은행 파일 업로드 + 파싱 완료: {line_num}건 (입금 {deposit_count}, 출금 {withdrawal_count})",
        "job_id": str(job.id),
        "total_lines": line_num,
        "deposits": deposit_count,
        "withdrawals": withdrawal_count,
        "deposit_total": float(dep_total),
        "withdrawal_total": float(wd_total),
        "status": job.status.value,
        "date_range": f"{date_min} ~ {date_max}" if date_min else None,
    }


async def step_8_bank_import_match(db: AsyncSession, user: User, ctx: dict) -> dict:
    """은행 임포트 자동 매칭 (별칭 기반 거래처 매칭)"""
    job_id = ctx.get("bank_import_job_id")
    if not job_id:
        job_row = (await db.execute(
            select(BankImportJob.id).where(
                BankImportJob.status.in_([BankImportJobStatus.PARSED, BankImportJobStatus.REVIEWING])
            ).order_by(BankImportJob.created_at.desc()).limit(1)
        )).scalar()
        if not job_row:
            raise ValueError("매칭 대상 BankImportJob이 없습니다. Step 7을 먼저 실행하세요.")
        job_id = str(job_row)

    job = await db.get(BankImportJob, uuid.UUID(job_id))
    if not job:
        raise ValueError(f"BankImportJob을 찾을 수 없습니다: {job_id}")

    # 별칭 매핑
    alias_map = {}
    result = await db.execute(
        select(CounterpartyAlias.alias_name, CounterpartyAlias.counterparty_id)
    )
    for alias_name, cp_id in result.all():
        alias_map[alias_name] = cp_id

    # 거래처명 매핑
    cp_name_map = {}
    cp_result = await db.execute(
        select(Counterparty.name, Counterparty.id).where(Counterparty.is_active == True)  # noqa: E712
    )
    for name, cp_id in cp_result.all():
        cp_name_map[name] = cp_id

    lines = (await db.execute(
        select(BankImportLine).where(
            BankImportLine.import_job_id == uuid.UUID(job_id),
            BankImportLine.status == BankImportLineStatus.UNMATCHED,
        )
    )).scalars().all()

    matched = 0
    unmatched_count = 0
    match_details = []

    for line in lines:
        match_name = line.sender_receiver or line.counterparty_name_raw or line.description
        matched_cp_id = None
        confidence = Decimal("0")

        if match_name in alias_map:
            matched_cp_id = alias_map[match_name]
            confidence = Decimal("100")
        elif match_name in cp_name_map:
            matched_cp_id = cp_name_map[match_name]
            confidence = Decimal("100")
        else:
            for alias_name, cp_id in alias_map.items():
                if alias_name in match_name or match_name in alias_name:
                    matched_cp_id = cp_id
                    confidence = Decimal("70")
                    break
            if not matched_cp_id:
                for cp_name, cp_id in cp_name_map.items():
                    if cp_name in match_name or match_name in cp_name:
                        matched_cp_id = cp_id
                        confidence = Decimal("70")
                        break

        if matched_cp_id:
            line.counterparty_id = matched_cp_id
            line.status = BankImportLineStatus.MATCHED
            line.match_confidence = confidence
            matched += 1
            cp = await db.get(Counterparty, matched_cp_id)
            cp_name_str = cp.name if cp else "?"
            match_details.append(f"{match_name} → {cp_name_str} ({confidence}%)")
        else:
            unmatched_count += 1
            match_details.append(f"{match_name} → 미매칭")

    job.matched_lines = matched
    job.status = BankImportJobStatus.REVIEWING
    await db.flush()

    return {
        "message": f"자동 매칭 완료: {matched}건 매칭, {unmatched_count}건 미매칭",
        "matched": matched,
        "unmatched": unmatched_count,
        "total_lines": job.total_lines,
        "match_rate": f"{matched / job.total_lines * 100:.0f}%" if job.total_lines > 0 else "0%",
        "match_details": match_details,
        "job_status": job.status.value,
    }


async def step_9_bank_import_confirm(db: AsyncSession, user: User, ctx: dict) -> dict:
    """은행 임포트 확정 (MATCHED 라인 → CounterpartyTransaction 생성)"""
    job_id = ctx.get("bank_import_job_id")
    if not job_id:
        job_row = (await db.execute(
            select(BankImportJob.id).where(
                BankImportJob.status == BankImportJobStatus.REVIEWING
            ).order_by(BankImportJob.created_at.desc()).limit(1)
        )).scalar()
        if not job_row:
            raise ValueError("확정 대상 BankImportJob이 없습니다. Step 7-8을 먼저 실행하세요.")
        job_id = str(job_row)

    job = await db.get(BankImportJob, uuid.UUID(job_id))
    if not job:
        raise ValueError(f"BankImportJob을 찾을 수 없습니다: {job_id}")

    lines = (await db.execute(
        select(BankImportLine).where(
            BankImportLine.import_job_id == uuid.UUID(job_id),
            BankImportLine.status == BankImportLineStatus.MATCHED,
            BankImportLine.counterparty_id.isnot(None),
        )
    )).scalars().all()

    if not lines:
        return {"message": "확정 가능한 매칭 라인이 없습니다", "confirmed": 0}

    confirmed = 0
    deposits = 0
    withdrawals = 0
    dep_total = Decimal("0")
    wd_total = Decimal("0")
    txn_ids = []

    for line in lines:
        if line.amount > 0:
            txn_type = TransactionType.DEPOSIT
            txn_amount = line.amount
            deposits += 1
            dep_total += txn_amount
        else:
            txn_type = TransactionType.WITHDRAWAL
            txn_amount = abs(line.amount)
            withdrawals += 1
            wd_total += txn_amount

        txn = CounterpartyTransaction(
            counterparty_id=line.counterparty_id,
            corporate_entity_id=job.corporate_entity_id,
            transaction_type=txn_type,
            transaction_date=line.transaction_date,
            amount=txn_amount,
            allocated_amount=Decimal("0"),
            memo=f"{line.description} ({line.sender_receiver})" if line.sender_receiver else line.description,
            source=TransactionSource.BANK_IMPORT,
            bank_import_line_id=line.id,
            status=TransactionStatus.PENDING,
            created_by=user.id,
        )
        db.add(txn)
        await db.flush()

        line.status = BankImportLineStatus.CONFIRMED
        line.transaction_id = txn.id
        txn_ids.append(str(txn.id))
        confirmed += 1

    job.confirmed_lines = confirmed
    job.status = BankImportJobStatus.CONFIRMED
    job.confirmed_at = datetime.utcnow()
    await db.flush()

    ctx["bank_txn_ids"] = txn_ids

    return {
        "message": f"은행 임포트 확정: {confirmed}건 Transaction 생성 (입금 {deposits}, 출금 {withdrawals})",
        "confirmed": confirmed,
        "deposits": deposits,
        "withdrawals": withdrawals,
        "deposit_total": float(dep_total),
        "withdrawal_total": float(wd_total),
        "job_status": job.status.value,
    }


# ─── Step 10: 자동 배분 ──────────────────────────────────

async def step_10_auto_allocate(db: AsyncSession, user: User, ctx: dict) -> dict:
    """은행 입출금 자동 배분"""
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

            for v in vouchers:
                await _update_voucher_status(v.id, db)

            cp = await db.get(Counterparty, txn.counterparty_id)
            cp_name = cp.name if cp else "?"
            details.append(
                f"{cp_name} {txn.transaction_type.value} {txn.amount:,.0f}원 → {alloc_count}건 배분"
            )

    await db.flush()

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


async def step_11_manual_transaction(db: AsyncSession, user: User, ctx: dict) -> dict:
    """수동 입출금 생성 + 자동 배분 (LG전자 출금)"""
    cp_ids = ctx.get("counterparty_ids", {})
    lg_id = cp_ids.get("LG전자")
    if not lg_id:
        lg_uuid = await _get_cp_id_by_name(db, "LG전자")
        if not lg_uuid:
            raise ValueError("LG전자 거래처를 찾을 수 없습니다. Step 3(거래처 등록)을 먼저 실행하세요.")
        lg_id = str(lg_uuid)

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


async def step_12_netting(db: AsyncSession, user: User, ctx: dict) -> dict:
    """삼성전자 상계 생성 + 확정"""
    cp_ids = ctx.get("counterparty_ids", {})
    samsung_id = cp_ids.get("(주)삼성전자")
    if not samsung_id:
        samsung_uuid = await _get_cp_id_by_name(db, "(주)삼성전자")
        if not samsung_uuid:
            raise ValueError("(주)삼성전자 거래처를 찾을 수 없습니다.")
        samsung_id = str(samsung_uuid)

    samsung_uuid = uuid.UUID(samsung_id)

    sales_vouchers = (await db.execute(
        select(Voucher).where(
            Voucher.counterparty_id == samsung_uuid,
            Voucher.voucher_type == VoucherType.SALES,
            Voucher.settlement_status.in_([SettlementStatus.OPEN, SettlementStatus.SETTLING]),
        )
    )).scalars().all()

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

    async def get_remaining(v: Voucher) -> Decimal:
        alloc = (await db.execute(
            select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
            .where(TransactionAllocation.voucher_id == v.id)
        )).scalar() or Decimal("0")
        return v.total_amount - alloc

    purchase_remaining = Decimal("0")
    purchase_details = []
    for pv in purchase_vouchers:
        rem = await get_remaining(pv)
        if rem > 0:
            purchase_remaining += rem
            purchase_details.append((pv, rem))

    netting_amount = purchase_remaining
    if netting_amount <= 0:
        return {"message": "상계 가능 금액이 없습니다", "status": "skip"}

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

    for pv, rem in purchase_details:
        link = NettingVoucherLink(
            netting_record_id=netting.id,
            voucher_id=pv.id,
            netted_amount=rem,
        )
        db.add(link)

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

    netting.status = NettingStatus.CONFIRMED
    netting.confirmed_at = datetime.utcnow()
    netting.confirmed_by = user.id

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


async def step_13_lock(db: AsyncSession, user: User, ctx: dict) -> dict:
    """마감 테스트: 정산완료 전표 일괄 마감 → 1건 해제"""
    settled_sales = (await db.execute(
        select(Voucher).where(
            Voucher.voucher_type == VoucherType.SALES,
            Voucher.settlement_status == SettlementStatus.SETTLED,
        )
    )).scalars().all()

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
        "locked_voucher_ids": locked_ids[:5],
    }


async def step_14_final_check(db: AsyncSession, user: User, ctx: dict) -> dict:
    """최종 플로우 점검 (데이터 정합성 확인)"""
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

    # 은행 임포트 검증
    bi_job_count = (await db.execute(
        select(func.count(BankImportJob.id)).where(
            BankImportJob.status == BankImportJobStatus.CONFIRMED
        )
    )).scalar() or 0
    bi_line_confirmed = (await db.execute(
        select(func.count(BankImportLine.id)).where(
            BankImportLine.status == BankImportLineStatus.CONFIRMED
        )
    )).scalar() or 0
    bi_line_total = (await db.execute(
        select(func.count(BankImportLine.id))
    )).scalar() or 0

    checks = []
    checks.append(("거래처 3개", cp_count == 3, f"실제: {cp_count}"))
    checks.append(("법인 1개", ce_count == 1, f"실제: {ce_count}"))
    checks.append(("별칭 5개", alias_count == 5, f"실제: {alias_count}"))
    checks.append(("판매 전표 7건", sales_count == 7, f"실제: {sales_count}"))
    checks.append(("매입 전표 5건", purchase_count == 5, f"실제: {purchase_count}"))
    checks.append(("은행 임포트 작업 1건(확정)", bi_job_count == 1, f"실제: {bi_job_count}"))
    checks.append(("은행 임포트 라인 확정", bi_line_confirmed > 0, f"확정: {bi_line_confirmed}/{bi_line_total}"))
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
            "bank_import_jobs": bi_job_count,
            "bank_import_lines_confirmed": bi_line_confirmed,
            "bank_import_lines_total": bi_line_total,
        },
    }


# ─── 단계 등록 ─────────────────────────────────────────────

STEPS = {
    1: ("테스트 데이터 초기화", step_1_reset),
    2: ("법인 등록", step_2_corp_entity),
    3: ("거래처 등록 (3곳)", step_3_counterparties),
    4: ("별칭 추가 (은행 매칭용)", step_4_aliases),
    5: ("판매 전표 생성 (7건)", step_5_sales_vouchers),
    6: ("매입 전표 생성 (5건)", step_6_purchase_vouchers),
    7: ("은행 파일 업로드 + 파싱", step_7_bank_import_upload),
    8: ("은행 자동 매칭", step_8_bank_import_match),
    9: ("은행 임포트 확정", step_9_bank_import_confirm),
    10: ("자동 배분 (FIFO)", step_10_auto_allocate),
    11: ("수동 입출금 + 배분", step_11_manual_transaction),
    12: ("상계 생성 + 확정", step_12_netting),
    13: ("마감 + 해제 테스트", step_13_lock),
    14: ("최종 데이터 검증", step_14_final_check),
}

STEP_DESCRIPTIONS: dict[int, dict] = {
    1: {
        "description": "이전 시나리오 테스트에서 생성한 데이터만 삭제합니다. 사용자가 직접 등록한 데이터는 영향받지 않습니다.",
        "checks": [
            "레지스트리에 등록된 테스트 거래처/법인/은행임포트 데이터만 삭제",
            "테스트 데이터에 연결된 전표/입출금/배분/상계도 함께 삭제",
            "사용자 데이터는 보호됨",
        ],
        "depends_on": [],
        "phase": "setup",
    },
    2: {
        "description": "테스트용 법인 'DWT 본사'를 등록합니다.",
        "checks": [
            "법인이 정상적으로 생성되었는지 확인",
            "법인 이름, 사업자번호가 올바른지 확인",
        ],
        "depends_on": [1],
        "phase": "setup",
    },
    3: {
        "description": "3개 거래처(삼성전자, 애플코리아, LG전자)를 등록합니다.",
        "checks": [
            "3개 거래처가 모두 생성되었는지 확인",
            "각 거래처에 자동 별칭이 등록되었는지 확인",
        ],
        "depends_on": [1],
        "phase": "setup",
    },
    4: {
        "description": "은행 거래에서 사용되는 추가 별칭을 등록합니다.",
        "checks": [
            "거래처별 추가 별칭이 등록되었는지 확인",
            "총 별칭 수가 5건인지 확인 (자동 3 + 추가 2)",
        ],
        "depends_on": [3],
        "phase": "setup",
    },
    5: {
        "description": "테스트 엑셀에서 판매 전표 7건을 생성합니다.",
        "checks": [
            "7건의 판매 전표가 생성되었는지 확인",
            "전표 상태가 모두 'OPEN(미정산)'인지 확인",
            "전표 금액이 엑셀 데이터와 일치하는지 확인",
        ],
        "depends_on": [2, 3],
        "phase": "vouchers",
    },
    6: {
        "description": "테스트 엑셀에서 매입 전표 5건을 생성합니다.",
        "checks": [
            "5건의 매입 전표가 생성되었는지 확인",
            "거래처별 매입 금액이 올바른지 확인",
        ],
        "depends_on": [2, 3],
        "phase": "vouchers",
    },
    7: {
        "description": "은행 거래내역 엑셀을 업로드하고 BankImportJob/Line을 생성합니다.",
        "checks": [
            "BankImportJob이 PARSED 상태로 생성되었는지 확인",
            "BankImportLine이 올바르게 파싱되었는지 확인",
            "입금/출금 건수 및 금액이 정확한지 확인",
            "날짜 범위가 설정되었는지 확인",
        ],
        "depends_on": [2],
        "phase": "bank_import",
    },
    8: {
        "description": "파싱된 라인에 대해 거래처 별칭 기반 자동 매칭을 수행합니다.",
        "checks": [
            "별칭 매칭이 올바르게 되었는지 확인",
            "매칭율(%)이 표시되는지 확인",
            "미매칭 건이 있다면 사유 확인",
            "Job 상태가 REVIEWING으로 전환되었는지 확인",
        ],
        "depends_on": [4, 7],
        "phase": "bank_import",
    },
    9: {
        "description": "매칭된 라인을 확정하여 CounterpartyTransaction을 생성합니다.",
        "checks": [
            "MATCHED 라인이 CONFIRMED로 전환되는지 확인",
            "각 라인에 대해 Transaction이 생성되는지 확인",
            "입금/출금 구분이 정확한지 확인",
            "Job 상태가 CONFIRMED로 전환되었는지 확인",
        ],
        "depends_on": [8],
        "phase": "bank_import",
    },
    10: {
        "description": "입금은 판매 전표에, 출금은 매입 전표에 FIFO 방식으로 자동 배분합니다.",
        "checks": [
            "배분이 생성되었는지 확인",
            "입금 → 판매, 출금 → 매입 매칭 확인",
            "전표 상태가 'SETTLING' 또는 'SETTLED'로 변경되었는지 확인",
            "부분 배분 건의 잔액 확인",
        ],
        "depends_on": [5, 6, 9],
        "phase": "settlement",
    },
    11: {
        "description": "수동으로 LG전자 출금을 추가하고 매입 전표에 배분합니다.",
        "checks": [
            "수동 입출금이 정상 생성되었는지 확인",
            "배분이 특정 전표에 올바르게 연결되었는지 확인",
            "배분 후 전표 상태 변경 확인",
        ],
        "depends_on": [10],
        "phase": "settlement",
    },
    12: {
        "description": "삼성전자 채권/채무 상계 → 확정 → 입출금 자동 생성 → 배분을 테스트합니다.",
        "checks": [
            "상계 레코드가 생성되었는지 확인",
            "확정 시 입금/출금이 자동 생성되는지 확인",
            "자동 생성된 입출금이 전표에 배분되는지 확인",
            "미수/미지급 잔액 변동 확인",
        ],
        "depends_on": [10],
        "phase": "settlement",
    },
    13: {
        "description": "정산완료 전표를 일괄 마감(LOCKED) 후 1건 해제까지 테스트합니다.",
        "checks": [
            "마감 처리 정상 실행 확인",
            "마감 전표 상태가 'LOCKED'로 변경 확인",
            "마감 해제 후 상태 복원 확인",
        ],
        "depends_on": [10],
        "phase": "finalize",
    },
    14: {
        "description": "전체 플로우 완료 후 데이터 정합성을 최종 검증합니다.",
        "checks": [
            "전표 총 건수(판매 7 + 매입 5 = 12건) 확인",
            "은행 임포트 작업 확정 상태 확인",
            "은행 임포트 라인 확정 건수 확인",
            "입출금 총 건수 확인",
            "배분 총 건수 및 금액 확인",
            "상태별 전표 건수 확인",
        ],
        "depends_on": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
        "phase": "finalize",
    },
}

PHASES = [
    {"id": "setup", "label": "초기 설정", "description": "테스트 데이터 초기화 및 기초 데이터 설정", "steps": [1, 2, 3, 4]},
    {"id": "vouchers", "label": "전표 생성", "description": "판매/매입 전표 등록", "steps": [5, 6]},
    {"id": "bank_import", "label": "은행 임포트", "description": "은행 파일 업로드 → 매칭 → 확정", "steps": [7, 8, 9]},
    {"id": "settlement", "label": "배분·정산", "description": "자동/수동 배분 및 상계 처리", "steps": [10, 11, 12]},
    {"id": "finalize", "label": "마감·검증", "description": "마감 처리 및 최종 데이터 검증", "steps": [13, 14]},
]


# ─── API 엔드포인트 ─────────────────────────────────────────

@router.post("/scenario/run-step")
async def run_scenario_step(
    data: StepRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """시나리오 테스트 단계 실행"""
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
            message="테스트 단계 실행 중 오류가 발생했습니다.",
            error=traceback.format_exc(),  # 시나리오 러너는 내부 디버그 도구이므로 상세 유지
            context=ctx,
        )


@router.get("/scenario/steps")
async def get_scenario_steps(
    current_user: User = Depends(get_settlement_user),
):
    """시나리오 테스트 단계 목록 조회"""
    return {
        "total_steps": len(STEPS),
        "phases": PHASES,
        "steps": [
            {
                "step": num,
                "name": name,
                **(STEP_DESCRIPTIONS.get(num, {})),
            }
            for num, (name, _) in STEPS.items()
        ],
    }
