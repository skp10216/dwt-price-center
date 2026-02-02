# iPhone 시딩 데이터

## 파일 설명

- `iphone-models.json`: iPhone 7 이후 전체 모델의 시딩 데이터

## 데이터 구조

```json
{
  "device_type": "smartphone",
  "manufacturer": "apple",
  "series": "iPhone 16 Pro",
  "model_name": "iPhone 16 Pro Max",
  "storage_gb": [256, 512, 1024],
  "connectivity": "lte"
}
```

- `device_type`: 기기 타입 (smartphone)
- `manufacturer`: 제조사 (apple)
- `series`: 시리즈명 (예: iPhone 16 Pro)
- `model_name`: 모델명 (예: iPhone 16 Pro Max)
- `storage_gb`: 스토리지 옵션 배열 (GB 단위, 1TB = 1024)
- `connectivity`: 연결성 (스마트폰은 lte)

## 자동 생성 필드

시딩 데이터 업로드 시 서버에서 자동 생성되는 필드:

- `model_key`: 동일 기종 공유 식별자 (불변)
  - 형식: `{device_prefix}-{mfr_prefix}-{series_slug}-{name_slug}`
  - 예: `SP-AP-IPHONE16PRO-IPHONE16PROMAX`

- `model_code`: 개별 모델 식별자 (불변)
  - 형식: `{model_key}-{storage}`
  - 예: `SP-AP-IPHONE16PRO-IPHONE16PROMAX-256`

## Apple 공식 출처

### 기술 사양 페이지
- iPhone 비교: https://www.apple.com/kr/iphone/compare/
- iPhone 모델 식별: https://support.apple.com/ko-kr/111829
- iPhone 구입: https://www.apple.com/kr/shop/buy-iphone

### 모델별 기술 사양
- iPhone 16 Pro / 16 Pro Max: https://www.apple.com/kr/iphone-16-pro/specs/
- iPhone 16 / 16 Plus: https://www.apple.com/kr/iphone-16/specs/
- iPhone 15 Pro / 15 Pro Max: https://www.apple.com/kr/iphone-15-pro/specs/
- iPhone 15 / 15 Plus: https://www.apple.com/kr/iphone-15/specs/
- iPhone 14 Pro / 14 Pro Max: https://support.apple.com/ko-kr/111830
- iPhone 14 / 14 Plus: https://support.apple.com/ko-kr/111831
- iPhone 13 시리즈: https://support.apple.com/ko-kr/111833
- iPhone 12 시리즈: https://support.apple.com/ko-kr/111834
- iPhone 11 시리즈: https://support.apple.com/ko-kr/111835
- iPhone X/XS/XR 시리즈: https://support.apple.com/ko-kr/111836
- iPhone 8/8 Plus: https://support.apple.com/ko-kr/111837
- iPhone 7/7 Plus: https://support.apple.com/ko-kr/111838
- iPhone SE (2/3세대): https://support.apple.com/ko-kr/111839

## 포함 모델 (33개 기종, 총 103개 스토리지 변형)

| 시리즈 | 모델 | 스토리지 옵션 |
|--------|------|---------------|
| iPhone 7 | iPhone 7 | 32, 128, 256GB |
| iPhone 7 | iPhone 7 Plus | 32, 128, 256GB |
| iPhone 8 | iPhone 8 | 64, 128, 256GB |
| iPhone 8 | iPhone 8 Plus | 64, 128, 256GB |
| iPhone X | iPhone X | 64, 256GB |
| iPhone XR | iPhone XR | 64, 128, 256GB |
| iPhone XS | iPhone XS | 64, 256, 512GB |
| iPhone XS | iPhone XS Max | 64, 256, 512GB |
| iPhone 11 | iPhone 11 | 64, 128, 256GB |
| iPhone 11 Pro | iPhone 11 Pro | 64, 256, 512GB |
| iPhone 11 Pro | iPhone 11 Pro Max | 64, 256, 512GB |
| iPhone SE | iPhone SE (2세대) | 64, 128, 256GB |
| iPhone 12 | iPhone 12 mini | 64, 128, 256GB |
| iPhone 12 | iPhone 12 | 64, 128, 256GB |
| iPhone 12 Pro | iPhone 12 Pro | 128, 256, 512GB |
| iPhone 12 Pro | iPhone 12 Pro Max | 128, 256, 512GB |
| iPhone 13 | iPhone 13 mini | 128, 256, 512GB |
| iPhone 13 | iPhone 13 | 128, 256, 512GB |
| iPhone 13 Pro | iPhone 13 Pro | 128, 256, 512GB, 1TB |
| iPhone 13 Pro | iPhone 13 Pro Max | 128, 256, 512GB, 1TB |
| iPhone SE | iPhone SE (3세대) | 64, 128, 256GB |
| iPhone 14 | iPhone 14 | 128, 256, 512GB |
| iPhone 14 | iPhone 14 Plus | 128, 256, 512GB |
| iPhone 14 Pro | iPhone 14 Pro | 128, 256, 512GB, 1TB |
| iPhone 14 Pro | iPhone 14 Pro Max | 128, 256, 512GB, 1TB |
| iPhone 15 | iPhone 15 | 128, 256, 512GB |
| iPhone 15 | iPhone 15 Plus | 128, 256, 512GB |
| iPhone 15 Pro | iPhone 15 Pro | 128, 256, 512GB, 1TB |
| iPhone 15 Pro | iPhone 15 Pro Max | 256, 512GB, 1TB |
| iPhone 16 | iPhone 16 | 128, 256, 512GB |
| iPhone 16 | iPhone 16 Plus | 128, 256, 512GB |
| iPhone 16 Pro | iPhone 16 Pro | 128, 256, 512GB, 1TB |
| iPhone 16 Pro | iPhone 16 Pro Max | 256, 512GB, 1TB |

## 사용 방법

1. 관리자 페이지 > 모델 관리 접속
2. "모델 등록" 버튼 클릭
3. "JSON 일괄" 탭 선택
4. `iphone-models.json` 파일 업로드 또는 내용 붙여넣기
5. "검증하기" 버튼 클릭
6. 검증 결과 확인 후 "저장" 버튼 클릭

## 주의사항

- 이 데이터는 Apple 공식 기술 사양을 기반으로 작성되었습니다.
- 추정이나 예상 데이터는 포함되어 있지 않습니다.
- 출시 시기에 따라 일부 스토리지 옵션이 단종될 수 있습니다.
- 최신 정보는 Apple 공식 사이트를 참조하세요.
