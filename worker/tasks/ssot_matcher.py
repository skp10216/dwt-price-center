"""
단가표 통합 관리 시스템 - SSOT 매칭 유틸리티
모델명/용량 기반 SSOT 매칭 로직
"""

import re
from typing import Optional, Tuple, List
from rapidfuzz import fuzz, process


def normalize_model_name(text: str) -> str:
    """
    모델명 정규화
    
    - 공백 정리
    - 특수문자 제거
    - 대소문자 통일
    """
    if not text:
        return ""
    
    # 공백 정리
    text = " ".join(text.split())
    
    # 특수문자 제거 (한글, 영문, 숫자, 공백만 유지)
    text = re.sub(r'[^\w\s가-힣]', '', text)
    
    # 소문자 변환
    text = text.lower()
    
    return text


def extract_storage(text: str) -> Optional[int]:
    """
    스토리지 용량 추출 (GB 단위)
    
    - 256GB, 256기가, 256G 등 인식
    - 1TB, 2TB 등 TB 단위 인식
    """
    if not text:
        return None
    
    # TB 패턴
    tb_match = re.search(r'(\d+)\s*(?:tb|테라)', text, re.IGNORECASE)
    if tb_match:
        return int(tb_match.group(1)) * 1024
    
    # GB 패턴
    gb_patterns = [
        r'(\d+)\s*(?:gb|기가|g\b)',
        r'(\d{2,4})\s*$',  # 숫자만 있는 경우 (256, 512 등)
    ]
    
    for pattern in gb_patterns:
        gb_match = re.search(pattern, text, re.IGNORECASE)
        if gb_match:
            value = int(gb_match.group(1))
            if value in [32, 64, 128, 256, 512, 1024]:  # 유효한 스토리지 용량
                return value
    
    return None


def extract_series(text: str) -> Optional[str]:
    """
    시리즈 추출
    
    - iPhone 15, Galaxy S24 등
    """
    # iPhone 시리즈
    iphone_match = re.search(r'(?:아이폰|iphone)\s*(\d+)', text, re.IGNORECASE)
    if iphone_match:
        return f"iPhone {iphone_match.group(1)}"
    
    # Galaxy S 시리즈
    galaxy_s_match = re.search(r'(?:갤럭시|galaxy)\s*s\s*(\d+)', text, re.IGNORECASE)
    if galaxy_s_match:
        return f"Galaxy S{galaxy_s_match.group(1)}"
    
    # Galaxy Z Flip/Fold
    galaxy_z_match = re.search(r'(?:갤럭시|galaxy)\s*z\s*(flip|fold|플립|폴드)\s*(\d+)?', text, re.IGNORECASE)
    if galaxy_z_match:
        type_name = galaxy_z_match.group(1).lower()
        if type_name in ['플립', 'flip']:
            type_name = 'Flip'
        else:
            type_name = 'Fold'
        num = galaxy_z_match.group(2) or ''
        return f"Galaxy Z {type_name}{num}"
    
    return None


def match_model(
    text: str,
    model_choices: dict,
    threshold: float = 0.7
) -> Tuple[Optional[str], float]:
    """
    모델 매칭
    
    Args:
        text: 매칭할 텍스트
        model_choices: {모델명: 모델객체} 딕셔너리
        threshold: 최소 신뢰도 임계값
    
    Returns:
        (매칭된 모델 ID, 신뢰도) 또는 (None, 0)
    """
    if not text or not model_choices:
        return None, 0.0
    
    normalized = normalize_model_name(text)
    storage = extract_storage(text)
    series = extract_series(text)
    
    # 스토리지 기반 필터링
    candidates = {}
    for name, model in model_choices.items():
        if storage and hasattr(model, 'storage_gb'):
            if model.storage_gb != storage:
                continue
        
        # 시리즈 기반 필터링
        if series and hasattr(model, 'series'):
            if series.lower() not in model.series.lower():
                continue
        
        candidates[name] = model
    
    if not candidates:
        candidates = model_choices
    
    # 퍼지 매칭
    result = process.extractOne(
        normalized,
        [normalize_model_name(n) for n in candidates.keys()],
        scorer=fuzz.WRatio
    )
    
    if result and result[1] >= threshold * 100:
        matched_name, score, _ = result
        
        # 원본 이름 찾기
        for name in candidates.keys():
            if normalize_model_name(name) == matched_name:
                model = candidates[name]
                return str(model.id), score / 100
    
    return None, 0.0


def get_match_candidates(
    text: str,
    model_choices: dict,
    top_n: int = 5
) -> List[dict]:
    """
    매칭 후보 목록 반환 (검수 화면용)
    
    Args:
        text: 매칭할 텍스트
        model_choices: {모델명: 모델객체} 딕셔너리
        top_n: 반환할 후보 수
    
    Returns:
        [{model_id, model_name, confidence}, ...]
    """
    if not text or not model_choices:
        return []
    
    normalized = normalize_model_name(text)
    
    # 상위 N개 후보
    results = process.extract(
        normalized,
        [normalize_model_name(n) for n in model_choices.keys()],
        scorer=fuzz.WRatio,
        limit=top_n
    )
    
    candidates = []
    for matched_name, score, _ in results:
        # 원본 이름 찾기
        for name in model_choices.keys():
            if normalize_model_name(name) == matched_name:
                model = model_choices[name]
                candidates.append({
                    "model_id": str(model.id),
                    "model_name": name,
                    "confidence": score / 100,
                })
                break
    
    return candidates
