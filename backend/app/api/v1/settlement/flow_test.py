"""
정산 시스템 — 전체 업무 플로우 상태 점검 API
각 단계(전표/입출금/배분/매칭/마감)의 데이터 상태를 한번에 수집하여 반환
"""

from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case, literal, delete
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


@router.get("/health-check")
async def flow_health_check(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전체 업무 플로우 상태 점검 — 한눈에 시스템 건강도 파악"""

    checks = []

    # ── 1. 기초 마스터 데이터 ──
    cp_count = (await db.execute(select(func.count(Counterparty.id)))).scalar() or 0
    cp_active = (await db.execute(
        select(func.count(Counterparty.id)).where(Counterparty.is_active == True)
    )).scalar() or 0
    alias_count = (await db.execute(select(func.count(CounterpartyAlias.id)))).scalar() or 0
    ce_count = (await db.execute(select(func.count(CorporateEntity.id)))).scalar() or 0
    branch_count = (await db.execute(select(func.count(Branch.id)))).scalar() or 0

    checks.append({
        "step": "master",
        "title": "기초 마스터 데이터",
        "status": "pass" if cp_count > 0 and ce_count > 0 else "warn",
        "details": {
            "counterparties": cp_count,
            "counterparties_active": cp_active,
            "aliases": alias_count,
            "alias_coverage": round(alias_count / max(cp_active, 1) * 100, 1),
            "corporate_entities": ce_count,
            "branches": branch_count,
        },
        "message": f"거래처 {cp_count}개, 별칭 {alias_count}개, 법인 {ce_count}개"
            + (", 지사 미등록" if branch_count == 0 else f", 지사 {branch_count}개"),
    })

    # ── 2. 전표 현황 ──
    voucher_stats = (await db.execute(
        select(
            Voucher.voucher_type,
            Voucher.settlement_status,
            func.count(Voucher.id),
            func.coalesce(func.sum(Voucher.total_amount), 0),
        ).group_by(Voucher.voucher_type, Voucher.settlement_status)
    )).all()

    v_sales_count = sum(r[2] for r in voucher_stats if r[0] == VoucherType.SALES)
    v_purchase_count = sum(r[2] for r in voucher_stats if r[0] == VoucherType.PURCHASE)
    v_sales_total = sum(r[3] for r in voucher_stats if r[0] == VoucherType.SALES)
    v_purchase_total = sum(r[3] for r in voucher_stats if r[0] == VoucherType.PURCHASE)
    v_open_count = sum(r[2] for r in voucher_stats if r[1] == SettlementStatus.OPEN)
    v_settling_count = sum(r[2] for r in voucher_stats if r[1] == SettlementStatus.SETTLING)
    v_settled_count = sum(r[2] for r in voucher_stats if r[1] == SettlementStatus.SETTLED)
    v_locked_count = sum(r[2] for r in voucher_stats if r[1] == SettlementStatus.LOCKED)

    v_status = "pass" if v_sales_count > 0 else "warn"
    if v_sales_count > 0 and v_purchase_count == 0:
        v_status = "warn"

    checks.append({
        "step": "vouchers",
        "title": "전표 (UPM 업로드)",
        "status": v_status,
        "details": {
            "sales_count": v_sales_count,
            "sales_total": float(v_sales_total),
            "purchase_count": v_purchase_count,
            "purchase_total": float(v_purchase_total),
            "status_open": v_open_count,
            "status_settling": v_settling_count,
            "status_settled": v_settled_count,
            "status_locked": v_locked_count,
        },
        "message": f"판매 {v_sales_count}건({v_sales_total:,.0f}원)"
            + f", 매입 {v_purchase_count}건({v_purchase_total:,.0f}원)"
            + (". 매입 전표 없음 — UPM 매입 업로드 필요" if v_purchase_count == 0 else ""),
    })

    # ── 3. 입출금 현황 ──
    txn_stats = (await db.execute(
        select(
            CounterpartyTransaction.transaction_type,
            CounterpartyTransaction.status,
            CounterpartyTransaction.source,
            func.count(CounterpartyTransaction.id),
            func.coalesce(func.sum(CounterpartyTransaction.amount), 0),
        ).group_by(
            CounterpartyTransaction.transaction_type,
            CounterpartyTransaction.status,
            CounterpartyTransaction.source,
        )
    )).all()

    active_statuses = {TransactionStatus.PENDING, TransactionStatus.PARTIAL, TransactionStatus.ALLOCATED}
    dep_active = sum(r[4] for r in txn_stats if r[0] == TransactionType.DEPOSIT and r[1] in active_statuses)
    dep_active_cnt = sum(r[3] for r in txn_stats if r[0] == TransactionType.DEPOSIT and r[1] in active_statuses)
    wd_active = sum(r[4] for r in txn_stats if r[0] == TransactionType.WITHDRAWAL and r[1] in active_statuses)
    wd_active_cnt = sum(r[3] for r in txn_stats if r[0] == TransactionType.WITHDRAWAL and r[1] in active_statuses)
    cancelled_cnt = sum(r[3] for r in txn_stats if r[1] == TransactionStatus.CANCELLED)

    by_source = {}
    for r in txn_stats:
        src = r[2].value if hasattr(r[2], 'value') else str(r[2])
        by_source[src] = by_source.get(src, 0) + r[3]

    t_status = "pass" if dep_active_cnt > 0 or wd_active_cnt > 0 else "warn"

    checks.append({
        "step": "transactions",
        "title": "입출금 이벤트",
        "status": t_status,
        "details": {
            "deposit_active_count": dep_active_cnt,
            "deposit_active_total": float(dep_active),
            "withdrawal_active_count": wd_active_cnt,
            "withdrawal_active_total": float(wd_active),
            "cancelled_count": cancelled_cnt,
            "by_source": by_source,
        },
        "message": f"입금 {dep_active_cnt}건({dep_active:,.0f}원)"
            + f", 출금 {wd_active_cnt}건({wd_active:,.0f}원)"
            + (f", 취소 {cancelled_cnt}건" if cancelled_cnt > 0 else ""),
    })

    # ── 4. 배분 현황 ──
    alloc_count = (await db.execute(select(func.count(TransactionAllocation.id)))).scalar() or 0
    alloc_total = (await db.execute(
        select(func.coalesce(func.sum(TransactionAllocation.allocated_amount), 0))
    )).scalar() or Decimal("0")

    pending_txn_count = sum(r[3] for r in txn_stats if r[1] == TransactionStatus.PENDING)

    a_status = "pass" if alloc_count > 0 else ("warn" if pending_txn_count > 0 else "info")

    checks.append({
        "step": "allocations",
        "title": "배분 (입출금 ↔ 전표 연결)",
        "status": a_status,
        "details": {
            "allocation_count": alloc_count,
            "allocation_total": float(alloc_total),
            "pending_transactions": pending_txn_count,
        },
        "message": f"배분 {alloc_count}건({alloc_total:,.0f}원)"
            + (f", 미배분 트랜잭션 {pending_txn_count}건" if pending_txn_count > 0 else ""),
    })

    # ── 5. 은행 임포트 ──
    bij_stats = (await db.execute(
        select(
            BankImportJob.status,
            func.count(BankImportJob.id),
            func.coalesce(func.sum(BankImportJob.total_lines), 0),
            func.coalesce(func.sum(BankImportJob.matched_lines), 0),
            func.coalesce(func.sum(BankImportJob.confirmed_lines), 0),
        ).group_by(BankImportJob.status)
    )).all()

    bij_total_jobs = sum(r[1] for r in bij_stats)
    bij_total_lines = sum(r[2] for r in bij_stats)
    bij_confirmed_lines = sum(r[4] for r in bij_stats)
    bij_reviewing = sum(r[1] for r in bij_stats
                        if r[0] in (BankImportJobStatus.REVIEWING, BankImportJobStatus.PARSED))

    b_status = "pass" if bij_total_jobs > 0 else "info"
    if bij_reviewing > 0:
        b_status = "warn"

    checks.append({
        "step": "bank_import",
        "title": "은행 임포트",
        "status": b_status,
        "details": {
            "total_jobs": bij_total_jobs,
            "total_lines": bij_total_lines,
            "confirmed_lines": bij_confirmed_lines,
            "reviewing_jobs": bij_reviewing,
        },
        "message": f"작업 {bij_total_jobs}건, 라인 {bij_total_lines}건"
            + (f", 검수 대기 {bij_reviewing}건" if bij_reviewing > 0 else "")
            + (f", 확정 {bij_confirmed_lines}건" if bij_confirmed_lines > 0 else ""),
    })

    # ── 6. 미수/미지급 ──
    receivable = float(v_sales_total) - float(dep_active)
    payable = float(v_purchase_total) - float(wd_active)

    r_status = "pass"
    r_msg_parts = []
    if receivable > 0:
        r_msg_parts.append(f"미수 {receivable:,.0f}원")
    elif receivable < 0:
        r_msg_parts.append(f"초과수금 {abs(receivable):,.0f}원")
        r_status = "warn"
    if payable > 0:
        r_msg_parts.append(f"미지급 {payable:,.0f}원")
    elif payable < 0:
        r_msg_parts.append(f"초과지급 {abs(payable):,.0f}원")
        r_status = "warn"

    checks.append({
        "step": "balance",
        "title": "미수/미지급 잔액",
        "status": r_status,
        "details": {
            "receivable": receivable,
            "payable": payable,
            "overpaid": payable < 0,
            "overcollected": receivable < 0,
        },
        "message": " / ".join(r_msg_parts) if r_msg_parts else "잔액 없음",
    })

    # ── 7. 레거시 데이터 ──
    legacy_receipt = (await db.execute(select(func.count(Receipt.id)))).scalar() or 0
    legacy_payment = (await db.execute(select(func.count(Payment.id)))).scalar() or 0

    l_status = "pass" if legacy_receipt == 0 and legacy_payment == 0 else "warn"
    checks.append({
        "step": "legacy",
        "title": "레거시 데이터 (Receipt/Payment)",
        "status": l_status,
        "details": {
            "receipts": legacy_receipt,
            "payments": legacy_payment,
        },
        "message": "레거시 데이터 없음 (정상)" if l_status == "pass"
            else f"Receipt {legacy_receipt}건, Payment {legacy_payment}건 — 신규 Transaction으로 마이그레이션 권장",
    })

    # ── 전체 등급 ──
    statuses = [c["status"] for c in checks]
    overall = "fail" if "fail" in statuses else ("warn" if "warn" in statuses else "pass")

    return {
        "overall": overall,
        "checks": checks,
        "summary": {
            "counterparties": cp_count,
            "vouchers": v_sales_count + v_purchase_count,
            "transactions": dep_active_cnt + wd_active_cnt,
            "allocations": alloc_count,
            "bank_import_jobs": bij_total_jobs,
        },
    }


@router.delete("/reset-all")
async def reset_all_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """전체 정산 데이터 초기화 — 모든 정산 관련 테이블 데이터 삭제

    FK 제약 조건을 고려한 순서로 삭제합니다.
    주의: 이 작업은 되돌릴 수 없습니다.
    """
    summary = {}

    # FK 의존성 역순으로 삭제 (자식 → 부모)

    # 1. 배분 (transaction_allocations)
    r = await db.execute(delete(TransactionAllocation))
    summary["transaction_allocations"] = r.rowcount

    # 2. 상계-전표 매핑
    r = await db.execute(delete(NettingVoucherLink))
    summary["netting_voucher_links"] = r.rowcount

    # 3. 상계 기록
    r = await db.execute(delete(NettingRecord))
    summary["netting_records"] = r.rowcount

    # 4. 은행 임포트 라인 → 작업
    r = await db.execute(delete(BankImportLine))
    summary["bank_import_lines"] = r.rowcount

    r = await db.execute(delete(BankImportJob))
    summary["bank_import_jobs"] = r.rowcount

    # 5. 레거시 입금/송금
    r = await db.execute(delete(Receipt))
    summary["receipts"] = r.rowcount

    r = await db.execute(delete(Payment))
    summary["payments"] = r.rowcount

    # 6. 전표 변경 요청
    r = await db.execute(delete(VoucherChangeRequest))
    summary["voucher_change_requests"] = r.rowcount

    # 7. 전표
    r = await db.execute(delete(Voucher))
    summary["vouchers"] = r.rowcount

    # 8. 입출금 이벤트
    r = await db.execute(delete(CounterpartyTransaction))
    summary["counterparty_transactions"] = r.rowcount

    # 9. 거래처 관련 (별칭 → 즐겨찾기 → 거래처)
    r = await db.execute(delete(CounterpartyAlias))
    summary["counterparty_aliases"] = r.rowcount

    r = await db.execute(delete(UserCounterpartyFavorite))
    summary["user_counterparty_favorites"] = r.rowcount

    r = await db.execute(delete(Counterparty))
    summary["counterparties"] = r.rowcount

    # 10. 법인
    r = await db.execute(delete(CorporateEntity))
    summary["corporate_entities"] = r.rowcount

    # 11. 지사 (소프트 삭제 포함 전체 제거)
    r = await db.execute(delete(Branch))
    summary["branches"] = r.rowcount

    # 12. 기간 마감
    r = await db.execute(delete(PeriodLock))
    summary["period_locks"] = r.rowcount

    # 13. 업로드 템플릿
    r = await db.execute(delete(UploadTemplate))
    summary["upload_templates"] = r.rowcount

    # 14. 업로드 작업
    r = await db.execute(delete(UploadJob))
    summary["upload_jobs"] = r.rowcount

    # 15. 감사로그 (정산 관련만)
    r = await db.execute(
        delete(AuditLog).where(AuditLog.action.in_(SETTLEMENT_ACTIONS))
    )
    summary["audit_logs"] = r.rowcount

    await db.commit()

    total_deleted = sum(summary.values())
    return {
        "total_deleted": total_deleted,
        "summary": summary,
    }
