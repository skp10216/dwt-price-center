# AWS EC2 배포 가이드 — settlement.dwt.kr

## 목차
1. [사전 준비](#1-사전-준비)
2. [EC2 인스턴스 생성](#2-ec2-인스턴스-생성)
3. [탄력적 IP 할당](#3-탄력적-ip-할당)
4. [보안 그룹 설정](#4-보안-그룹-설정)
5. [SSH 접속 및 서버 초기 설정](#5-ssh-접속-및-서버-초기-설정)
6. [코드 배포](#6-코드-배포)
7. [프로덕션 환경 설정](#7-프로덕션-환경-설정)
8. [Caddy 리버스 프록시 설정](#8-caddy-리버스-프록시-설정)
9. [가비아 DNS 설정](#9-가비아-dns-설정)
10. [실행 및 검증](#10-실행-및-검증)
11. [운영 가이드](#11-운영-가이드)

---

## 1. 사전 준비

### 필요한 것
- AWS 계정 (로그인: https://console.aws.amazon.com)
- 가비아 도메인 관리 페이지 접근 권한 (dwt.kr)
- SSH 클라이언트 (Windows: PowerShell 또는 PuTTY)
- GitHub 리포 접근 권한

### 예상 비용 (월)
| 항목 | 사양 | 비용 |
|------|------|------|
| EC2 | t3.small (2vCPU, 2GB) | ~$15 (약 2만원) |
| EBS | 30GB gp3 | ~$2.4 |
| 탄력적 IP | 인스턴스 연결 시 | 무료 |
| **합계** | | **~$17/월** |

> t3.micro(1GB)는 6개 컨테이너 운영에 메모리 부족. t3.small 이상 권장.

---

## 2. EC2 인스턴스 생성

### AWS 콘솔에서 진행

1. **AWS 콘솔** → 리전을 **아시아 태평양 (서울) ap-northeast-2**로 변경
2. **EC2** → **인스턴스 시작** 클릭

3. **이름**: `dwt-settlement`

4. **AMI 선택**: `Amazon Linux 2023 AMI` (프리 티어 사용 가능)

5. **인스턴스 유형**: `t3.small` (2 vCPU, 2 GiB 메모리)

6. **키 페어**:
   - **새 키 페어 생성** 클릭
   - 이름: `dwt-key`
   - 유형: RSA
   - 형식: `.pem` (OpenSSH) 또는 `.ppk` (PuTTY)
   - **키 페어 생성** → 파일이 자동 다운로드됨
   - **이 파일을 안전한 곳에 보관** (분실 시 SSH 접속 불가)

7. **네트워크 설정**:
   - **편집** 클릭
   - 퍼블릭 IP 자동 할당: **활성화**
   - 보안 그룹: **새 보안 그룹 생성** (이름: `dwt-sg`)
   - 규칙은 아래 [4. 보안 그룹 설정](#4-보안-그룹-설정) 참고

8. **스토리지**: `30 GiB gp3`

9. **인스턴스 시작** 클릭

---

## 3. 탄력적 IP 할당

인스턴스를 재시작해도 IP가 변하지 않도록 고정 IP를 할당합니다.

1. **EC2 콘솔** → 왼쪽 메뉴 **네트워크 및 보안** → **탄력적 IP**
2. **탄력적 IP 주소 할당** 클릭 → **할당**
3. 생성된 IP 선택 → **작업** → **탄력적 IP 주소 연결**
4. 인스턴스: `dwt-settlement` 선택 → **연결**

> 할당된 IP를 메모해두세요. 예: `3.38.xxx.xxx` — 이후 DNS 설정에 사용합니다.

---

## 4. 보안 그룹 설정

EC2 콘솔 → 보안 그룹 → `dwt-sg` → **인바운드 규칙 편집**:

| 유형 | 포트 | 소스 | 용도 |
|------|------|------|------|
| SSH | 22 | 내 IP (또는 회사 IP 대역) | SSH 접속 |
| HTTP | 80 | 0.0.0.0/0 | HTTP (Caddy가 HTTPS로 리다이렉트) |
| HTTPS | 443 | 0.0.0.0/0 | HTTPS 서비스 |

> SSH(22)를 `0.0.0.0/0`으로 열지 마세요. 회사 IP 또는 `내 IP`로 제한하세요.

---

## 5. SSH 접속 및 서버 초기 설정

### 5-1. SSH 접속

```bash
# Windows PowerShell 또는 Git Bash
ssh -i "C:\Users\{사용자명}\Downloads\dwt-key.pem" ec2-user@{탄력적IP}
```

> 처음 접속 시 "Are you sure you want to continue connecting?" → `yes` 입력

### 5-2. Docker 설치

```bash
# 시스템 업데이트
sudo yum update -y

# Docker 설치 및 시작
sudo yum install -y docker
sudo systemctl enable docker
sudo systemctl start docker

# ec2-user에 Docker 권한 부여 (재접속 후 적용)
sudo usermod -aG docker ec2-user
```

**SSH 세션을 종료 후 재접속** (그룹 변경 적용):
```bash
exit
ssh -i "dwt-key.pem" ec2-user@{탄력적IP}
```

### 5-3. Docker Compose 설치

```bash
# Docker Compose v2 설치
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 확인
docker compose version
```

### 5-4. Git 설치

```bash
sudo yum install -y git
```

---

## 6. 코드 배포

```bash
cd /home/ec2-user
git clone https://github.com/skp10216/dwt-price-center.git
cd dwt-price-center
```

> Private 리포인 경우 GitHub Personal Access Token 사용:
> ```bash
> git clone https://{TOKEN}@github.com/skp10216/dwt-price-center.git
> ```
> 토큰 생성: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate

---

## 7. 프로덕션 환경 설정

### 7-1. .env 파일 생성

```bash
cd /home/ec2-user/dwt-price-center
cat > .env << 'EOF'
# === Database ===
POSTGRES_USER=dwt_user
POSTGRES_PASSWORD=여기에_강력한_비밀번호_입력
POSTGRES_DB=dwt_price_center

# === Backend ===
SECRET_KEY=여기에_랜덤_시크릿키_입력
CORS_ORIGINS=https://settlement.dwt.kr

# === Domain ===
USER_DOMAIN=dwt.kr
ADMIN_DOMAIN=admin.dwt.kr
SETTLEMENT_DOMAIN=settlement.dwt.kr

# === Frontend ===
NEXT_PUBLIC_API_URL=https://settlement.dwt.kr
NEXT_PUBLIC_USER_DOMAIN=dwt.kr
NEXT_PUBLIC_ADMIN_DOMAIN=admin.dwt.kr
NEXT_PUBLIC_SETTLEMENT_DOMAIN=settlement.dwt.kr
NEXT_PUBLIC_USER_URL=https://dwt.kr
NEXT_PUBLIC_ADMIN_URL=https://admin.dwt.kr
NEXT_PUBLIC_SETTLEMENT_URL=https://settlement.dwt.kr
EOF
```

> 시크릿 키 생성:
> ```bash
> python3 -c "import secrets; print(secrets.token_urlsafe(48))"
> ```

### 7-2. docker-compose.prod.yml 생성

기존 `docker-compose.yml`을 오버라이드하는 프로덕션 설정입니다.

```bash
cat > docker-compose.prod.yml << 'PRODEOF'
# 프로덕션 오버라이드 — docker-compose.yml과 함께 사용
# 실행: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  postgres:
    # 외부 포트 노출 제거 (보안)
    ports: !override []

  redis:
    # 외부 포트 노출 제거 (보안)
    ports: !override []

  backend:
    # 소스 마운트 제거, reload 제거
    volumes:
      - upload_files:/app/uploads
    ports: !override
      - "127.0.0.1:8100:8000"
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-dwt_user}:${POSTGRES_PASSWORD:-dwt_password}@postgres:5432/${POSTGRES_DB:-dwt_price_center}
      - REDIS_URL=redis://redis:6379/0
      - SECRET_KEY=${SECRET_KEY:-change-me}
      - ALGORITHM=HS256
      - ACCESS_TOKEN_EXPIRE_MINUTES=1440
      - CORS_ORIGINS=${CORS_ORIGINS:-https://settlement.dwt.kr}
      - USER_DOMAIN=${USER_DOMAIN:-dwt.kr}
      - ADMIN_DOMAIN=${ADMIN_DOMAIN:-admin.dwt.kr}
      - SETTLEMENT_DOMAIN=${SETTLEMENT_DOMAIN:-settlement.dwt.kr}

  worker:
    # 소스 마운트 제거
    volumes:
      - upload_files:/app/uploads

  adminer:
    # 외부 포트 노출 제거 (보안)
    ports: !override
      - "127.0.0.1:8180:8080"

  frontend:
    volumes:
      - /app/node_modules
      - /app/.next
    ports: !override
      - "127.0.0.1:3100:3100"
    environment:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://settlement.dwt.kr}
      - NEXT_PUBLIC_USER_DOMAIN=${NEXT_PUBLIC_USER_DOMAIN:-dwt.kr}
      - NEXT_PUBLIC_ADMIN_DOMAIN=${NEXT_PUBLIC_ADMIN_DOMAIN:-admin.dwt.kr}
      - NEXT_PUBLIC_SETTLEMENT_DOMAIN=${NEXT_PUBLIC_SETTLEMENT_DOMAIN:-settlement.dwt.kr}
      - NEXT_PUBLIC_USER_URL=${NEXT_PUBLIC_USER_URL:-https://dwt.kr}
      - NEXT_PUBLIC_ADMIN_URL=${NEXT_PUBLIC_ADMIN_URL:-https://admin.dwt.kr}
      - NEXT_PUBLIC_SETTLEMENT_URL=${NEXT_PUBLIC_SETTLEMENT_URL:-https://settlement.dwt.kr}
    command: npm run dev
PRODEOF
```

> **참고**: `!override`는 Docker Compose v2.24.6+에서 지원됩니다.
> 만약 지원되지 않으면 `ports` 항목을 제거하고 아래와 같이 개별 수정하세요:
> ```yaml
> ports:
>   - "127.0.0.1:8100:8000"  # localhost만 바인딩
> ```

---

## 8. Caddy 리버스 프록시 설정

Caddy는 자동으로 Let's Encrypt SSL 인증서를 발급/갱신합니다.

### 8-1. Caddy 설치

```bash
# Caddy 설치 (Amazon Linux 2023)
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://copr.fedorainfracloud.org/coprs/g/caddy/caddy/repo/epel-9/group_caddy-caddy-epel-9.repo
sudo yum install -y caddy
```

> 위 방법이 안 될 경우 바이너리 직접 설치:
> ```bash
> sudo curl -o /usr/bin/caddy -L "https://caddyserver.com/api/download?os=linux&arch=amd64"
> sudo chmod +x /usr/bin/caddy
> ```

### 8-2. Caddyfile 작성

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null << 'CADDYEOF'
settlement.dwt.kr {
    # API 요청 → Backend
    handle /api/* {
        reverse_proxy localhost:8100
    }

    # 문서 페이지 → Backend
    handle /docs {
        reverse_proxy localhost:8100
    }
    handle /openapi.json {
        reverse_proxy localhost:8100
    }

    # 나머지 → Frontend
    handle {
        reverse_proxy localhost:3100
    }
}
CADDYEOF
```

### 8-3. Caddy 서비스 시작

```bash
sudo systemctl enable caddy
sudo systemctl start caddy

# 상태 확인
sudo systemctl status caddy
```

---

## 9. 가비아 DNS 설정

1. **가비아** 로그인 → **My가비아** → **도메인 관리**
2. `dwt.kr` → **DNS 관리** → **DNS 설정**
3. 레코드 추가:

| 타입 | 호스트 | 값 | TTL |
|------|--------|-----|-----|
| A | settlement | `{탄력적 IP 주소}` | 600 |

4. **저장** → DNS 전파까지 수 분~최대 48시간 (보통 5~10분)

### DNS 전파 확인

```bash
# 로컬 PC에서 확인
nslookup settlement.dwt.kr

# 또는
ping settlement.dwt.kr
```

---

## 10. 실행 및 검증

### 10-1. Docker Compose 실행

```bash
cd /home/ec2-user/dwt-price-center

# 이미지 빌드 및 실행
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 컨테이너 상태 확인
docker compose ps
```

모든 컨테이너가 `Up` 또는 `Up (healthy)` 상태여야 합니다:
```
NAME           STATUS
dwt-postgres   Up (healthy)
dwt-redis      Up (healthy)
dwt-backend    Up
dwt-frontend   Up
dwt-worker     Up
dwt-adminer    Up
```

### 10-2. Caddy 상태 확인

```bash
sudo systemctl status caddy
# Active: active (running) 이어야 함
```

### 10-3. 접속 테스트

```bash
# 서버에서 로컬 테스트
curl -I http://localhost:3100   # Frontend → 200 또는 307
curl -I http://localhost:8100/docs  # Backend → 200

# HTTPS 테스트 (DNS 전파 후)
curl -I https://settlement.dwt.kr
```

### 10-4. 브라우저 확인

1. `https://settlement.dwt.kr` 접속
2. 로그인 페이지가 표시되는지 확인
3. 로그인 후 정산 대시보드가 정상 로드되는지 확인
4. 브라우저 주소창에 자물쇠 아이콘 (SSL 적용) 확인

---

## 11. 운영 가이드

### 로그 확인

```bash
cd /home/ec2-user/dwt-price-center

# 전체 로그
docker compose logs -f

# 특정 서비스 로그
docker compose logs -f backend
docker compose logs -f frontend

# Caddy 로그
sudo journalctl -u caddy -f
```

### 서비스 재시작

```bash
# 전체 재시작
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart

# 특정 서비스만 재시작
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend
```

### 코드 업데이트 (배포)

```bash
cd /home/ec2-user/dwt-price-center

# 최신 코드 가져오기
git pull origin master

# 이미지 다시 빌드 및 재시작
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# (선택) 사용하지 않는 이미지 정리
docker image prune -f
```

### DB 마이그레이션

```bash
docker exec dwt-backend bash -c 'export PYTHONPATH=/app && cd /app && alembic upgrade head'
```

### 서버 디스크 용량 확인

```bash
df -h
docker system df
```

### 서버 메모리 확인

```bash
free -h
docker stats --no-stream
```

---

## 트러블슈팅

### SSL 인증서 발급 실패
- DNS가 아직 전파되지 않았을 수 있음 → `nslookup settlement.dwt.kr`로 확인 후 재시도
- 80/443 포트가 보안 그룹에서 열려있는지 확인
- `sudo journalctl -u caddy --no-pager | tail -50`으로 Caddy 로그 확인

### 컨테이너가 시작되지 않을 때
```bash
# 실패한 컨테이너 로그 확인
docker compose logs backend
docker compose logs frontend

# 컨테이너 재빌드
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --force-recreate
```

### 메모리 부족 (OOM)
```bash
# 현재 메모리 사용량 확인
docker stats --no-stream

# swap 추가 (t3.small 2GB가 부족한 경우)
sudo dd if=/dev/zero of=/swapfile bs=128M count=16  # 2GB swap
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

### CORS 에러
- `.env`의 `CORS_ORIGINS`에 `https://settlement.dwt.kr`이 포함되어 있는지 확인
- backend 컨테이너 재시작: `docker compose restart backend`

### API 호출이 안 될 때
- 브라우저 개발자 도구 → Network 탭에서 API 요청 URL 확인
- `https://settlement.dwt.kr/api/v1/...`로 요청이 가는지 확인
- Caddyfile의 `/api/*` 핸들러가 올바른지 확인
