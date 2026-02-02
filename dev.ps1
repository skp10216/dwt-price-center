<#
.SYNOPSIS
    DWT Price Center - 통합 개발 스크립트
.DESCRIPTION
    빌드, 재시작, 마이그레이션, 로그 확인을 한 번에 처리하는 개발 도우미
.EXAMPLE
    .\dev.ps1              # 기본: 상태 확인 + 변경 감지 + 스마트 재시작
    .\dev.ps1 up           # 전체 서비스 시작
    .\dev.ps1 down         # 전체 서비스 중지
    .\dev.ps1 restart      # 전체 재시작 (빌드 포함)
    .\dev.ps1 restart be   # backend만 재시작
    .\dev.ps1 restart fe   # frontend만 재시작
    .\dev.ps1 restart wk   # worker만 재시작
    .\dev.ps1 logs         # 전체 로그 (follow)
    .\dev.ps1 logs be      # backend 로그만
    .\dev.ps1 migrate      # 마이그레이션 적용
    .\dev.ps1 migrate new "설명"  # 새 마이그레이션 생성
    .\dev.ps1 db           # DB 쉘 접속
    .\dev.ps1 shell be     # backend 컨테이너 쉘 접속
    .\dev.ps1 status       # 서비스 상태 + 헬스체크
    .\dev.ps1 clean        # 볼륨 제외 전체 정리
    .\dev.ps1 reset        # 볼륨 포함 완전 초기화
#>

param(
    [Parameter(Position=0)]
    [string]$Command = "smart",

    [Parameter(Position=1)]
    [string]$Target = "",

    [Parameter(Position=2)]
    [string]$Extra = ""
)

$ErrorActionPreference = "Stop"

# 색상 출력 함수
function Write-Step { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok { param([string]$msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err { param([string]$msg) Write-Host "[-] $msg" -ForegroundColor Red }
function Write-Info { param([string]$msg) Write-Host "    $msg" -ForegroundColor Gray }

# 서비스 약어 매핑
$ServiceMap = @{
    "be" = "backend"
    "fe" = "frontend"
    "wk" = "worker"
    "db" = "postgres"
    "rd" = "redis"
    "backend" = "backend"
    "frontend" = "frontend"
    "worker" = "worker"
    "postgres" = "postgres"
    "redis" = "redis"
}

# 서비스 이름 정규화
function Get-ServiceName {
    param([string]$short)
    if ($ServiceMap.ContainsKey($short)) {
        return $ServiceMap[$short]
    }
    return $short
}

# Docker Compose 실행
function Invoke-DC {
    param([string[]]$args)
    docker compose @args
}

# 서비스 상태 확인
function Show-Status {
    Write-Step "서비스 상태 확인"

    $services = @("postgres", "redis", "backend", "worker", "frontend")

    foreach ($svc in $services) {
        $container = "dwt-$svc"
        $status = docker inspect --format='{{.State.Status}}' $container 2>$null
        $health = docker inspect --format='{{.State.Health.Status}}' $container 2>$null

        if ($LASTEXITCODE -eq 0) {
            $statusIcon = switch ($status) {
                "running" { "[OK]" }
                "restarting" { "[~~]" }
                default { "[--]" }
            }
            $healthInfo = if ($health) { "($health)" } else { "" }

            $color = switch ($status) {
                "running" { "Green" }
                "restarting" { "Yellow" }
                default { "Red" }
            }
            Write-Host "  $statusIcon $svc $healthInfo" -ForegroundColor $color
        } else {
            Write-Host "  [--] $svc (not running)" -ForegroundColor DarkGray
        }
    }
}

# 헬스체크
function Test-Health {
    Write-Step "헬스체크 수행"

    # PostgreSQL
    Write-Info "PostgreSQL..."
    $pgHealth = docker exec dwt-postgres pg_isready -U dwt_user 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Ok "PostgreSQL OK" } else { Write-Err "PostgreSQL FAIL" }

    # Redis
    Write-Info "Redis..."
    $redisHealth = docker exec dwt-redis redis-cli ping 2>$null
    if ($redisHealth -eq "PONG") { Write-Ok "Redis OK" } else { Write-Err "Redis FAIL" }

    # Backend API
    Write-Info "Backend API..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) { Write-Ok "Backend API OK" } else { Write-Warn "Backend API responded with $($response.StatusCode)" }
    } catch {
        # /health 엔드포인트가 없을 수 있으므로 / 또는 /docs 시도
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) { Write-Ok "Backend API OK (via /docs)" } else { Write-Err "Backend API FAIL" }
        } catch {
            Write-Err "Backend API FAIL - $($_.Exception.Message)"
        }
    }

    # Frontend
    Write-Info "Frontend..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) { Write-Ok "Frontend OK" } else { Write-Warn "Frontend responded with $($response.StatusCode)" }
    } catch {
        Write-Err "Frontend FAIL - $($_.Exception.Message)"
    }
}

