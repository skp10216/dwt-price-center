"""
정산 도메인 - 작업 내역 API
정산 관련 모든 감사로그를 인증된 사용자에게 제공
"""

from typing import Optional
from datetime import datetime
import uuid as uuid_lib

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, and_, cast, String, case, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction

router = APIRouter()

# 정산 도메인에 해당하는 액션 목록
SETTLEMENT_ACTIONS = [
    # 업로드
    AuditAction.UPLOAD_START,
    AuditAction.UPLOAD_COMPLETE,
    AuditAction.UPLOAD_REVIEW,
    AuditAction.UPLOAD_CONFIRM,
    AuditAction.UPLOAD_APPLY,
    AuditAction.UPLOAD_DELETE,
    AuditAction.UPLOAD_TEMPLATE_CREATE,
    AuditAction.UPLOAD_TEMPLATE_UPDATE,
    # 전표
    AuditAction.VOUCHER_CREATE,
    AuditAction.VOUCHER_UPDATE,
    AuditAction.VOUCHER_DELETE,
    AuditAction.VOUCHER_UPSERT,
    # 마감
    AuditAction.VOUCHER_LOCK,
    AuditAction.VOUCHER_UNLOCK,
    AuditAction.VOUCHER_BATCH_LOCK,
    AuditAction.VOUCHER_BATCH_UNLOCK,
    # 입금 / 지급
    AuditAction.RECEIPT_CREATE,
    AuditAction.RECEIPT_DELETE,
    AuditAction.PAYMENT_CREATE,
    AuditAction.PAYMENT_DELETE,
    # 거래처
    AuditAction.COUNTERPARTY_CREATE,
    AuditAction.COUNTERPARTY_UPDATE,
    AuditAction.COUNTERPARTY_DELETE,
    AuditAction.COUNTERPARTY_BATCH_CREATE,
    AuditAction.COUNTERPARTY_BATCH_DELETE,
    AuditAction.COUNTERPARTY_ALIAS_CREATE,
    AuditAction.COUNTERPARTY_ALIAS_DELETE,
    # 지사
    AuditAction.BRANCH_CREATE,
    AuditAction.BRANCH_UPDATE,
    AuditAction.BRANCH_DELETE,
    AuditAction.BRANCH_RESTORE,
    # 변경 감지 / 승인
    AuditAction.VOUCHER_CHANGE_DETECTED,
    AuditAction.VOUCHER_CHANGE_APPROVED,
    AuditAction.VOUCHER_CHANGE_REJECTED,
]

# 카테고리별 액션 그룹
CATEGORY_ACTIONS = {
    "upload": [
        AuditAction.UPLOAD_START, AuditAction.UPLOAD_COMPLETE,
        AuditAction.UPLOAD_REVIEW, AuditAction.UPLOAD_CONFIRM,
        AuditAction.UPLOAD_APPLY, AuditAction.UPLOAD_DELETE,
        AuditAction.UPLOAD_TEMPLATE_CREATE, AuditAction.UPLOAD_TEMPLATE_UPDATE,
    ],
    "voucher": [
        AuditAction.VOUCHER_CREATE, AuditAction.VOUCHER_UPDATE,
        AuditAction.VOUCHER_DELETE, AuditAction.VOUCHER_UPSERT,
    ],
    "lock": [
        AuditAction.VOUCHER_LOCK, AuditAction.VOUCHER_UNLOCK,
        AuditAction.VOUCHER_BATCH_LOCK, AuditAction.VOUCHER_BATCH_UNLOCK,
    ],
    "payment": [
        AuditAction.RECEIPT_CREATE, AuditAction.RECEIPT_DELETE,
        AuditAction.PAYMENT_CREATE, AuditAction.PAYMENT_DELETE,
    ],
    "counterparty": [
        AuditAction.COUNTERPARTY_CREATE, AuditAction.COUNTERPARTY_UPDATE,
        AuditAction.COUNTERPARTY_DELETE, AuditAction.COUNTERPARTY_BATCH_CREATE,
        AuditAction.COUNTERPARTY_BATCH_DELETE, AuditAction.COUNTERPARTY_ALIAS_CREATE,
        AuditAction.COUNTERPARTY_ALIAS_DELETE,
        AuditAction.BRANCH_CREATE, AuditAction.BRANCH_UPDATE,
        AuditAction.BRANCH_DELETE, AuditAction.BRANCH_RESTORE,
    ],
    "change": [
        AuditAction.VOUCHER_CHANGE_DETECTED,
        AuditAction.VOUCHER_CHANGE_APPROVED,
        AuditAction.VOUCHER_CHANGE_REJECTED,
    ],
}

# 대표 행 우선순위: 일괄 처리 액션을 대표로 선택 (0 = 높은 우선순위)
BATCH_PRIORITY_ACTIONS = [
    AuditAction.COUNTERPARTY_BATCH_CREATE,
    AuditAction.COUNTERPARTY_BATCH_DELETE,
    AuditAction.VOUCHER_BATCH_LOCK,
    AuditAction.VOUCHER_BATCH_UNLOCK,
    AuditAction.UPLOAD_APPLY,
    AuditAction.UPLOAD_COMPLETE,
    AuditAction.UPLOAD_CONFIRM,
]


