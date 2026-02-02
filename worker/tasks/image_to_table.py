"""
단가표 통합 관리 시스템 - 이미지→테이블 변환 태스크
거래처 이미지 단가표를 테이블로 변환
"""

import os
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict

import cv2
import numpy as np
from PIL import Image

# 환경 변수
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://dwt_user:dwt_password@localhost:5432/dwt_price_center"
)


def preprocess_image(image_path: str) -> np.ndarray:
    """
    이미지 전처리
    
    - 그레이스케일 변환
    - 노이즈 제거
    - 이진화
    - 기울기 보정
    """
    # 이미지 읽기
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")
    
    # 그레이스케일 변환
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 노이즈 제거
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    
    # 이진화 (Otsu's method)
    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # 기울기 보정 (deskew)
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) > 0:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        
        if abs(angle) > 0.5:  # 0.5도 이상만 보정
            (h, w) = binary.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            binary = cv2.warpAffine(
                binary, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )
    
    return binary


def extract_table_structure(image: np.ndarray) -> List[Dict]:
    """
    테이블 구조 추출
    
    - 수평/수직 선 검출
    - 셀 영역 식별
    """
    # 수평선 검출
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    horizontal = cv2.morphologyEx(image, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
    
    # 수직선 검출
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    vertical = cv2.morphologyEx(image, cv2.MORPH_OPEN, vertical_kernel, iterations=2)
    
    # 테이블 그리드
    table_grid = cv2.addWeighted(horizontal, 0.5, vertical, 0.5, 0.0)
    
    # 컨투어 찾기
    contours, _ = cv2.findContours(table_grid, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    cells = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w > 20 and h > 10:  # 최소 크기 필터
            cells.append({
                "x": x,
                "y": y,
                "width": w,
                "height": h,
            })
    
    # 정렬 (위에서 아래, 왼쪽에서 오른쪽)
    cells.sort(key=lambda c: (c["y"], c["x"]))
    
    return cells


def ocr_cell(image: np.ndarray, cell: Dict) -> str:
    """
    셀 영역 OCR
    """
    try:
        import pytesseract
        
        x, y, w, h = cell["x"], cell["y"], cell["width"], cell["height"]
        cell_img = image[y:y+h, x:x+w]
        
        # OCR 실행
        text = pytesseract.image_to_string(
            cell_img,
            lang='kor+eng',
            config='--psm 6'  # 단일 텍스트 블록
        )
        
        return text.strip()
    except Exception as e:
        return ""


def parse_partner_image(job_id: str) -> dict:
    """
    거래처 이미지 파싱 태스크
    
    1. 이미지 전처리
    2. 테이블 구조 추출
    3. OCR로 텍스트 추출
    4. SSOT 매칭 후보 생성
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
    try:
        from app.models.upload_job import UploadJob
        from app.models.ssot_model import SSOTModel
        from app.models.partner_price import PartnerMapping
        from app.models.enums import JobStatus
        from rapidfuzz import fuzz, process
        
        # Job 조회
        job = session.query(UploadJob).filter(UploadJob.id == UUID(job_id)).first()
        if not job:
            return {"error": "Job not found"}
        
        # 상태 업데이트
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        job.progress = 10
        session.commit()
        
        # 이미지 품질 체크
        img = Image.open(job.file_path)
        width, height = img.size
        
        quality_warnings = []
        if width < 800 or height < 600:
            quality_warnings.append("해상도가 낮습니다. 인식률이 떨어질 수 있습니다.")
        
        job.progress = 20
        session.commit()
        
        # 이미지 전처리
        preprocessed = preprocess_image(job.file_path)
        
        job.progress = 40
        session.commit()
        
        # 테이블 구조 추출
        cells = extract_table_structure(preprocessed)
        
        if not cells:
            job.status = JobStatus.FAILED
            job.error_message = "테이블 구조를 찾을 수 없습니다"
            job.completed_at = datetime.utcnow()
            session.commit()
            return {"error": "Table structure not found"}
        
        job.progress = 60
        session.commit()
        
        # OCR 실행
        rows_data = []
        current_row = []
        last_y = -1
        
        for cell in cells:
            text = ocr_cell(preprocessed, cell)
            
            # 새로운 행 시작 여부 판단
            if last_y >= 0 and abs(cell["y"] - last_y) > 20:
                if current_row:
                    rows_data.append(current_row)
                current_row = []
            
            current_row.append(text)
            last_y = cell["y"]
        
        if current_row:
            rows_data.append(current_row)
        
        job.progress = 80
        session.commit()
        
        # SSOT 매칭
        ssot_models = session.query(SSOTModel).filter(SSOTModel.is_active == True).all()
        model_choices = {m.full_name: m for m in ssot_models}
        
        # 기존 매핑 조회
        existing_mappings = {}
        if job.partner_id:
            mappings = session.query(PartnerMapping).filter(
                PartnerMapping.partner_id == job.partner_id
            ).all()
            existing_mappings = {m.partner_expression: m for m in mappings}
        
        results = []
        for idx, row in enumerate(rows_data):
            # 첫 번째 셀을 모델명으로 가정
            model_text = row[0] if row else ""
            
            if not model_text or len(model_text) < 3:
                results.append({
                    "row_index": idx,
                    "raw_data": row,
                    "match_status": "unmatched",
                    "ocr_confidence": 0.5,
                })
                continue
            
            # 기존 매핑 확인
            if model_text in existing_mappings:
                mapping = existing_mappings[model_text]
                results.append({
                    "row_index": idx,
                    "partner_expression": model_text,
                    "model_id": str(mapping.model_id),
                    "raw_data": row,
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
            
            if match_result and match_result[1] >= 60:
                matched_name, score, _ = match_result
                matched_model = model_choices[matched_name]
                
                match_status = "matched" if score >= 85 else "low_confidence"
                
                results.append({
                    "row_index": idx,
                    "partner_expression": model_text,
                    "model_id": str(matched_model.id),
                    "model_name": matched_model.full_name,
                    "raw_data": row,
                    "match_status": match_status,
                    "confidence": score / 100,
                })
            else:
                results.append({
                    "row_index": idx,
                    "partner_expression": model_text,
                    "raw_data": row,
                    "match_status": "unmatched",
                })
        
        # 결과 저장
        matched_count = len([r for r in results if r["match_status"] == "matched"])
        low_confidence_count = len([r for r in results if r["match_status"] == "low_confidence"])
        unmatched_count = len([r for r in results if r["match_status"] == "unmatched"])
        
        result_summary = {
            "total_rows": len(results),
            "matched_count": matched_count,
            "low_confidence_count": low_confidence_count,
            "unmatched_count": unmatched_count,
            "quality_warnings": quality_warnings,
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
