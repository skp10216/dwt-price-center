#!/usr/bin/env bash
# ============================================================================
#  DWT Price Center — Production Deployment Script
#  Target: Amazon Linux 2023 (EC2 t3.small)
# ============================================================================
set -euo pipefail

# ── 상수 ────────────────────────────────────────────────────────────────────
readonly SCRIPT_VERSION="1.0.0"
readonly PROJECT_DIR="/home/ec2-user/dwt-price-center"
readonly COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
readonly LOG_DIR="${PROJECT_DIR}/logs"
readonly LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"
readonly BACKUP_DIR="${PROJECT_DIR}/backups"

# 임계값
readonly MIN_DISK_GB=5          # 최소 여유 디스크 (GB)
readonly MIN_MEMORY_MB=300      # 최소 여유 메모리 (MB)
readonly HEALTH_TIMEOUT=120     # 헬스체크 타임아웃 (초)
readonly HEALTH_INTERVAL=3      # 헬스체크 간격 (초)
readonly MAX_LOG_FILES=20       # 보관할 배포 로그 수

# 서비스 정의
readonly SERVICES=(postgres redis backend worker frontend adminer)
readonly HEALTH_ENDPOINTS=(
    "backend|http://127.0.0.1:8100/health|200"
    "frontend|http://127.0.0.1:3100/|307"
    "adminer|http://127.0.0.1:8180/|200"
)

# ── 색상 ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m'    GREEN='\033[0;32m'   YELLOW='\033[0;33m'
    BLUE='\033[0;34m'   CYAN='\033[0;36m'    BOLD='\033[1m'
    DIM='\033[2m'       NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' NC=''
fi

# ── 유틸리티 ────────────────────────────────────────────────────────────────
_ts()    { date '+%H:%M:%S'; }
_log()   { echo -e "${DIM}$(_ts)${NC} $*" | tee -a "$LOG_FILE"; }
_info()  { _log "${BLUE}[INFO]${NC}  $*"; }
_ok()    { _log "${GREEN}[  OK]${NC}  $*"; }
_warn()  { _log "${YELLOW}[WARN]${NC}  $*"; }
_fail()  { _log "${RED}[FAIL]${NC}  $*"; }
_step()  { echo "" | tee -a "$LOG_FILE"; _log "${BOLD}${CYAN}── $* ──${NC}"; }

_die() {
    _fail "$*"
    _fail "배포를 중단합니다."
    exit 1
}

_duration() {
    local sec=$1
    if (( sec >= 60 )); then
        printf '%dm %ds' $((sec/60)) $((sec%60))
    else
        printf '%ds' "$sec"
    fi
}

_separator() {
    echo -e "${DIM}$(printf '%.0s─' {1..60})${NC}" | tee -a "$LOG_FILE"
}

# ── 배너 ────────────────────────────────────────────────────────────────────
_banner() {
    echo ""
    echo -e "${BOLD}${CYAN}"
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║     DWT Price Center — Deploy v${SCRIPT_VERSION}        ║"
    echo "  ║     $(date '+%Y-%m-%d %H:%M:%S')                      ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ── 인자 파싱 ───────────────────────────────────────────────────────────────
SKIP_PULL=false
FORCE_BUILD=false
SKIP_BACKUP=false
DRY_RUN=false
CLEANUP_AFTER=true

_usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --skip-pull       Git pull 건너뛰기
  --force-build     캐시 무시 강제 빌드
  --skip-backup     DB 백업 건너뛰기
  --no-cleanup      배포 후 정리 건너뛰기
  --dry-run         검증만 실행 (실제 배포 안 함)
  -h, --help        도움말

Examples:
  ./deploy.sh                    # 전체 배포
  ./deploy.sh --skip-pull        # pull 없이 재빌드
  ./deploy.sh --dry-run          # 사전 검증만
  ./deploy.sh --force-build      # 캐시 없이 클린 빌드
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-pull)    SKIP_PULL=true   ;;
        --force-build)  FORCE_BUILD=true ;;
        --skip-backup)  SKIP_BACKUP=true ;;
        --no-cleanup)   CLEANUP_AFTER=false ;;
        --dry-run)      DRY_RUN=true     ;;
        -h|--help)      _usage           ;;
        *) _die "알 수 없는 옵션: $1 (--help 참고)" ;;
    esac
    shift
done

# ── 초기화 ──────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$BACKUP_DIR"
cd "$PROJECT_DIR"

DEPLOY_START=$(date +%s)
ERRORS=()
WARNINGS=()
CHANGES_PULLED=""

_banner | tee -a "$LOG_FILE"

# ════════════════════════════════════════════════════════════════════════════
#  Phase 1: 사전 검증
# ════════════════════════════════════════════════════════════════════════════
_step "Phase 1/6 — 사전 검증"

