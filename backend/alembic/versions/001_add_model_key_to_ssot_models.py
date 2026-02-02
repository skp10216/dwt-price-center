"""
SSOT 모델에 model_key 필드 추가

model_key는 동일 기종의 여러 스토리지 모델이 공유하는 불변 식별자입니다.
- 형식: {device_prefix}-{mfr_prefix}-{series_slug}-{name_slug}
- 예시: SP-AP-IPHONE16PRO-IPHONE16PROMAX

Revision ID: 001_add_model_key
Revises: 
Create Date: 2026-02-02
"""

import re
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001_add_model_key'
down_revision = None
branch_labels = None
depends_on = None


def generate_model_key(device_type: str, manufacturer: str, series: str, model_name: str) -> str:
    """model_key 생성 함수 (마이그레이션용)"""
    prefix_map = {"smartphone": "SP", "tablet": "TB", "wearable": "WR"}
    mfr_map = {"apple": "AP", "samsung": "SM", "other": "OT"}
    
    device_prefix = prefix_map.get(device_type, "XX")
    mfr_prefix = mfr_map.get(manufacturer, "XX")
    
    # 정규화: 공백/특수문자 제거, 대문자화
    series_slug = re.sub(r'[^a-zA-Z0-9]', '', series).upper()[:10]
    name_slug = re.sub(r'[^a-zA-Z0-9]', '', model_name).upper()[:15]
    
    return f"{device_prefix}-{mfr_prefix}-{series_slug}-{name_slug}"


def upgrade() -> None:
    """model_key 컬럼 추가 및 기존 데이터 마이그레이션"""
    
    # 1. model_key 컬럼 추가 (일단 nullable=True로)
    op.add_column(
        'ssot_models',
        sa.Column(
            'model_key',
            sa.String(100),
            nullable=True,
            comment='불변 모델 키 (동일 기종 공유, 스토리지 미포함)'
        )
    )
    
    # 2. 기존 데이터에 model_key 값 생성
    # 기존 데이터가 있는 경우를 대비한 마이그레이션
    connection = op.get_bind()
    
    # 기존 모델 조회
    result = connection.execute(
        sa.text("""
            SELECT id, device_type, manufacturer, series, model_name 
            FROM ssot_models 
            WHERE model_key IS NULL
        """)
    )
    
    for row in result:
        model_key = generate_model_key(
            row.device_type,
            row.manufacturer,
            row.series,
            row.model_name
        )
        connection.execute(
            sa.text("UPDATE ssot_models SET model_key = :model_key WHERE id = :id"),
            {"model_key": model_key, "id": row.id}
        )
    
    # 3. nullable=False로 변경
    op.alter_column('ssot_models', 'model_key', nullable=False)
    
    # 4. 인덱스 추가
    op.create_index('ix_ssot_models_model_key', 'ssot_models', ['model_key'])
    
    # 5. model_code 컬럼 길이 확장 (50 -> 100)
    op.alter_column(
        'ssot_models',
        'model_code',
        type_=sa.String(100),
        existing_type=sa.String(50),
        existing_nullable=False,
        comment='모델 코드 (model_key + storage 조합, 불변)'
    )


def downgrade() -> None:
    """롤백: model_key 컬럼 제거"""
    
    # 1. 인덱스 삭제
    op.drop_index('ix_ssot_models_model_key', table_name='ssot_models')
    
    # 2. model_key 컬럼 삭제
    op.drop_column('ssot_models', 'model_key')
    
    # 3. model_code 컬럼 길이 복원 (100 -> 50)
    op.alter_column(
        'ssot_models',
        'model_code',
        type_=sa.String(50),
        existing_type=sa.String(100),
        existing_nullable=False,
        comment='모델 코드 (본사 업로드 매칭 키)'
    )