def _build_log_dict(log: AuditLog, item_count: int = 1) -> dict:
    return {
        "id": str(log.id),
        "trace_id": str(log.trace_id) if log.trace_id else None,
        "user_id": str(log.user_id) if log.user_id else None,
        "user_name": log.user.name if log.user else None,
        "user_email": log.user.email if log.user else None,
        "action": log.action.name if log.action else None,
        "target_type": log.target_type,
        "target_id": str(log.target_id) if log.target_id else None,
        "before_data": log.before_data,
        "after_data": log.after_data,
        "description": log.description,
        "ip_address": log.ip_address,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "item_count": item_count,
    }


@router.get("", response_model=dict)
async def list_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None, description="upload|voucher|lock|payment|counterparty|change"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    정산 작업 내역 조회 (인증된 사용자 전용)
    - 같은 trace_id의 로그는 1건으로 그룹핑 (일괄 처리 대응)
    - 카테고리/기간/검색어 필터 지원
    """
    # 카테고리 필터
    if category and category in CATEGORY_ACTIONS:
        action_filter = CATEGORY_ACTIONS[category]
    else:
        action_filter = SETTLEMENT_ACTIONS

    base_conditions = [AuditLog.action.in_(action_filter)]

    if start_date:
        # timezone-aware → naive UTC (DB 컬럼이 TIMESTAMP WITHOUT TIME ZONE)
        naive_start = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        base_conditions.append(AuditLog.created_at >= naive_start)
    if end_date:
        naive_end = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date
        base_conditions.append(AuditLog.created_at <= naive_end)
    if search:
        base_conditions.append(AuditLog.description.ilike(f"%{search}%"))

    where_clause = and_(*base_conditions)

    # ── 그룹키: trace_id가 있으면 trace_id 기준, 없으면 log.id 기준 ──
    group_key_expr = case(
        (AuditLog.trace_id.isnot(None), cast(AuditLog.trace_id, String)),
        else_=cast(AuditLog.id, String),
    )

    # 일괄 처리 액션을 대표로 우선 선택 (0 = 우선, 1 = 일반)
    priority_expr = case(
        (AuditLog.action.in_(BATCH_PRIORITY_ACTIONS), 0),
        else_=1,
    )

    # 윈도우 함수로 그룹 내 순위 및 건수 계산
    base_subq = (
        select(
            AuditLog.id.label("log_id"),
            AuditLog.created_at.label("log_created_at"),
            group_key_expr.label("group_key"),
            func.row_number()
            .over(
                partition_by=group_key_expr,
                order_by=[priority_expr.asc(), AuditLog.created_at.asc()],
            )
            .label("rn"),
            func.count()
            .over(partition_by=group_key_expr)
            .label("item_count"),
        )
        .where(where_clause)
    ).subquery("base_subq")

    # 그룹당 대표 1건만 선택
    rep_subq = (
        select(
            base_subq.c.log_id,
            base_subq.c.log_created_at,
            base_subq.c.item_count,
        ).where(base_subq.c.rn == 1)
    ).subquery("rep_subq")

    # 전체 그룹 수
    total_result = await db.execute(select(func.count()).select_from(rep_subq))
    total = total_result.scalar()

    # 페이지네이션
    offset = (page - 1) * page_size
    rep_result = await db.execute(
        select(rep_subq.c.log_id, rep_subq.c.item_count)
        .order_by(rep_subq.c.log_created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rep_rows = rep_result.all()

    if not rep_rows:
        return {"logs": [], "total": total, "page": page, "page_size": page_size}

    rep_ids = [r.log_id for r in rep_rows]
    item_counts = {str(r.log_id): r.item_count for r in rep_rows}

    # 대표 로그 + 사용자 정보 로드
    logs_result = await db.execute(
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .where(AuditLog.id.in_(rep_ids))
    )
    logs_by_id = {str(log.id): log for log in logs_result.scalars().all()}

    # 순서 보존
    items = []
    for rid in rep_ids:
        log = logs_by_id.get(str(rid))
        if not log:
            continue
        cnt = item_counts.get(str(rid), 1)
        items.append(_build_log_dict(log, cnt))

    return {"logs": items, "total": total, "page": page, "page_size": page_size}


@router.get("/trace/{trace_id}", response_model=dict)
async def get_trace_logs(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """특정 trace_id의 모든 작업 내역 (일괄 처리 상세 조회)"""
    try:
        trace_uuid = uuid_lib.UUID(trace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="올바르지 않은 trace_id 형식입니다.")

    result = await db.execute(
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .where(AuditLog.trace_id == trace_uuid)
        .order_by(AuditLog.created_at.asc())
    )
    logs = result.scalars().all()

    items = [
        {
            "id": str(log.id),
            "action": log.action.name if log.action else None,
            "user_name": log.user.name if log.user else None,
            "target_type": log.target_type,
            "target_id": str(log.target_id) if log.target_id else None,
            "before_data": log.before_data,
            "after_data": log.after_data,
            "description": log.description,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]

    return {"logs": items, "total": len(items)}


@router.delete("/clear", response_model=dict)
async def clear_activity_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """테스트용: 정산 관련 모든 작업 내역 삭제"""
    result = await db.execute(
        delete(AuditLog).where(AuditLog.action.in_(SETTLEMENT_ACTIONS))
    )
    await db.commit()
    return {"deleted_count": result.rowcount}