# ── 1-1. 필수 도구 확인 ──
_info "필수 도구 확인..."
for cmd in docker git curl jq; do
    if command -v "$cmd" &>/dev/null; then
        _ok "$cmd $(command -v "$cmd")"
    else
        _die "$cmd 미설치"
    fi
done

if docker compose version &>/dev/null; then
    _ok "docker compose $(docker compose version --short 2>/dev/null || echo '')"
else
    _die "docker compose 미설치"
fi

# ── 1-2. Docker 데몬 상태 ──
if docker info &>/dev/null; then
    _ok "Docker 데몬 실행 중"
else
    _die "Docker 데몬이 실행되지 않았습니다"
fi

# ── 1-3. 디스크 여유 공간 ──
_info "디스크 공간 확인..."
avail_kb=$(df "$PROJECT_DIR" | awk 'NR==2{print $4}')
avail_gb=$((avail_kb / 1024 / 1024))
if (( avail_gb < MIN_DISK_GB )); then
    _die "디스크 여유 공간 부족: ${avail_gb}GB (최소 ${MIN_DISK_GB}GB 필요)"
else
    _ok "디스크 여유: ${avail_gb}GB"
fi

# ── 1-4. 메모리 여유 ──
_info "메모리 확인..."
avail_mem_mb=$(free -m | awk '/^Mem:/{print $7}')
total_mem_mb=$(free -m | awk '/^Mem:/{print $2}')
if (( avail_mem_mb < MIN_MEMORY_MB )); then
    WARNINGS+=("메모리 여유 부족: ${avail_mem_mb}MB (권장 ${MIN_MEMORY_MB}MB 이상)")
    _warn "메모리 여유: ${avail_mem_mb}MB / ${total_mem_mb}MB — 빌드 중 느려질 수 있음"
else
    _ok "메모리 여유: ${avail_mem_mb}MB / ${total_mem_mb}MB"
fi

# ── 1-5. 필수 파일 확인 ──
_info "필수 파일 확인..."
for f in .env docker-compose.yml docker-compose.prod.yml backend/Dockerfile frontend/Dockerfile frontend/Dockerfile.prod worker/Dockerfile; do
    if [[ -f "$f" ]]; then
        _ok "$f"
    else
        _die "필수 파일 누락: $f"
    fi
done

# ── 1-6. .env 필수 변수 검증 ──
_info ".env 변수 검증..."
required_vars=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB SECRET_KEY)
missing_vars=()
for var in "${required_vars[@]}"; do
    if grep -q "^${var}=" .env; then
        val=$(grep "^${var}=" .env | cut -d'=' -f2-)
        if [[ -z "$val" ]]; then
            missing_vars+=("$var (값이 비어있음)")
        fi
    else
        missing_vars+=("$var")
    fi
done

