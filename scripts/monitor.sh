#!/usr/bin/env bash
# ============================================================================
#  DWT Price Center — System Monitor
#  cron: */5 * * * * /home/ec2-user/dwt-price-center/scripts/monitor.sh
# ============================================================================
set -euo pipefail

readonly LOG_FILE="/home/ec2-user/dwt-price-center/logs/monitor.log"
readonly ALERT_THRESHOLD_MEM=85
readonly ALERT_THRESHOLD_DISK=85
readonly ALERT_THRESHOLD_SWAP=50
readonly EXPECTED_CONTAINERS=(dwt-postgres dwt-redis dwt-backend dwt-worker dwt-frontend dwt-adminer)

_ts() { date '+%Y-%m-%d %H:%M:%S'; }
_log() { echo "$(_ts) $*" >> "$LOG_FILE"; }

_alert() {
    local msg="$1"
    _log "ALERT: $msg"
}

# ── Memory ──
total_mem=$(free | awk '/^Mem:/{print $2}')
avail_mem=$(free | awk '/^Mem:/{print $7}')
if (( total_mem > 0 )); then
    used_pct=$(( (total_mem - avail_mem) * 100 / total_mem ))
    if (( used_pct > ALERT_THRESHOLD_MEM )); then
        _alert "Memory ${used_pct}% (avail: $((avail_mem/1024))MB)"
    fi
fi

# ── Swap ──
swap_total=$(free | awk '/^Swap:/{print $2}')
swap_used=$(free | awk '/^Swap:/{print $3}')
if (( swap_total > 0 )); then
    swap_pct=$(( swap_used * 100 / swap_total ))
    if (( swap_pct > ALERT_THRESHOLD_SWAP )); then
        _alert "Swap ${swap_pct}% (${swap_used}KB / ${swap_total}KB)"
    fi
fi

# ── Disk ──
disk_pct=$(df / | awk 'NR==2{print $5}' | tr -d '%')
if (( disk_pct > ALERT_THRESHOLD_DISK )); then
    _alert "Disk ${disk_pct}%"
fi

# ── Docker Containers ──
for container in "${EXPECTED_CONTAINERS[@]}"; do
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
    if [[ "$status" != "running" ]]; then
        _alert "Container ${container}: ${status}"
    fi
done

# ── Hourly status summary ──
if [[ "$(date +%M)" == "00" ]]; then
    running=$(docker ps -q --filter "name=dwt-" 2>/dev/null | wc -l)
    _log "STATUS: mem=${used_pct:-0}% swap=${swap_pct:-0}% disk=${disk_pct}% containers=${running}/${#EXPECTED_CONTAINERS[@]}"
fi