# 변경 감지 (git 기반)
function Get-ChangedServices {
    Write-Step "변경된 파일 감지 (git status)"

    $changed = @()

    $gitStatus = git status --porcelain 2>$null
    if ($gitStatus) {
        foreach ($line in $gitStatus -split "`n") {
            $file = $line.Substring(3).Trim()

            if ($file -match "^backend/") {
                if ($changed -notcontains "backend") { $changed += "backend" }
            }
            if ($file -match "^frontend/") {
                if ($changed -notcontains "frontend") { $changed += "frontend" }
            }
            if ($file -match "^worker/") {
                if ($changed -notcontains "worker") { $changed += "worker" }
            }
        }
    }

    if ($changed.Count -gt 0) {
        Write-Info "변경 감지: $($changed -join ', ')"
    } else {
        Write-Info "변경된 서비스 없음"
    }

    return $changed
}

# 마이그레이션 상태 확인
function Get-MigrationStatus {
    Write-Step "마이그레이션 상태 확인"

    $result = docker exec dwt-backend alembic current 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Info "현재: $result"
    } else {
        Write-Warn "마이그레이션 상태 확인 실패"
        return $false
    }

    $heads = docker exec dwt-backend alembic heads 2>&1
    Write-Info "최신: $heads"

    # 적용 필요 여부 확인
    $history = docker exec dwt-backend alembic history --indicate-current 2>&1
    if ($history -match "\(current\)" -and $history -match "\(head\)") {
        if ($history -match "\(current\)\s*\(head\)") {
            Write-Ok "마이그레이션 최신 상태"
            return $false
        }
    }

    Write-Warn "적용 대기 중인 마이그레이션 있음"
    return $true
}

# 마이그레이션 적용
function Invoke-Migration {
    param([string]$action = "upgrade", [string]$message = "")

    Write-Step "마이그레이션 $action"

    switch ($action) {
        "upgrade" {
            docker exec dwt-backend alembic upgrade head
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "마이그레이션 적용 완료"
            } else {
                Write-Err "마이그레이션 실패!"
                docker exec dwt-backend alembic current
            }
        }
        "new" {
            if (-not $message) {
                Write-Err "마이그레이션 설명을 입력하세요: .\dev.ps1 migrate new '설명'"
                return
            }
            docker exec dwt-backend alembic revision --autogenerate -m "$message"
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "새 마이그레이션 생성됨"
                Write-Warn "backend/alembic/versions/ 확인 후 수동 검토 필요"
            }
        }
        "downgrade" {
            docker exec dwt-backend alembic downgrade -1
            Write-Warn "마이그레이션 1단계 롤백됨"
        }
        "history" {
            docker exec dwt-backend alembic history --verbose
        }
    }
}

# 서비스 재시작
function Restart-Service {
    param([string]$service = "")

    if ($service) {
        $svcName = Get-ServiceName $service
        Write-Step "$svcName 재시작"
        Invoke-DC stop $svcName
        Invoke-DC up -d --build $svcName
        Write-Ok "$svcName 재시작 완료"
    } else {
        Write-Step "전체 서비스 재시작"
        Invoke-DC down
        Invoke-DC up -d --build
        Write-Ok "전체 서비스 재시작 완료"
    }
}

# 로그 보기
function Show-Logs {
    param([string]$service = "")

    if ($service) {
        $svcName = Get-ServiceName $service
        Write-Step "$svcName 로그"
        Invoke-DC logs -f --tail=100 $svcName
    } else {
        Write-Step "전체 로그"
        Invoke-DC logs -f --tail=50
    }
}

# 스마트 시작 (변경 감지 + 마이그레이션 + 헬스체크)
function Start-Smart {
    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Cyan
    Write-Host "  DWT Price Center - 개발 환경 점검" -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan

    # 1. 현재 상태 확인
    Show-Status

    # 2. 서비스가 실행 중인지 확인
    $running = docker ps --filter "name=dwt-" --format "{{.Names}}" 2>$null
    if (-not $running) {
        Write-Warn "실행 중인 서비스 없음. 전체 시작합니다..."
        Invoke-DC up -d --build
        Start-Sleep -Seconds 5
        Show-Status
    }

    # 3. 변경된 서비스 감지
    $changed = Get-ChangedServices

    # 4. 변경된 서비스 재시작
    if ($changed.Count -gt 0) {
        Write-Step "변경된 서비스 재시작"
        foreach ($svc in $changed) {
            Write-Info "$svc 재시작 중..."
            Invoke-DC up -d --build $svc
        }
        Start-Sleep -Seconds 3
    }

    # 5. 마이그레이션 확인 및 적용
    $needsMigration = Get-MigrationStatus
    if ($needsMigration) {
        $confirm = Read-Host "마이그레이션을 적용하시겠습니까? (y/N)"
        if ($confirm -eq "y" -or $confirm -eq "Y") {
            Invoke-Migration "upgrade"
        }
    }

    # 6. 헬스체크
    Test-Health

    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Green
    Write-Host "  준비 완료!" -ForegroundColor Green
    Write-Host "  Backend:  http://localhost:8000/docs" -ForegroundColor Gray
    Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Gray
    Write-Host "=======================================" -ForegroundColor Green
}