if (( ${#missing_vars[@]} > 0 )); then
    _die ".env 필수 변수 누락: ${missing_vars[*]}"
else
    _ok ".env 필수 변수 모두 설정됨"
fi

# ── 1-7. 보안 파일 체크 ──
_info "보안 파일 점검..."
for pattern in "*.pem" "*.key" "*credentials*" "*secret*"; do
    found=$(git ls-files "$pattern" 2>/dev/null || true)
    if [[ -n "$found" ]]; then
        WARNINGS+=("Git에 민감 파일 포함: $found")
        _warn "Git에 민감 파일 포함: $found — .gitignore 추가를 권장합니다"
    fi
done

# ════════════════════════════════════════════════════════════════════════════
#  Phase 2: 소스 동기화
# ════════════════════════════════════════════════════════════════════════════
_step "Phase 2/6 — 소스 동기화"

current_commit=$(git rev-parse --short HEAD)
current_branch=$(git branch --show-current)
_info "현재: ${BOLD}${current_branch}${NC} @ ${current_commit}"

if [[ "$SKIP_PULL" == true ]]; then
    _info "Git pull 건너뛰기 (--skip-pull)"
else
    _info "원격 저장소 확인 중..."
    git fetch origin "$current_branch" --quiet 2>&1 | tee -a "$LOG_FILE"

    local_hash=$(git rev-parse HEAD)
    remote_hash=$(git rev-parse "origin/${current_branch}")

    if [[ "$local_hash" == "$remote_hash" ]]; then
        _ok "이미 최신 상태입니다"
    else
        behind=$(git rev-list --count HEAD.."origin/${current_branch}")
        _info "${behind}개 커밋 뒤처져 있음 — pull 실행..."

        # 로컬 변경사항 확인
        if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
            _warn "로컬 변경사항 감지 — stash 후 pull"
            git stash push -m "deploy-$(date +%Y%m%d%H%M%S)" 2>&1 | tee -a "$LOG_FILE"
        fi

        git pull origin "$current_branch" 2>&1 | tee -a "$LOG_FILE"
        new_commit=$(git rev-parse --short HEAD)
        CHANGES_PULLED=$(git log --oneline "${current_commit}..HEAD" 2>/dev/null || echo "")
        _ok "업데이트: ${current_commit} → ${new_commit}"
    fi
fi

# ════════════════════════════════════════════════════════════════════════════
#  Phase 3: DB 백업
# ════════════════════════════════════════════════════════════════════════════
_step "Phase 3/6 — DB 백업"

if [[ "$SKIP_BACKUP" == true ]]; then
    _info "DB 백업 건너뛰기 (--skip-backup)"
elif docker ps --format '{{.Names}}' | grep -q dwt-postgres; then
    backup_file="${BACKUP_DIR}/db-$(date +%Y%m%d-%H%M%S).sql.gz"
    _info "PostgreSQL 백업 중..."

    if docker exec dwt-postgres pg_dump -U dwt_user dwt_price_center 2>/dev/null | gzip > "$backup_file"; then
        backup_size=$(du -h "$backup_file" | cut -f1)
        _ok "백업 완료: $(basename "$backup_file") (${backup_size})"

        # 오래된 백업 정리 (최근 10개만 유지)
        ls -t "${BACKUP_DIR}"/db-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
    else
        WARNINGS+=("DB 백업 실패 — 배포는 계속 진행")
        _warn "DB 백업 실패 — 계속 진행합니다"
        rm -f "$backup_file"
    fi
else
    _info "PostgreSQL 컨테이너 미실행 — 백업 건너뛰기"
fi

# ════════════════════════════════════════════════════════════════════════════
#  Phase 4: Dry-run 체크
# ════════════════════════════════════════════════════════════════════════════
if [[ "$DRY_RUN" == true ]]; then
    _step "Dry-run 완료"
    _info "실제 배포 없이 검증만 수행했습니다."
    _separator

    if (( ${#WARNINGS[@]} > 0 )); then
        _warn "경고 ${#WARNINGS[@]}건:"
        for w in "${WARNINGS[@]}"; do _warn "  · $w"; done
    fi
    echo ""
    _ok "사전 검증 통과 — 실제 배포 시 --dry-run을 제거하세요."
    exit 0
fi

# ════════════════════════════════════════════════════════════════════════════
#  Phase 4: 빌드 & 배포
# ════════════════════════════════════════════════════════════════════════════
_step "Phase 4/6 — 빌드 & 배포"

# 기존 컨테이너 상태 저장 (롤백용)
_info "현재 이미지 태그 저장 (롤백 대비)..."
for svc in backend frontend worker; do
    img=$(docker inspect --format='{{.Image}}' "dwt-${svc}" 2>/dev/null || echo "none")
    echo "${svc}=${img}" >> "${LOG_DIR}/rollback-images.txt"
done

build_start=$(date +%s)

BUILD_FLAGS=""
if [[ "$FORCE_BUILD" == true ]]; then
    BUILD_FLAGS="--no-cache"
    _info "강제 빌드 (--no-cache)"
fi

_info "이미지 빌드 & 컨테이너 재시작..."
if docker compose ${COMPOSE_FILES} up -d --build ${BUILD_FLAGS} 2>&1 | tee -a "$LOG_FILE"; then
    build_end=$(date +%s)
    _ok "빌드 & 배포 완료 ($(_duration $((build_end - build_start))))"
else
    _die "빌드 실패 — 로그를 확인하세요: $LOG_FILE"
fi

# ════════════════════════════════════════════════════════════════════════════
#  Phase 5: 헬스체크
# ════════════════════════════════════════════════════════════════════════════
_step "Phase 5/6 — 헬스체크"

# ── 5-1. 컨테이너 상태 확인 ──
_info "컨테이너 상태 확인..."
all_running=true
for svc in "${SERVICES[@]}"; do
    status=$(docker inspect --format='{{.State.Status}}' "dwt-${svc}" 2>/dev/null || echo "missing")
    if [[ "$status" == "running" ]]; then
        _ok "dwt-${svc}: running"
    else
        _fail "dwt-${svc}: ${status}"
        all_running=false
        ERRORS+=("dwt-${svc} 상태: ${status}")
    fi
done

# ── 5-2. 인프라 헬스체크 (postgres, redis) ──
_info "인프라 헬스체크 대기..."
elapsed=0
while (( elapsed < HEALTH_TIMEOUT )); do
    pg_ok=false
    rd_ok=false

    if docker exec dwt-postgres pg_isready -U dwt_user -d dwt_price_center &>/dev/null; then
        pg_ok=true
    fi
    if docker exec dwt-redis redis-cli ping &>/dev/null; then
        rd_ok=true
    fi

    if $pg_ok && $rd_ok; then
        _ok "PostgreSQL: healthy"
        _ok "Redis: healthy"
        break
    fi

    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
done

if (( elapsed >= HEALTH_TIMEOUT )); then
    _fail "인프라 헬스체크 타임아웃 (${HEALTH_TIMEOUT}초)"
    ERRORS+=("인프라 헬스체크 타임아웃")
fi

# ── 5-3. HTTP 엔드포인트 헬스체크 ──
_info "HTTP 엔드포인트 점검..."
for entry in "${HEALTH_ENDPOINTS[@]}"; do
    IFS='|' read -r name url expected_code <<< "$entry"

    elapsed=0
    while (( elapsed < HEALTH_TIMEOUT )); do
        code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [[ "$code" == "$expected_code" ]]; then
            _ok "${name}: HTTP ${code}"
            break
        fi
        sleep "$HEALTH_INTERVAL"
        elapsed=$((elapsed + HEALTH_INTERVAL))
    done

    if (( elapsed >= HEALTH_TIMEOUT )); then
        _fail "${name}: 응답 없음 (${HEALTH_TIMEOUT}초 대기, 마지막 코드: ${code})"
        ERRORS+=("${name} 헬스체크 실패")
    fi
done

# ── 5-4. Worker 큐 리스닝 확인 ──
_info "Worker 상태 확인..."
worker_log=$(docker logs dwt-worker --tail 5 2>&1)
if echo "$worker_log" | grep -q "Listening on"; then
    _ok "Worker: 큐 리스닝 중"
else
    _warn "Worker: 큐 리스닝 상태 확인 필요"
    WARNINGS+=("Worker 큐 리스닝 상태 불확실")
fi

# ════════════════════════════════════════════════════════════════════════════
#  Phase 6: 정리 & 리포트
# ════════════════════════════════════════════════════════════════════════════
_step "Phase 6/6 — 정리 & 리포트"

# ── 6-1. Docker 정리 ──
if [[ "$CLEANUP_AFTER" == true ]]; then
    _info "사용하지 않는 Docker 리소스 정리..."
    freed=$(docker image prune -f 2>&1 | tail -1)
    _ok "이미지 정리: $freed"

    docker builder prune -f --keep-storage=500MB &>/dev/null 2>&1 || true
    _ok "빌드 캐시 정리 완료"
fi

# ── 6-2. 오래된 배포 로그 정리 ──
ls -t "${LOG_DIR}"/deploy-*.log 2>/dev/null | tail -n +$((MAX_LOG_FILES + 1)) | xargs -r rm -f

# ── 6-3. 최종 리포트 ──
DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))

echo "" | tee -a "$LOG_FILE"
_separator
echo -e "${BOLD}" | tee -a "$LOG_FILE"
echo "  배포 리포트" | tee -a "$LOG_FILE"
echo -e "${NC}" | tee -a "$LOG_FILE"
_separator

echo "" | tee -a "$LOG_FILE"
_info "브랜치:    ${current_branch}"
_info "커밋:      $(git rev-parse --short HEAD)"
_info "소요 시간: $(_duration $DEPLOY_DURATION)"
_info "로그:      ${LOG_FILE}"

if [[ -n "$CHANGES_PULLED" ]]; then
    echo "" | tee -a "$LOG_FILE"
    _info "반영된 커밋:"
    while IFS= read -r line; do
        _info "  ${line}"
    done <<< "$CHANGES_PULLED"
fi

# 리소스 현황
echo "" | tee -a "$LOG_FILE"
_info "리소스 현황:"
_info "  디스크 여유: $(df -h "$PROJECT_DIR" | awk 'NR==2{print $4}')"
_info "  메모리 여유: $(free -m | awk '/^Mem:/{print $7}')MB"

# 컨테이너 요약
echo "" | tee -a "$LOG_FILE"
_info "컨테이너 상태:"
docker ps --format "  {{.Names}}\t{{.Status}}" --filter "name=dwt-" 2>/dev/null | while read -r line; do
    _info "$line"
done

# 경고사항
if (( ${#WARNINGS[@]} > 0 )); then
    echo "" | tee -a "$LOG_FILE"
    _warn "경고 ${#WARNINGS[@]}건:"
    for w in "${WARNINGS[@]}"; do _warn "  · $w"; done
fi

# 최종 결과
echo "" | tee -a "$LOG_FILE"
_separator
if (( ${#ERRORS[@]} > 0 )); then
    _fail "배포 완료 (에러 ${#ERRORS[@]}건)"
    for e in "${ERRORS[@]}"; do _fail "  · $e"; done
    echo "" | tee -a "$LOG_FILE"
    exit 1
else
    _ok "${BOLD}배포 성공${NC} — $(_duration $DEPLOY_DURATION)"
    echo "" | tee -a "$LOG_FILE"
fi
