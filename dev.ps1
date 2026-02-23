# DWT Price Center - Development Helper Script
# Usage: .\dev.ps1 [command] [target] [extra]

param(
    [Parameter(Position=0)]
    [string]$Command = "smart",

    [Parameter(Position=1)]
    [string]$Target = "",

    [Parameter(Position=2)]
    [string]$Extra = ""
)

$ErrorActionPreference = "Continue"

function Write-Step { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Ok { param([string]$msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err { param([string]$msg) Write-Host "[-] $msg" -ForegroundColor Red }
function Write-Info { param([string]$msg) Write-Host "    $msg" -ForegroundColor Gray }

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

function Get-ServiceName {
    param([string]$short)
    if ($ServiceMap.ContainsKey($short)) { return $ServiceMap[$short] }
    return $short
}

function Invoke-DC {
    param([Parameter(ValueFromRemainingArguments=$true)]$args)
    & docker compose @args
}

function Show-Status {
    Write-Step "Service Status"
    $services = @("postgres", "redis", "backend", "worker", "frontend")
    foreach ($svc in $services) {
        $container = "dwt-$svc"
        $status = docker inspect --format='{{.State.Status}}' $container 2>$null
        if ($LASTEXITCODE -eq 0) {
            $color = if ($status -eq "running") { "Green" } else { "Red" }
            Write-Host "  [$status] $svc" -ForegroundColor $color
        } else {
            Write-Host "  [stopped] $svc" -ForegroundColor DarkGray
        }
    }
}

function Test-Health {
    Write-Step "Health Check"

    Write-Info "PostgreSQL..."
    $null = docker exec dwt-postgres pg_isready -U dwt_user 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Ok "PostgreSQL OK" } else { Write-Err "PostgreSQL FAIL" }

    Write-Info "Redis..."
    $redis = docker exec dwt-redis redis-cli ping 2>$null
    if ($redis -eq "PONG") { Write-Ok "Redis OK" } else { Write-Err "Redis FAIL" }

    Write-Info "Backend API..."
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/docs" -TimeoutSec 5 -ErrorAction Stop
        Write-Ok "Backend API OK"
    } catch {
        Write-Err "Backend API FAIL"
    }

    Write-Info "Frontend..."
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -ErrorAction Stop
        Write-Ok "Frontend OK"
    } catch {
        Write-Err "Frontend FAIL"
    }
}

function Get-ChangedServices {
    param([string[]]$changedFiles = @())
    
    Write-Step "Detecting changes"
    $changed = @()
    
    # changedFiles가 전달되면 그것 사용, 아니면 git status 사용
    if ($changedFiles.Count -eq 0) {
        $gitStatus = git status --porcelain 2>$null
        if ($gitStatus) {
            $changedFiles = ($gitStatus -split "`n") | ForEach-Object { 
                if ($_.Length -gt 3) { $_.Substring(3).Trim() }
            }
        }
    }
    
    foreach ($file in $changedFiles) {
        if ($file -match "^backend/" -and $changed -notcontains "backend") { $changed += "backend" }
        if ($file -match "^frontend/" -and $changed -notcontains "frontend") { $changed += "frontend" }
        if ($file -match "^worker/" -and $changed -notcontains "worker") { $changed += "worker" }
    }
    
    if ($changed.Count -gt 0) {
        Write-Info "Changed: $($changed -join ', ')"
    } else {
        Write-Info "No changes detected"
    }
    return $changed
}

# Git Pull 실행 및 변경된 파일 목록 반환
function Invoke-GitPull {
    Write-Step "Git Pull (fetching latest)"
    
    # 현재 브랜치 확인
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if (-not $branch) {
        Write-Warn "Not a git repository"
        return @()
    }
    Write-Info "Branch: $branch"
    
    # 현재 커밋 해시
    $beforeHash = git rev-parse HEAD 2>$null
    
    # git pull 실행
    $pullResult = git pull 2>&1
    $pullExitCode = $LASTEXITCODE
    
    if ($pullExitCode -ne 0) {
        Write-Err "Git pull failed: $pullResult"
        return @()
    }
    
    # 새 커밋 해시
    $afterHash = git rev-parse HEAD 2>$null
    
    if ($beforeHash -eq $afterHash) {
        Write-Ok "Already up to date"
        return @()
    }
    
    # 변경된 파일 목록 가져오기
    $changedFiles = git diff --name-only $beforeHash $afterHash 2>$null
    if ($changedFiles) {
        $fileList = $changedFiles -split "`n"
        $commitCount = git rev-list --count "$beforeHash..$afterHash" 2>$null
        Write-Ok "Pulled $commitCount commit(s), $($fileList.Count) file(s) changed"
        return $fileList
    }
    
    return @()
}

