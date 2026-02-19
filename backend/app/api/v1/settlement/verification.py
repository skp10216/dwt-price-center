"""
정산 도메인 - 검증/승인
변경 감지 승인/거부 + 미매칭 거래처 별칭 매핑
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_redis
from app.api.deps import get_current_user
from app.models.user import User
from app.models.upload_job import UploadJob
from app.models.voucher_change import VoucherChangeRequest
from app.models.voucher import Voucher
from app.models.counterparty import Counterparty, CounterpartyAlias
from app.models.enums import ChangeRequestStatus, AuditAction, JobStatus, JobType
from app.models.audit_log import AuditLog
from app.schemas.settlement import (
    ChangeRequestResponse, ChangeRequestReview,
    UnmatchedCounterparty, UnmatchedMapRequest,
)

from datetime import datetime
from decimal import Decimal
import json

import redis.asyncio as aioredis

router = APIRouter()


# ============================================================================
# 변경 감지 / 승인
# ============================================================================

@router.get("/changes", response_model=dict)
async def list_change_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """변경 요청 목록"""
    query = select(VoucherChangeRequest)
    if status_filter:
        query = query.where(VoucherChangeRequest.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(VoucherChangeRequest.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    # Enrich with voucher info
    responses = []
    for cr in items:
        v = await db.get(Voucher, cr.voucher_id)
        cp_name = None
        trade_date = None
        v_number = None
        if v:
            cp = await db.get(Counterparty, v.counterparty_id)
            cp_name = cp.name if cp else None
            trade_date = v.trade_date
            v_number = v.voucher_number

        responses.append(ChangeRequestResponse(
            id=cr.id,
            voucher_id=cr.voucher_id,
            voucher_number=v_number,
            counterparty_name=cp_name,
            trade_date=trade_date,
            upload_job_id=cr.upload_job_id,
            before_data=cr.before_data,
            after_data=cr.after_data,
            diff_summary=cr.diff_summary,
            status=cr.status.value if hasattr(cr.status, 'value') else cr.status,
            reviewed_by=cr.reviewed_by,
            review_memo=cr.review_memo,
            created_at=cr.created_at,
            reviewed_at=cr.reviewed_at,
        ))

    return {
        "changes": responses,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/changes/{change_id}/approve", response_model=ChangeRequestResponse)
async def approve_change(
    change_id: UUID,
    data: ChangeRequestReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """변경 요청 승인 → 전표에 반영"""
    cr = await db.get(VoucherChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="변경 요청을 찾을 수 없습니다")
    if cr.status != ChangeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="대기 상태의 변경 요청만 승인할 수 있습니다")

    # 전표에 after_data 반영
    v = await db.get(Voucher, cr.voucher_id)
    if v and cr.after_data:
        for field, value in cr.after_data.items():
            if hasattr(v, field) and value is not None:
                if isinstance(value, (int, float)):
                    value = Decimal(str(value))
                setattr(v, field, value)

    cr.status = ChangeRequestStatus.APPROVED
    cr.reviewed_by = current_user.id
    cr.review_memo = data.review_memo
    cr.reviewed_at = datetime.utcnow()

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_CHANGE_APPROVED,
        target_type="voucher_change_request",
        target_id=cr.id,
        after_data={"voucher_id": str(cr.voucher_id)},
    ))

    await db.flush()

    vr = await db.get(Voucher, cr.voucher_id)
    cp = await db.get(Counterparty, vr.counterparty_id) if vr else None

    return ChangeRequestResponse(
        id=cr.id,
        voucher_id=cr.voucher_id,
        voucher_number=vr.voucher_number if vr else None,
        counterparty_name=cp.name if cp else None,
        trade_date=vr.trade_date if vr else None,
        upload_job_id=cr.upload_job_id,
        before_data=cr.before_data,
        after_data=cr.after_data,
        diff_summary=cr.diff_summary,
        status=cr.status.value,
        reviewed_by=cr.reviewed_by,
        review_memo=cr.review_memo,
        created_at=cr.created_at,
        reviewed_at=cr.reviewed_at,
    )


@router.post("/changes/{change_id}/reject", response_model=ChangeRequestResponse)
async def reject_change(
    change_id: UUID,
    data: ChangeRequestReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """변경 요청 거부"""
    cr = await db.get(VoucherChangeRequest, change_id)
    if not cr:
        raise HTTPException(status_code=404, detail="변경 요청을 찾을 수 없습니다")
    if cr.status != ChangeRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="대기 상태의 변경 요청만 거부할 수 있습니다")

    cr.status = ChangeRequestStatus.REJECTED
    cr.reviewed_by = current_user.id
    cr.review_memo = data.review_memo
    cr.reviewed_at = datetime.utcnow()

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.VOUCHER_CHANGE_REJECTED,
        target_type="voucher_change_request",
        target_id=cr.id,
    ))

    await db.flush()

    vr = await db.get(Voucher, cr.voucher_id)
    cp = await db.get(Counterparty, vr.counterparty_id) if vr else None

    return ChangeRequestResponse(
        id=cr.id,
        voucher_id=cr.voucher_id,
        voucher_number=vr.voucher_number if vr else None,
        counterparty_name=cp.name if cp else None,
        trade_date=vr.trade_date if vr else None,
        upload_job_id=cr.upload_job_id,
        before_data=cr.before_data,
        after_data=cr.after_data,
        diff_summary=cr.diff_summary,
        status=cr.status.value,
        reviewed_by=cr.reviewed_by,
        review_memo=cr.review_memo,
        created_at=cr.created_at,
        reviewed_at=cr.reviewed_at,
    )


# ============================================================================
# 미매칭 거래처 처리 (별칭 매핑) — Redis에서 수집
# ============================================================================

@router.get("/unmatched", response_model=dict)
async def list_unmatched_counterparties(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """미매칭 거래처 목록 (미확정 Job들에서 수집)"""
    # 미확정 + 성공 상태인 정산 Job 조회
    jobs_result = await db.execute(
        select(UploadJob).where(
            UploadJob.job_type.in_([
                JobType.VOUCHER_SALES_EXCEL,
                JobType.VOUCHER_PURCHASE_EXCEL,
            ]),
            UploadJob.status == JobStatus.SUCCEEDED,
            UploadJob.is_confirmed == False,
        )
    )
    jobs = jobs_result.scalars().all()

    all_unmatched = []
    seen = set()

    for job in jobs:
        unmatched_key = f"settlement:upload:unmatched:{job.id}"
        unmatched_data = await redis.get(unmatched_key)
        if unmatched_data:
            try:
                names = json.loads(unmatched_data)
                for name in names:
                    if name and name not in seen:
                        seen.add(name)
                        # 미리보기에서 해당 이름의 행 수 카운트
                        preview_key = f"settlement:upload:preview:{job.id}"
                        preview_data = await redis.get(preview_key)
                        row_count = 0
                        if preview_data:
                            rows = json.loads(preview_data)
                            row_count = sum(
                                1 for r in rows
                                if r.get("status") == "unmatched"
                                and r.get("counterparty_name") == name
                            )
                        all_unmatched.append({
                            "alias_name": name,
                            "upload_job_id": str(job.id),
                            "row_count": row_count,
                        })
            except (json.JSONDecodeError, TypeError):
                pass

    return {
        "unmatched": all_unmatched,
        "total": len(all_unmatched),
    }


@router.post("/unmatched/{alias_name}/map", response_model=dict)
async def map_unmatched_counterparty(
    alias_name: str,
    data: UnmatchedMapRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """미매칭 거래처 매핑 (기존 거래처에 별칭 추가 또는 새 거래처 생성)"""

    if data.counterparty_id:
        # 기존 거래처에 별칭 추가
        cp = await db.get(Counterparty, data.counterparty_id)
        if not cp:
            raise HTTPException(status_code=404, detail="거래처를 찾을 수 없습니다")

        # 별칭 중복 체크
        existing = await db.execute(
            select(CounterpartyAlias).where(CounterpartyAlias.alias_name == alias_name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="이미 등록된 별칭입니다")

        alias = CounterpartyAlias(
            counterparty_id=cp.id,
            alias_name=alias_name,
            created_by=current_user.id,
        )
        db.add(alias)

        db.add(AuditLog(
            user_id=current_user.id,
            action=AuditAction.COUNTERPARTY_ALIAS_CREATE,
            target_type="counterparty_alias",
            target_id=alias.id,
            after_data={"alias_name": alias_name, "counterparty_id": str(cp.id)},
        ))

        await db.flush()

        return {"message": f"'{alias_name}' → '{cp.name}' 별칭 매핑 완료", "counterparty_id": str(cp.id)}

    elif data.new_counterparty_name:
        # 새 거래처 생성 + 별칭 등록
        cp = Counterparty(name=data.new_counterparty_name)
        db.add(cp)
        await db.flush()

        # 표준명 별칭
        db.add(CounterpartyAlias(
            counterparty_id=cp.id,
            alias_name=data.new_counterparty_name,
            created_by=current_user.id,
        ))
        # UPM 표기명 별칭
        if alias_name != data.new_counterparty_name:
            db.add(CounterpartyAlias(
                counterparty_id=cp.id,
                alias_name=alias_name,
                created_by=current_user.id,
            ))

        db.add(AuditLog(
            user_id=current_user.id,
            action=AuditAction.COUNTERPARTY_CREATE,
            target_type="counterparty",
            target_id=cp.id,
            after_data={"name": data.new_counterparty_name, "alias": alias_name},
        ))

        await db.flush()
        return {"message": f"새 거래처 '{data.new_counterparty_name}' 생성 + '{alias_name}' 별칭 매핑 완료", "counterparty_id": str(cp.id)}

    raise HTTPException(status_code=400, detail="counterparty_id 또는 new_counterparty_name 중 하나를 지정해야 합니다")