# 에러 로그 분석
function Show-Errors {
    Write-Step "최근 에러 로그 분석"

    Write-Info "=== Backend 에러 ==="
    docker logs dwt-backend --tail 200 2>&1 | Select-String -Pattern "ERROR|Exception|Traceback|error" -Context 2,5 | Select-Object -Last 10

    Write-Host ""
    Write-Info "=== Worker 에러 ==="
    docker logs dwt-worker --tail 200 2>&1 | Select-String -Pattern "ERROR|Exception|Traceback|error" -Context 2,5 | Select-Object -Last 10

    Write-Host ""
    Write-Info "=== Frontend 에러 ==="
    docker logs dwt-frontend --tail 200 2>&1 | Select-String -Pattern "Error|error|ERR" -Context 1,3 | Select-Object -Last 10
}

# 컨테이너 쉘 접속
function Enter-Shell {
    param([string]$service)

    $svcName = Get-ServiceName $service
    $container = "dwt-$svcName"

    Write-Step "$svcName 쉘 접속"
    docker exec -it $container /bin/sh
}

# DB 쉘 접속
function Enter-DB {
    Write-Step "PostgreSQL 쉘 접속"
    docker exec -it dwt-postgres psql -U dwt_user -d dwt_price_center
}

# 정리
function Invoke-Clean {
    param([bool]$includeVolumes = $false)

    if ($includeVolumes) {
        Write-Warn "볼륨 포함 전체 초기화"
        $confirm = Read-Host "정말로 모든 데이터를 삭제하시겠습니까? (yes/N)"
        if ($confirm -ne "yes") {
            Write-Info "취소됨"
            return
        }
        Invoke-DC down -v --remove-orphans
        docker system prune -f
        Write-Ok "완전 초기화 완료"
    } else {
        Write-Step "컨테이너 정리 (볼륨 유지)"
        Invoke-DC down --remove-orphans
        docker system prune -f
        Write-Ok "정리 완료"
    }
}

# 메인 라우팅
switch ($Command) {
    "smart" { Start-Smart }
    "up" {
        Write-Step "서비스 시작"
        Invoke-DC up -d --build
        Start-Sleep -Seconds 3
        Show-Status
    }
    "down" {
        Write-Step "서비스 중지"
        Invoke-DC down
    }
    "restart" { Restart-Service $Target }
    "logs" { Show-Logs $Target }
    "errors" { Show-Errors }
    "migrate" {
        if ($Target -eq "new") {
            Invoke-Migration "new" $Extra
        } elseif ($Target -eq "down") {
            Invoke-Migration "downgrade"
        } elseif ($Target -eq "history") {
            Invoke-Migration "history"
        } else {
            Invoke-Migration "upgrade"
        }
    }
    "db" { Enter-DB }
    "shell" { Enter-Shell $Target }
    "status" {
        Show-Status
        Test-Health
    }
    "health" { Test-Health }
    "clean" { Invoke-Clean $false }
    "reset" { Invoke-Clean $true }
    "help" {
        Get-Help $MyInvocation.MyCommand.Path -Detailed
    }
    default {
        Write-Err "알 수 없는 명령: $Command"
        Write-Host ""
        Write-Host "사용법:" -ForegroundColor Yellow
        Write-Host "  .\dev.ps1              # 스마트 시작 (상태확인 + 변경감지 + 마이그레이션)" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 up           # 전체 서비스 시작" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 down         # 전체 서비스 중지" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 restart [서비스]  # 재시작 (be/fe/wk)" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 logs [서비스]     # 로그 보기" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 errors       # 에러 로그 분석" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 migrate      # 마이그레이션 적용" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 migrate new '설명'  # 새 마이그레이션" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 db           # DB 쉘 접속" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 shell be     # 컨테이너 쉘 접속" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 status       # 상태 + 헬스체크" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 clean        # 정리 (볼륨 유지)" -ForegroundColor Gray
        Write-Host "  .\dev.ps1 reset        # 완전 초기화 (볼륨 삭제)" -ForegroundColor Gray
    }
}