function Get-MigrationStatus {
    Write-Step "Migration Status"
    $current = docker exec -w /app dwt-backend bash -c "PYTHONPATH=/app alembic current 2>/dev/null" 2>$null
    $heads = docker exec -w /app dwt-backend bash -c "PYTHONPATH=/app alembic heads 2>/dev/null" 2>$null
    
    if ($current -and $heads) {
        # 버전 ID만 추출 (예: "008_add_user_counterparty_favorites (head)" -> "008_add_user_counterparty_favorites")
        $currentVersion = ($current -split '\s')[0]
        $headVersion = ($heads -split '\s')[0]
        
        Write-Info "Current: $currentVersion"
        Write-Info "Head: $headVersion"
        
        # 현재 버전과 head가 다르면 pending migration 있음
        if ($currentVersion -ne $headVersion) {
            return "pending"
        }
        return "ok"
    } else {
        Write-Warn "Could not check migration status"
        return "error"
    }
}

# 마이그레이션 자동 적용
function Invoke-AutoMigration {
    $status = Get-MigrationStatus
    
    if ($status -eq "pending") {
        Write-Step "Applying pending migrations"
        $result = docker exec -w /app dwt-backend bash -c "PYTHONPATH=/app alembic upgrade head" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Migration applied successfully"
            # 백엔드 재시작 (새 스키마 반영)
            Write-Info "Restarting backend to apply schema changes..."
            docker restart dwt-backend 2>$null
            Start-Sleep -Seconds 3
        } else {
            Write-Err "Migration failed!"
            Write-Info $result
        }
    } elseif ($status -eq "ok") {
        Write-Ok "Database is up to date"
    }
}

function Invoke-Migration {
    param([string]$action, [string]$message)

    Write-Step "Migration: $action"

    if ($action -eq "new") {
        if (-not $message) {
            Write-Err "Usage: .\dev.ps1 migrate new 'description'"
            return
        }
        docker exec dwt-backend alembic revision --autogenerate -m "$message"
        if ($LASTEXITCODE -eq 0) { Write-Ok "New migration created" }
    }
    elseif ($action -eq "down") {
        docker exec dwt-backend alembic downgrade -1
        Write-Warn "Rolled back 1 migration"
    }
    elseif ($action -eq "history") {
        docker exec dwt-backend alembic history --verbose
    }
    else {
        docker exec dwt-backend alembic upgrade head
        if ($LASTEXITCODE -eq 0) { Write-Ok "Migration applied" } else { Write-Err "Migration failed!" }
    }
}

function Restart-Svc {
    param([string]$service)

    if ($service) {
        $svcName = Get-ServiceName $service
        Write-Step "Restarting $svcName"
        docker compose stop $svcName
        docker compose up -d --build $svcName
        Write-Ok "$svcName restarted"
    } else {
        Write-Step "Restarting all services"
        docker compose down
        docker compose up -d --build
        Write-Ok "All services restarted"
    }
}

function Show-Logs {
    param([string]$service)

    if ($service) {
        $svcName = Get-ServiceName $service
        Write-Step "$svcName logs"
        docker compose logs -f --tail=100 $svcName
    } else {
        Write-Step "All logs"
        docker compose logs -f --tail=50
    }
}

function Show-Errors {
    Write-Step "Recent Error Logs"

    Write-Info "=== Backend Errors ==="
    docker logs dwt-backend --tail 200 2>&1 | Select-String -Pattern "ERROR|Exception|Traceback" -Context 2,5 | Select-Object -Last 10

    Write-Host ""
    Write-Info "=== Worker Errors ==="
    docker logs dwt-worker --tail 200 2>&1 | Select-String -Pattern "ERROR|Exception|Traceback" -Context 2,5 | Select-Object -Last 10

    Write-Host ""
    Write-Info "=== Frontend Errors ==="
    docker logs dwt-frontend --tail 200 2>&1 | Select-String -Pattern "Error|error|ERR" -Context 1,3 | Select-Object -Last 10
}

function Enter-Shell {
    param([string]$service)
    $svcName = Get-ServiceName $service
    Write-Step "Entering $svcName shell"
    docker exec -it "dwt-$svcName" /bin/sh
}

