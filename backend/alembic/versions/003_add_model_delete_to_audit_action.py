"""add model_delete and model_bulk_delete to audit_action enum

Revision ID: 003_add_model_delete
Revises: 002_add_model_bulk_create_to_audit_action
Create Date: 2026-02-02

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '003_add_model_delete'
down_revision: Union[str, None] = '002_add_model_bulk_create_to_audit_action'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    AuditAction enum에 model_delete, model_bulk_delete 값 추가
    
    PostgreSQL에서는 enum 타입에 새 값을 추가할 때
    ALTER TYPE ... ADD VALUE 문을 사용해야 합니다.
    
    주의: IF NOT EXISTS는 PostgreSQL 9.3+ 지원
    """
    # 연결 가져오기
    conn = op.get_bind()
    
    # MODEL_DELETE 값 추가 (대문자 - SQLAlchemy Enum이 .name 사용)
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MODEL_DELETE'"))
    
    # MODEL_BULK_DELETE 값 추가 (대문자)
    conn.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MODEL_BULK_DELETE'"))


def downgrade() -> None:
    """
    PostgreSQL에서는 enum 값을 제거하기가 어렵습니다.
    일반적으로 downgrade에서는:
    1. 새 enum 타입 생성
    2. 컬럼 타입 변경
    3. 기존 enum 삭제
    4. 새 enum을 기존 이름으로 변경
    
    여기서는 단순히 경고만 출력합니다.
    실제 프로덕션에서는 필요에 따라 구현해야 합니다.
    """
    # enum 값 제거는 복잡하므로 여기서는 생략
    # 필요시 수동으로 처리
    pass
