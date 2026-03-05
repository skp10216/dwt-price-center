#!/usr/bin/env bash
# ============================================================================
#  DWT Price Center — Docker Container Watchdog
#  Triggered by systemd timer every 2 minutes
# ============================================================================
set -euo pipefail

readonly PROJECT_DIR="/home/ec2-user/dwt-price-center"
readonly COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
readonly LOG_FILE="${PROJECT_DIR}/logs/watchdog.log"
readonly CORE_CONTAINERS=(dwt-postgres dwt-redis dwt-backend dwt-frontend)

_log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"; }

cd "$PROJECT_DIR"

needs_restart=false

for container in "${CORE_CONTAINERS[@]}"; do
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
    if [[ "$status" != "running" ]]; then
        _log "WATCHDOG: ${container} is ${status}"
        needs_restart=true
    fi
done

if [[ "$needs_restart" == true ]]; then
    _log "WATCHDOG: Restarting services..."
    docker compose ${COMPOSE_FILES} up -d 2>&1 | while read -r line; do
        _log "  $line"
    done
    _log "WATCHDOG: Restart complete"
fi