function Enter-DB {
    Write-Step "PostgreSQL Shell"
    docker exec -it dwt-postgres psql -U dwt_user -d dwt_price_center
}

function Invoke-Clean {
    param([bool]$includeVolumes)

    if ($includeVolumes) {
        Write-Warn "Full reset including volumes"
        $confirm = Read-Host "Delete all data? (yes/N)"
        if ($confirm -ne "yes") { Write-Info "Cancelled"; return }
        docker compose down -v --remove-orphans
        docker system prune -f
        Write-Ok "Full reset complete"
    } else {
        Write-Step "Cleaning (keeping volumes)"
        docker compose down --remove-orphans
        docker system prune -f
        Write-Ok "Clean complete"
    }
}

function Start-Smart {
    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Cyan
    Write-Host "  DWT Price Center - Dev Environment" -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan

    # 1. Git Pull - 최신 소스 가져오기
    $pulledFiles = Invoke-GitPull

    # 2. 서비스 상태 확인
    Show-Status

    $running = docker ps --filter "name=dwt-" --format "{{.Names}}" 2>$null
    if (-not $running) {
        Write-Warn "No services running. Starting all..."
        docker compose up -d --build
        Start-Sleep -Seconds 5
        Show-Status
    }

    # 3. 변경된 서비스 재빌드 (git pull로 받은 파일 또는 로컬 변경사항)
    $changed = @()
    if ($pulledFiles.Count -gt 0) {
        # git pull로 받은 파일 기준
        $changed = Get-ChangedServices -changedFiles $pulledFiles
    } else {
        # 로컬 변경사항 기준
        $changed = Get-ChangedServices
    }
    
    if ($changed.Count -gt 0) {
        Write-Step "Rebuilding changed services"
        foreach ($svc in $changed) {
            Write-Info "Rebuilding $svc..."
            docker compose up -d --build --force-recreate $svc
        }
        Start-Sleep -Seconds 3
    }

    # 4. DB 마이그레이션 자동 적용
    Invoke-AutoMigration

    # 5. 헬스 체크
    Test-Health

    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Green
    Write-Host "  Ready!" -ForegroundColor Green
    Write-Host "  Backend:  http://localhost:8000/docs" -ForegroundColor Gray
    Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Gray
    Write-Host "=======================================" -ForegroundColor Green
}

# Main routing
switch ($Command) {
    "smart"   { Start-Smart }
    "up"      { Write-Step "Starting services"; docker compose up -d --build; Start-Sleep 3; Show-Status }
    "down"    { Write-Step "Stopping services"; docker compose down }
    "restart" { Restart-Svc $Target }
    "logs"    { Show-Logs $Target }
    "errors"  { Show-Errors }
    "migrate" { Invoke-Migration $Target $Extra }
    "db"      { Enter-DB }
    "shell"   { Enter-Shell $Target }
    "status"  { Show-Status; Test-Health }
    "health"  { Test-Health }
    "clean"   { Invoke-Clean $false }
    "reset"   { Invoke-Clean $true }
    "help"    {
        Write-Host "Usage: .\dev.ps1 [command] [target] [extra]" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Commands:" -ForegroundColor Cyan
        Write-Host "  (none)        Smart start (git pull, rebuild, auto-migrate, health check)"
        Write-Host "  up            Start all services"
        Write-Host "  down          Stop all services"
        Write-Host "  restart [svc] Restart service (be/fe/wk or all)"
        Write-Host "  logs [svc]    Show logs (be/fe/wk or all)"
        Write-Host "  errors        Analyze recent error logs"
        Write-Host "  migrate       Apply pending migrations"
        Write-Host "  migrate new   Create new migration: migrate new 'description'"
        Write-Host "  migrate down  Rollback one migration"
        Write-Host "  db            PostgreSQL shell"
        Write-Host "  shell [svc]   Container shell (be/fe/wk)"
        Write-Host "  status        Show status and health"
        Write-Host "  clean         Clean up (keep data)"
        Write-Host "  reset         Full reset (delete data)"
        Write-Host ""
        Write-Host "Service shortcuts: be=backend, fe=frontend, wk=worker, db=postgres, rd=redis" -ForegroundColor Gray
    }
    default {
        Write-Err "Unknown command: $Command"
        Write-Host "Run '.\dev.ps1 help' for usage" -ForegroundColor Gray
    }
}
