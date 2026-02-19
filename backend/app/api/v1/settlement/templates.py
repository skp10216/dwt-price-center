"""
정산 도메인 - 업로드 템플릿(매핑) 관리
UPM 엑셀 컬럼 → DB 필드 매핑 설정
"""

import json
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.upload_template import UploadTemplate
from app.models.enums import AuditAction
from app.models.audit_log import AuditLog
from app.schemas.settlement import (
    UploadTemplateCreate, UploadTemplateUpdate, UploadTemplateResponse,
)

router = APIRouter()


@router.get("", response_model=dict)
async def list_templates(
    voucher_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """업로드 템플릿 목록"""
    query = select(UploadTemplate)
    if voucher_type:
        query = query.where(UploadTemplate.voucher_type == voucher_type)
    query = query.order_by(UploadTemplate.is_default.desc(), UploadTemplate.name)

    result = await db.execute(query)
    templates = result.scalars().all()
    return {
        "templates": [UploadTemplateResponse.model_validate(t) for t in templates],
        "total": len(templates),
    }


@router.post("", response_model=UploadTemplateResponse, status_code=201)
async def create_template(
    data: UploadTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """업로드 템플릿 생성"""
    # default 설정 시 기존 default 해제
    if data.is_default:
        existing = await db.execute(
            select(UploadTemplate).where(
                UploadTemplate.voucher_type == data.voucher_type,
                UploadTemplate.is_default == True,
            )
        )
        for t in existing.scalars().all():
            t.is_default = False

    template = UploadTemplate(
        name=data.name,
        voucher_type=data.voucher_type,
        column_mapping=data.column_mapping,
        skip_columns=data.skip_columns,
        is_default=data.is_default,
        created_by=current_user.id,
    )
    db.add(template)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.UPLOAD_TEMPLATE_CREATE,
        target_type="upload_template",
        target_id=template.id,
        after_data={"name": data.name, "type": data.voucher_type},
    ))

    await db.flush()
    return UploadTemplateResponse.model_validate(template)


@router.patch("/{template_id}", response_model=UploadTemplateResponse)
async def update_template(
    template_id: UUID,
    data: UploadTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """업로드 템플릿 수정"""
    template = await db.get(UploadTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")

    update_data = data.model_dump(exclude_unset=True)

    if update_data.get("is_default"):
        existing = await db.execute(
            select(UploadTemplate).where(
                UploadTemplate.voucher_type == template.voucher_type,
                UploadTemplate.is_default == True,
                UploadTemplate.id != template_id,
            )
        )
        for t in existing.scalars().all():
            t.is_default = False

    for k, v in update_data.items():
        setattr(template, k, v)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.UPLOAD_TEMPLATE_UPDATE,
        target_type="upload_template",
        target_id=template_id,
        after_data=update_data,
    ))

    await db.flush()
    return UploadTemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """업로드 템플릿 삭제"""
    template = await db.get(UploadTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")

    await db.delete(template)
    await db.flush()


@router.post("/seed", response_model=dict)
async def seed_default_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기본 업로드 템플릿 시드 데이터 로드"""
    seed_file = Path(__file__).resolve().parents[5] / "seeds" / "settlement-templates.json"

    if not seed_file.exists():
        raise HTTPException(status_code=404, detail="시드 파일을 찾을 수 없습니다")

    with open(seed_file, "r", encoding="utf-8") as f:
        templates_data = json.load(f)

    created = 0
    skipped = 0

    for tpl_data in templates_data:
        # 이미 존재하는지 확인
        existing = await db.execute(
            select(UploadTemplate).where(
                UploadTemplate.name == tpl_data["name"],
                UploadTemplate.voucher_type == tpl_data["voucher_type"],
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        # 기존 default 해제
        if tpl_data.get("is_default"):
            existing_defaults = await db.execute(
                select(UploadTemplate).where(
                    UploadTemplate.voucher_type == tpl_data["voucher_type"],
                    UploadTemplate.is_default == True,
                )
            )
            for t in existing_defaults.scalars().all():
                t.is_default = False

        template = UploadTemplate(
            name=tpl_data["name"],
            voucher_type=tpl_data["voucher_type"],
            column_mapping=tpl_data["column_mapping"],
            skip_columns=tpl_data.get("skip_columns"),
            is_default=tpl_data.get("is_default", False),
            created_by=current_user.id,
        )
        db.add(template)
        created += 1

    await db.flush()

    return {
        "message": f"시드 완료: {created}개 생성, {skipped}개 이미 존재",
        "created": created,
        "skipped": skipped,
    }
