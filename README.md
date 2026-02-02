# 단가표 통합 관리 시스템 (DWT Price Center)

본사 판매 단가표를 SSOT(단일 기준 모델) 기반으로 웹에서 통합 관리하고, 거래처별 단가표를 업로드(이미지/엑셀)하여 동일 모델 기준으로 가격을 비교할 수 있는 관리자 시스템입니다.

## 주요 기능

- **SSOT 모델 관리**: 스마트폰/태블릿/웨어러블 모델을 중복 없이 단일 관리
- **등급별 가격 관리**: A+, A, A-, B+ 등 등급별 기본가 관리
- **정액 차감 관리**: 상태 이슈별 고정 금액 차감
- **본사 단가표 운영**: 엑셀 업로드 → 모델코드 매핑 → 검수 → 확정/적용
- **거래처 단가표 운영**: 이미지/엑셀 업로드 → 테이블 변환 → SSOT 매칭 → 검수
- **가격 비교**: 동일 모델 기준 거래처별 가격 한눈에 비교
- **감사로그**: 모든 변경 사항 추적 (누가/언제/무엇을/어떻게 + 전/후)

## 기술 스택

| 레이어 | 기술 | 역할 |
|--------|------|------|
| Frontend | Next.js 14 + TypeScript + MUI v5 | Admin/Viewer UI |
| Backend | FastAPI (Python 3.11+) | REST API + Upload Orchestrator |
| Database | PostgreSQL 15 | SSOT/가격/권한/감사로그/Job 상태 |
| Queue/Cache | Redis 7 | Job Queue + Read Cache |
| Worker | Python Worker (RQ) | 엑셀 파싱, 이미지→테이블, 매칭 |
| 배포 | Docker Compose | 단일 서버 운영 |

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 실제 값으로 수정하세요
```

### 2. Docker Compose로 실행

```bash
docker-compose up -d
```

### 3. 접속

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 개발 환경 설정

### Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

### Worker

```bash
cd worker
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
rq worker --url redis://localhost:6379/0 high default low
```

## 프로젝트 구조

```
dwt-price-center/
├── docker-compose.yml          # Docker 컨테이너 설정
├── .env.example                 # 환경 변수 템플릿
├── frontend/                    # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/                 # App Router 페이지
│   │   ├── components/          # 공통 컴포넌트
│   │   ├── features/            # 도메인별 모듈
│   │   ├── lib/                 # API 클라이언트, 유틸
│   │   └── theme/               # MUI Theme 설정
│   └── package.json
├── backend/                     # FastAPI 백엔드
│   ├── app/
│   │   ├── api/                 # API 라우터
│   │   ├── core/                # Config, Security, DB
│   │   ├── models/              # SQLAlchemy Models
│   │   ├── schemas/             # Pydantic Schemas
│   │   └── services/            # 비즈니스 로직
│   ├── alembic/                 # DB 마이그레이션
│   └── requirements.txt
└── worker/                      # Python Worker
    ├── tasks/                   # 비동기 작업
    └── requirements.txt
```

## 사용자 권한

- **Admin**: SSOT/가격/업로드/거래처/등급/차감/로그/사용자 관리 가능
- **Viewer**: 본사 단가 조회, 거래처 비교, 내 리스트 관리 가능

## 라이선스

Private - 내부 사용 전용
