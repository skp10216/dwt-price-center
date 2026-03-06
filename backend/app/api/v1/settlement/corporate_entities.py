"""
정산 도메인 - 법인(CorporateEntity) CRUD
법인 마스터 데이터를 관리. 은행 임포트 시 어느 법인 계좌인지 선택하는 데 사용.
"""

from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_settlement_user
from app.models.user import User
from app.models.corporate_entity import CorporateEntity
from app.models.bank_import import BankImportJob
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.schemas.settlement import (
    CorporateEntityCreate, CorporateEntityUpdate, CorporateEntityResponse,
)

router = APIRouter()


@router.get("")
async def list_corporate_entities(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="법인명/코드/사업자번호 검색"),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """법인 목록 조회"""
    filters = []
    if search:
        search_like = f"%{search}%"
        filters.append(
            CorporateEntity.name.ilike(search_like)
            | CorporateEntity.code.ilike(search_like)
            | CorporateEntity.business_number.ilike(search_like)
        )
    if is_active is not None:
        filters.append(CorporateEntity.is_active == is_active)

    count_q = select(func.count(CorporateEntity.id))
    for f in filters:
        count_q = count_q.where(f)
    total = (await db.execute(count_q)).scalar() or 0

    q = select(CorporateEntity).order_by(CorporateEntity.name)
    for f in filters:
        q = q.where(f)
    q = q.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    entities = result.scalars().all()

    return {
        "corporate_entities": [
            CorporateEntityResponse.model_validate(e) for e in entities
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", response_model=CorporateEntityResponse, status_code=201)
async def create_corporate_entity(
    data: CorporateEntityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """법인 생성"""
    # 중복 체크
    existing = await db.execute(
        select(CorporateEntity.id).where(CorporateEntity.name == data.name)
    )
    if existing.scalar():
        raise HTTPException(status_code=400, detail=f"이미 존재하는 법인명입니다: {data.name}")

    if data.code:
        existing_code = await db.execute(
            select(CorporateEntity.id).where(CorporateEntity.code == data.code)
        )
        if existing_code.scalar():
            raise HTTPException(status_code=400, detail=f"이미 존재하는 법인 코드입니다: {data.code}")

    entity = CorporateEntity(**data.model_dump())
    db.add(entity)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.CORPORATE_ENTITY_CREATE,
        target_type="corporate_entity",
        target_id=entity.id,
        after_data={"name": data.name, "code": data.code},
    ))

    await db.flush()
    return CorporateEntityResponse.model_validate(entity)


@router.patch("/{entity_id}", response_model=CorporateEntityResponse)
async def update_corporate_entity(
    entity_id: UUID,
    data: CorporateEntityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """법인 수정"""
    entity = await db.get(CorporateEntity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="법인을 찾을 수 없습니다")

    before = {"name": entity.name, "code": entity.code, "is_active": entity.is_active}

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != entity.name:
        dup = await db.execute(
            select(CorporateEntity.id).where(
                CorporateEntity.name == update_data["name"],
                CorporateEntity.id != entity_id,
            )
        )
        if dup.scalar():
            raise HTTPException(status_code=400, detail=f"이미 존재하는 법인명입니다: {update_data['name']}")

    if "code" in update_data and update_data["code"] and update_data["code"] != entity.code:
        dup = await db.execute(
            select(CorporateEntity.id).where(
                CorporateEntity.code == update_data["code"],
                CorporateEntity.id != entity_id,
            )
        )
        if dup.scalar():
            raise HTTPException(status_code=400, detail=f"이미 존재하는 법인 코드입니다: {update_data['code']}")

    for key, value in update_data.items():
        setattr(entity, key, value)

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.CORPORATE_ENTITY_UPDATE,
        target_type="corporate_entity",
        target_id=entity.id,
        before_data=before,
        after_data=update_data,
    ))

    return CorporateEntityResponse.model_validate(entity)


@router.delete("/{entity_id}", status_code=204)
async def delete_corporate_entity(
    entity_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_settlement_user),
):
    """법인 삭제 (연결된 은행 임포트 Job이 있으면 제한)"""
    entity = await db.get(CorporateEntity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="법인을 찾을 수 없습니다")

    # 연결된 Job 확인
    job_count = await db.execute(
        select(func.count(BankImportJob.id)).where(
            BankImportJob.corporate_entity_id == entity_id
        )
    )
    if (job_count.scalar() or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="연결된 은행 임포트 작업이 있어 삭제할 수 없습니다. 비활성화를 사용하세요.",
        )

    db.add(AuditLog(
        user_id=current_user.id,
        action=AuditAction.CORPORATE_ENTITY_DELETE,
        target_type="corporate_entity",
        target_id=entity.id,
        before_data={"name": entity.name},
    ))

    await db.delete(entity)
