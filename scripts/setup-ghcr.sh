#!/usr/bin/env bash
# ============================================================================
#  GHCR (GitHub Container Registry) 로그인 설정
#  최초 1회만 실행하면 됨 (인증 정보가 ~/.docker/config.json에 저장됨)
# ============================================================================
set -euo pipefail

echo "=== GHCR 로그인 설정 ==="
echo ""
echo "GitHub Personal Access Token (PAT)이 필요합니다."
echo "  1. https://github.com/settings/tokens/new 접속"
echo "  2. 'read:packages' 권한만 선택"
echo "  3. 생성된 토큰을 아래에 입력"
echo ""
read -rp "GitHub 사용자명 (예: skp10216): " GITHUB_USER
read -rsp "GitHub PAT (read:packages): " GITHUB_TOKEN
echo ""

if echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin; then
    echo ""
    echo "[OK] GHCR 로그인 성공 — 인증 정보가 ~/.docker/config.json에 저장됨"
    echo "[OK] 이제 deploy.sh --ci 로 CI 배포가 가능합니다"
else
    echo ""
    echo "[FAIL] GHCR 로그인 실패 — 토큰과 사용자명을 확인하세요"
    exit 1
fi
