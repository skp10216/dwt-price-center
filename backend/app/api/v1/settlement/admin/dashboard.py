"""
정산 관리자 - 운영 대시보드 API
핵심 KPI, 업무 진행 현황, 이상 징후 경고
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.user import User
from app.models.enums import (
    VoucherType, SettlementStatus, PaymentStatus,
    TransactionStatus, JobStatus, NettingStatus,
)

router = APIRouter()


@router.get("/kpi")
async def get_admin_kpi(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """운영 대시보드 핵심 KPI"""

    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    # 전표 현황
    voucher_stats = (await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE created_at >= :month_start) AS this_month,
            COUNT(*) FILTER (WHERE voucher_type = 'SALES') AS sales_count,
            COUNT(*) FILTER (WHERE voucher_type = 'PURCHASE') AS purchase_count,
            COALESCE(SUM(total_amount) FILTER (WHERE voucher_type = 'SALES'), 0) AS sales_total,
            COALESCE(SUM(total_amount) FILTER (WHERE voucher_type = 'PURCHASE'), 0) AS purchase_total
        FROM vouchers
    """), {"month_start": month_start})).mappings().first()

    # 미정산 잔액
    unsettled = (await db.execute(text("""
        SELECT
            COALESCE(SUM(total_amount) FILTER (
                WHERE voucher_type = 'SALES' AND settlement_status IN ('OPEN', 'SETTLING')
            ), 0) AS receivable,
            COALESCE(SUM(total_amount) FILTER (
                WHERE voucher_type = 'PURCHASE' AND payment_status IN ('UNPAID', 'PARTIAL')
            ), 0) AS payable
        FROM vouchers
    """))).mappings().first()

    # 입출금 현황
    txn_stats = (await db.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
            COUNT(*) FILTER (WHERE status = 'PARTIAL') AS partial_count,
            COUNT(*) FILTER (WHERE status = 'ALLOCATED') AS allocated_count,
            COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DEPOSIT'), 0) AS deposit_total,
            COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'WITHDRAWAL'), 0) AS withdrawal_total,
            COALESCE(SUM(allocated_amount), 0) AS allocated_total,
            COALESCE(SUM(amount), 0) AS amount_total
        FROM counterparty_transactions
        WHERE status NOT IN ('CANCELLED', 'HIDDEN')
    """))).mappings().first()

    allocation_rate = 0
    if txn_stats["amount_total"] > 0:
        allocation_rate = round(
            float(txn_stats["allocated_total"]) / float(txn_stats["amount_total"]) * 100, 1
        )

    # 활성 사용자 (최근 7일)
    active_users = (await db.execute(text(
        "SELECT COUNT(*) FROM users WHERE is_active = true AND last_login_at >= :week_ago"
    ), {"week_ago": week_ago})).scalar() or 0

    total_users = (await db.execute(text(
        "SELECT COUNT(*) FROM users WHERE is_active = true"
    ))).scalar() or 0

    # Worker 대기 Job
    pending_jobs = (await db.execute(text(
        "SELECT COUNT(*) FROM upload_jobs WHERE status IN ('QUEUED', 'RUNNING')"
    ))).scalar() or 0

    failed_jobs = (await db.execute(text(
        "SELECT COUNT(*) FROM upload_jobs WHERE status = 'FAILED'"
    ))).scalar() or 0

    return {
        "vouchers": {
            "total": voucher_stats["total"],
            "this_month": voucher_stats["this_month"],
            "sales_count": voucher_stats["sales_count"],
            "purchase_count": voucher_stats["purchase_count"],
            "sales_total": str(voucher_stats["sales_total"]),
            "purchase_total": str(voucher_stats["purchase_total"]),
        },
        "unsettled": {
            "receivable": str(unsettled["receivable"]),
            "payable": str(unsettled["payable"]),
        },
        "transactions": {
            "total": txn_stats["total"],
            "pending": txn_stats["pending_count"],
            "partial": txn_stats["partial_count"],
            "allocated": txn_stats["allocated_count"],
            "deposit_total": str(txn_stats["deposit_total"]),
            "withdrawal_total": str(txn_stats["withdrawal_total"]),
            "allocation_rate": allocation_rate,
        },
        "users": {
            "active_7d": active_users,
            "total_active": total_users,
        },
        "jobs": {
            "pending": pending_jobs,
            "failed": failed_jobs,
        },
    }


@router.get("/alerts")
async def get_admin_alerts(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """이상 징후 경고 목록"""
    from app.api.v1.settlement.helpers import run_full_integrity_check

    alerts = []
    now = datetime.utcnow()

    # 1. 정합성 검증 (별도 세션으로 격리)
    try:
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as integrity_db:
            integrity = await run_full_integrity_check(integrity_db)
            if not integrity["is_consistent"]:
                issues = []
                if not integrity["transaction_allocation"]["is_consistent"]:
                    issues.append(f"입출금-배분 불일치 {len(integrity['transaction_allocation']['mismatches'])}건")
                if not integrity["voucher_balance"]["is_consistent"]:
                    issues.append(f"전표 초과배분 {len(integrity['voucher_balance']['over_allocated'])}건")
                if not integrity["netting_balance"]["is_consistent"]:
                    issues.append(f"상계 불일치 {len(integrity['netting_balance']['mismatches'])}건")
                alerts.append({
                    "type": "integrity",
                    "severity": "high",
                    "title": "데이터 정합성 이상",
                    "description": ", ".join(issues),
                    "link": "/settlement/admin/integrity",
                })
    except Exception:
        pass

    # 2. 실패 Job
    failed_count = (await db.execute(text(
        "SELECT COUNT(*) FROM upload_jobs WHERE status = 'FAILED'"
    ))).scalar() or 0
    if failed_count > 0:
        alerts.append({
            "type": "job_failure",
            "severity": "medium",
            "title": f"실패 작업 {failed_count}건",
            "description": "업로드 작업 중 실패한 건이 있습니다. 재시도가 필요합니다.",
            "link": "/settlement/upload/jobs",
        })

    # 3. 7일 이상 미배분 입출금
    old_pending = (await db.execute(text("""
        SELECT COUNT(*) FROM counterparty_transactions
        WHERE status IN ('PENDING', 'PARTIAL')
          AND created_at < :threshold
    """), {"threshold": now - timedelta(days=7)})).scalar() or 0
    if old_pending > 0:
        alerts.append({
            "type": "old_pending",
            "severity": "medium",
            "title": f"장기 미배분 {old_pending}건",
            "description": "7일 이상 배분되지 않은 입출금이 있습니다.",
            "link": "/settlement/transactions",
        })

    # 4. 최근 24시간 대량 삭제
    bulk_deletes = (await db.execute(text("""
        SELECT user_id, COUNT(*) AS cnt
        FROM audit_logs
        WHERE action::text LIKE '%DELETE%'
          AND created_at >= :threshold
        GROUP BY user_id
        HAVING COUNT(*) >= 10
    """), {"threshold": now - timedelta(hours=24)})).all()
    if bulk_deletes:
        alerts.append({
            "type": "bulk_delete",
            "severity": "high",
            "title": f"대량 삭제 감지 ({len(bulk_deletes)}명)",
            "description": "최근 24시간 내 대량 삭제 작업이 감지되었습니다.",
            "link": "/settlement/admin/audit",
        })

    # 5. 은행 임포트 미검토
    unreviewed_imports = (await db.execute(text("""
        SELECT COUNT(*) FROM bank_import_jobs WHERE status IN ('UPLOADED', 'PARSED', 'REVIEWING')
    """))).scalar() or 0
    if unreviewed_imports > 0:
        alerts.append({
            "type": "unreviewed_import",
            "severity": "low",
            "title": f"미검토 은행 임포트 {unreviewed_imports}건",
            "description": "확인이 필요한 은행 임포트가 있습니다.",
            "link": "/settlement/bank-import",
        })

    return {"alerts": alerts, "total": len(alerts)}


@router.get("/work-status")
async def get_work_status(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """업무 진행 현황 (업로드/마감/배분 상태 분포)"""

    # 업로드 상태 분포
    upload_stats = (await db.execute(text("""
        SELECT status, COUNT(*) AS cnt
        FROM upload_jobs
        GROUP BY status
    """))).all()
    upload_dist = {row[0]: row[1] for row in upload_stats}

    # 마감 현황 (최근 6개월)
    lock_stats = (await db.execute(text("""
        SELECT year_month, status
        FROM period_locks
        ORDER BY year_month DESC
        LIMIT 6
    """))).all()
    locks = [{"year_month": row[0], "status": row[1]} for row in lock_stats]

    # 전표 상태 분포
    voucher_status = (await db.execute(text("""
        SELECT
            voucher_type,
            CASE
                WHEN voucher_type = 'SALES' THEN settlement_status::text
                ELSE payment_status::text
            END AS status,
            COUNT(*) AS cnt
        FROM vouchers
        GROUP BY voucher_type,
            CASE
                WHEN voucher_type = 'SALES' THEN settlement_status::text
                ELSE payment_status::text
            END
    """))).all()
    voucher_dist = [
        {"voucher_type": row[0], "status": row[1], "count": row[2]}
        for row in voucher_status
    ]

    # 입출금 상태 분포
    txn_status = (await db.execute(text("""
        SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
        FROM counterparty_transactions
        WHERE status NOT IN ('CANCELLED', 'HIDDEN')
        GROUP BY status
    """))).all()
    txn_dist = [
        {"status": row[0], "count": row[1], "total": str(row[2])}
        for row in txn_status
    ]

    return {
        "uploads": upload_dist,
        "locks": locks,
        "voucher_status": voucher_dist,
        "transaction_status": txn_dist,
    }
