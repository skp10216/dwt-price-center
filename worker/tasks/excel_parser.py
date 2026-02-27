"""
단가표 통합 관리 시스템 - 엑셀 파싱 태스크
본사/거래처 엑셀 파일 파싱 및 SSOT 매칭
"""

import os
from uuid import UUID
from datetime import datetime
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

# 환경 변수
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://dwt_user:dwt_password@localhost:5532/dwt_price_center"
)

# 데이터베이스 연결
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def parse_hq_excel(job_id: str) -> dict:
    """
    본사 엑셀 파싱 태스크
    
    1. 엑셀 파일 읽기
    2. 모델코드 기반 SSOT 매칭
    3. 매핑 결과 저장
    """
    from app.models.upload_job import UploadJob
    from app.models.ssot_model import SSOTModel
    from app.models.enums import JobStatus
    
    session = SessionLocal()
    
    try:
        # Job 조회
        job = session.query(UploadJob).filter(UploadJob.id == UUID(job_id)).first()
        if not job:
            return {"error": "Job not found"}
        
        # 상태 업데이트: 실행 중
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        job.progress = 25
        session.commit()
        
        # 엑셀 파일 읽기
        df = pd.read_excel(job.file_path)
        
        # 모델코드 컬럼 확인
        model_code_col = None
        for col in df.columns:
            if '모델코드' in str(col).lower() or 'model_code' in str(col).lower():
                model_code_col = col
                break
        
        if not model_code_col:
            job.status = JobStatus.FAILED
            job.error_message = "모델코드 컬럼을 찾을 수 없습니다"
            job.completed_at = datetime.utcnow()
            session.commit()
            return {"error": "Model code column not found"}
        
        job.progress = 50
        session.commit()
        
        # SSOT 모델 조회
        ssot_models = session.query(SSOTModel).filter(SSOTModel.is_active == True).all()
        model_code_map = {m.model_code: m for m in ssot_models}
        
        # 매칭 결과
        matched = []
        unmatched = []
        
        for idx, row in df.iterrows():
            model_code = str(row[model_code_col]).strip()
            
            if model_code in model_code_map:
                matched.append({
                    "row_index": idx,
                    "model_code": model_code,
                    "model_id": str(model_code_map[model_code].id),
                    "model_name": model_code_map[model_code].full_name,
                    "raw_data": row.to_dict(),
                    "match_status": "matched",
                    "confidence": 1.0,
                })
            else:
                unmatched.append({
                    "row_index": idx,
                    "model_code": model_code,
                    "raw_data": row.to_dict(),
                    "match_status": "unmatched",
                })
        
        job.progress = 75
        session.commit()
        
        # 결과 저장
        result_summary = {
            "total_rows": len(df),
            "matched_count": len(matched),
            "unmatched_count": len(unmatched),
            "items": matched + unmatched,
        }
        
        job.result_summary = result_summary
        job.status = JobStatus.SUCCEEDED
        job.progress = 100
        job.completed_at = datetime.utcnow()
        session.commit()
        
        return result_summary
        
    except Exception as e:
        job.status = JobStatus.FAILED
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        session.commit()
        return {"error": str(e)}
        
    finally:
        session.close()


def parse_partner_excel(job_id: str) -> dict:
    """
    거래처 엑셀 파싱 태스크
    
    1. 엑셀 파일 읽기
    2. 모델명/용량 기반 SSOT 매칭 (기존 매핑 활용)
    3. 매핑 후보 생성
    """
    from app.models.upload_job import UploadJob
    from app.models.ssot_model import SSOTModel
    from app.models.partner_price import PartnerMapping
    from app.models.enums import JobStatus
    from rapidfuzz import fuzz, process
    
    session = SessionLocal()
    
    try:
        # Job 조회
        job = session.query(UploadJob).filter(UploadJob.id == UUID(job_id)).first()
        if not job:
            return {"error": "Job not found"}
        
        # 상태 업데이트
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        job.progress = 25
        session.commit()
        
        # 엑셀 파일 읽기
        df = pd.read_excel(job.file_path)
        
        job.progress = 50
        session.commit()
        
        # SSOT 모델 조회
        ssot_models = session.query(SSOTModel).filter(SSOTModel.is_active == True).all()
        model_choices = {m.full_name: m for m in ssot_models}
        
        # 기존 매핑 조회 (거래처별)
        existing_mappings = {}
        if job.partner_id:
            mappings = session.query(PartnerMapping).filter(
                PartnerMapping.partner_id == job.partner_id
            ).all()
            existing_mappings = {m.partner_expression: m for m in mappings}
        
        # 매칭 결과
        results = []
        
        for idx, row in df.iterrows():
            # 모델명 추출 (첫 번째 텍스트 컬럼 사용)
            model_text = None
            for col in df.columns:
                val = str(row[col]).strip()
                if val and len(val) > 3:
                    model_text = val
                    break
            
            if not model_text:
                results.append({
                    "row_index": idx,
                    "raw_data": row.to_dict(),
                    "match_status": "unmatched",
                })
                continue
            
            # 기존 매핑 확인
            if model_text in existing_mappings:
                mapping = existing_mappings[model_text]
                results.append({
                    "row_index": idx,
                    "partner_expression": model_text,
                    "model_id": str(mapping.model_id),
                    "raw_data": row.to_dict(),
                    "match_status": "matched",
                    "confidence": mapping.confidence,
                    "is_existing_mapping": True,
                })
                continue
            
            # 퍼지 매칭
            match_result = process.extractOne(
                model_text,
                model_choices.keys(),
                scorer=fuzz.WRatio
            )
            
            if match_result and match_result[1] >= 70:
                matched_name, score, _ = match_result
                matched_model = model_choices[matched_name]
                
                match_status = "matched" if score >= 90 else "low_confidence"
                
                results.append({
                    "row_index": idx,
                    "partner_expression": model_text,
                    "model_id": str(matched_model.id),
                    "model_name": matched_model.full_name,
                    "raw_data": row.to_dict(),
                    "match_status": match_status,
                    "confidence": score / 100,
                })
            else:
                results.append({
                    "row_index": idx,
                    "partner_expression": model_text,
                    "raw_data": row.to_dict(),
                    "match_status": "unmatched",
                })
        
        job.progress = 75
        session.commit()
        
        # 결과 저장
        matched_count = len([r for r in results if r["match_status"] == "matched"])
        low_confidence_count = len([r for r in results if r["match_status"] == "low_confidence"])
        unmatched_count = len([r for r in results if r["match_status"] == "unmatched"])
        
        result_summary = {
            "total_rows": len(df),
            "matched_count": matched_count,
            "low_confidence_count": low_confidence_count,
            "unmatched_count": unmatched_count,
            "items": results,
        }
        
        job.result_summary = result_summary
        job.status = JobStatus.SUCCEEDED
        job.progress = 100
        job.completed_at = datetime.utcnow()
        session.commit()
        
        return result_summary
        
    except Exception as e:
        job.status = JobStatus.FAILED
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        session.commit()
        return {"error": str(e)}
        
    finally:
        session.close()
