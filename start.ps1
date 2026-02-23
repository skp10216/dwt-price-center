# DWT Price Center - Server Startup Script
# Usage: .\start.ps1 (재부팅 후 이 파일만 실행하면 모든 서비스가 시작됩니다)
#
# 기능:
#   1. Docker Desktop 자동 시작 및 대기
#   2. 포트 충돌 감지
#   3. Docker Compose 서비스 전체 시작
#   4. DB 마이그레이션 자동 적용
#   5. 전체 헬스체크 (재시도 포함)
#   6. 실패 서비스 자동 재시작
#   7. 최종 결과 요약 리포트

param(
    [switch]$SkipPull,       # git pull 건너뛰기
    [switch]$Rebuild,        # 강제 리빌드
    [switch]$Verbose         # 상세 로그
)

$ErrorActionPreference = "Continue"
$script:StartTime = Get-Date
$script:Errors = @()
$script:Warnings = @()

# ============================================================
# Utility Functions
# ============================================================
function Write-Banner {
    param([string]$msg)
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host "   $msg" -ForegroundColor Cyan
    Write-Host "  ========================================" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$step, [string]$msg)
    Write-Host ""
    Write-Host "  [$step] $msg" -ForegroundColor Yellow
    Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
}

function Write-Ok    { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Fail  { param([string]$msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:Errors += $msg }
function Write-Warn  { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:Warnings += $msg }
function Write-Info  { param([string]$msg) Write-Host "        $msg" -ForegroundColor Gray }
function Write-Detail { param([string]$msg) if ($Verbose) { Write-Host "        $msg" -ForegroundColor DarkGray } }

# ============================================================
# STEP 1: Docker Desktop 확인 및 자동 시작
# ============================================================
function Start-DockerDesktop {
    Write-Step "1/7" "Docker Desktop 확인"

    # Docker 명령어 사용 가능 여부 확인
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Fail "Docker가 설치되어 있지 않습니다. Docker Desktop을 설치해주세요."
        return $false
    }

    # Docker daemon 실행 중인지 확인
    $null = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Docker Desktop 실행 중"
        return $true
    }

    # Docker Desktop 시작 시도
    Write-Info "Docker Desktop 시작 중..."
    $dockerPath = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $dockerPath) {
        Write-Fail "Docker Desktop 실행 파일을 찾을 수 없습니다."
        return $false
    }

    Start-Process $dockerPath
    Write-Info "Docker Desktop이 시작될 때까지 대기 중... (최대 120초)"

    $timeout = 120
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 3
        $elapsed += 3
        $null = docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok ("Docker Desktop 준비 완료 (" + $elapsed + "초 소요)")
            return $true
        }
        if ($elapsed % 15 -eq 0) {
            Write-Info ("  대기 중... (" + $elapsed + "/" + $timeout + "초)")
        }
    }

    Write-Fail ("Docker Desktop 시작 시간 초과 (" + $timeout + "초). 수동으로 Docker Desktop을 시작해주세요.")
    return $false
}

# ============================================================
# STEP 2: 사전 조건 확인
# ============================================================
function Test-Prerequisites {
    Write-Step "2/7" "사전 조건 확인"
    $allGood = $true

    # .env 파일 확인
    if (Test-Path ".env") {
        Write-Ok ".env 파일 존재"
    } else {
        Write-Warn ".env 파일이 없습니다. env.sample에서 복사합니다."
        if (Test-Path "env.sample") {
            Copy-Item "env.sample" ".env"
            Write-Ok ".env 파일 생성 완료 (env.sample에서 복사)"
            Write-Warn ".env 파일의 비밀번호를 실제 값으로 변경해주세요!"
        } else {
            Write-Fail ".env 파일과 env.sample 모두 없습니다."
            $allGood = $false
        }
    }

    # docker-compose.yml 확인
    if (Test-Path "docker-compose.yml") {
        Write-Ok "docker-compose.yml 존재"
    } else {
        Write-Fail "docker-compose.yml 파일을 찾을 수 없습니다."
        $allGood = $false
    }

    # 디스크 공간 확인 (최소 2GB 여유)
    $drive = (Get-Location).Path.Substring(0, 2)
    $freeGB = [math]::Round((Get-PSDrive ($drive -replace ':', '')).Free / 1GB, 1)
    if ($freeGB -gt 2) {
        Write-Ok ("디스크 여유 공간: " + $freeGB + "GB")
    } else {
        Write-Warn ("디스크 여유 공간 부족: " + $freeGB + "GB (최소 2GB 권장)")
    }

    # 포트 충돌 확인
    $ports = @(
        @{ Port = 3000; Service = "Frontend" },
        @{ Port = 5432; Service = "PostgreSQL" },
        @{ Port = 6379; Service = "Redis" },
        @{ Port = 8000; Service = "Backend API" },
        @{ Port = 8080; Service = "Adminer" }
    )

    $portConflict = $false
    foreach ($p in $ports) {
        $conn = Get-NetTCPConnection -LocalPort $p.Port -ErrorAction SilentlyContinue |
                Where-Object { $_.State -eq "Listen" }
        if ($conn) {
            $processId = $conn.OwningProcess | Select-Object -First 1
            $processName = (Get-Process -Id $processId -ErrorAction SilentlyContinue).ProcessName
            # Docker 자체 프로세스는 무시
            if ($processName -and $processName -notmatch "com.docker|vpnkit|Docker|wslrelay|postgres|redis") {
                Write-Warn "포트 $($p.Port) ($($p.Service)) 사용 중: $processName (PID: $processId)"
                $portConflict = $true
            }
        }
    }
    if (-not $portConflict) {
        Write-Ok "필수 포트 사용 가능 (3000, 5432, 6379, 8000, 8080)"
    }

    return $allGood
}

# ============================================================
# STEP 3: Git Pull (선택)
# ============================================================
function Invoke-GitPullStep {
    Write-Step "3/7" "소스 코드 최신화"

    if ($SkipPull) {
        Write-Info "Git pull 건너뜀 (-SkipPull)"
        return @()
    }

    $isGitRepo = git rev-parse --is-inside-work-tree 2>$null
    if ($isGitRepo -ne "true") {
        Write-Info "Git 저장소가 아닙니다. 건너뜀."
        return @()
    }

    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    Write-Info "현재 브랜치: $branch"

    # 로컬 변경사항 확인
    $localChanges = git status --porcelain 2>$null
    if ($localChanges) {
        Write-Warn "로컬 변경사항이 있어 git pull을 건너뜁니다."
        Write-Detail ($localChanges | Select-Object -First 5 | Out-String)
        return @()
    }

    $beforeHash = git rev-parse HEAD 2>$null
    $pullResult = git pull 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Git pull 실패: $pullResult"
        return @()
    }

    $afterHash = git rev-parse HEAD 2>$null
    if ($beforeHash -eq $afterHash) {
        Write-Ok "이미 최신 상태"
        return @()
    }

    $changedFiles = (git diff --name-only $beforeHash $afterHash 2>$null) -split "`n"
    $commitCount = git rev-list --count "$beforeHash..$afterHash" 2>$null
    Write-Ok "$commitCount 커밋, $($changedFiles.Count) 파일 변경 감지"

    return $changedFiles
}

# ============================================================
# STEP 4: Docker Compose 서비스 시작
# ============================================================
function Start-Services {
    param([string[]]$changedFiles = @())

    Write-Step "4/7" "서비스 시작"

    # 기존 컨테이너 상태 확인
    $runningContainers = docker ps --filter "name=dwt-" --format "{{.Names}}" 2>$null
    $allContainers = docker ps -a --filter "name=dwt-" --format "{{.Names}}" 2>$null

    if ($Rebuild) {
        Write-Info "강제 리빌드 모드 (-Rebuild)"
        Write-Info "이미지 리빌드 중..."
        docker compose build --no-cache 2>&1 | ForEach-Object { Write-Detail $_ }
        docker compose up -d --force-recreate 2>&1 | ForEach-Object { Write-Detail $_ }
        Write-Ok "전체 리빌드 완료"
    }
    elseif (-not $runningContainers) {
        # 실행 중인 컨테이너가 없으면 전체 시작
        Write-Info "서비스 시작 중..."
        docker compose up -d --build 2>&1 | ForEach-Object { Write-Detail $_ }
        Write-Ok "전체 서비스 시작 요청 완료"
    }
    else {
        Write-Info "기존 실행 중인 서비스 감지: $($runningContainers -join ', ')"

        # 변경된 파일이 있으면 해당 서비스만 리빌드
        $toRebuild = @()
        foreach ($file in $changedFiles) {
            if ($file -match "^backend/" -and $toRebuild -notcontains "backend") { $toRebuild += "backend" }
            if ($file -match "^frontend/" -and $toRebuild -notcontains "frontend") { $toRebuild += "frontend" }
            if ($file -match "^worker/" -and $toRebuild -notcontains "worker") { $toRebuild += "worker" }
        }

        if ($toRebuild.Count -gt 0) {
            Write-Info "변경된 서비스 리빌드: $($toRebuild -join ', ')"
            foreach ($svc in $toRebuild) {
                docker compose up -d --build --force-recreate $svc 2>&1 | ForEach-Object { Write-Detail $_ }
            }
            Write-Ok "변경 서비스 리빌드 완료"
        }

        # 누락된 서비스 시작
        $expectedServices = @("postgres", "redis", "backend", "worker", "frontend", "adminer")
        $missingServices = @()
        foreach ($svc in $expectedServices) {
            $containerName = "dwt-$svc"
            if ($runningContainers -notcontains $containerName) {
                $missingServices += $svc
            }
        }

        if ($missingServices.Count -gt 0) {
            Write-Info "중지된 서비스 시작: $($missingServices -join ', ')"
            docker compose up -d $($missingServices -join ' ') 2>&1 | ForEach-Object { Write-Detail $_ }
        }

        Write-Ok "서비스 상태 동기화 완료"
    }

    # 컨테이너 시작 대기
    Write-Info "컨테이너 초기화 대기 중... (15초)"
    Start-Sleep -Seconds 15
}

# ============================================================
# STEP 5: DB 마이그레이션
# ============================================================
function Invoke-MigrationStep {
    Write-Step "5/7" "데이터베이스 마이그레이션"

    # 백엔드 컨테이너가 실행 중인지 확인
    $backendStatus = docker inspect --format='{{.State.Status}}' dwt-backend 2>$null
    if ($backendStatus -ne "running") {
        Write-Warn "Backend 컨테이너가 실행 중이 아닙니다. 마이그레이션 건너뜀."
        return
    }

    # 현재 마이그레이션 상태 확인
    $current = docker exec -w /app dwt-backend bash -c "PYTHONPATH=/app alembic current 2>/dev/null" 2>$null
    $heads = docker exec -w /app dwt-backend bash -c "PYTHONPATH=/app alembic heads 2>/dev/null" 2>$null

    if (-not $current -or -not $heads) {
        Write-Warn "마이그레이션 상태를 확인할 수 없습니다."
        return
    }

    $currentVersion = ($current -split '\s')[0]
    $headVersion = ($heads -split '\s')[0]

    Write-Info "현재 DB: $currentVersion"
    Write-Info "최신 버전: $headVersion"

    if ($currentVersion -ne $headVersion) {
        Write-Info "보류 중인 마이그레이션 적용 중..."
        $result = docker exec -w /app dwt-backend bash -c "PYTHONPATH=/app alembic upgrade head" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "마이그레이션 적용 완료"
            Write-Info "Backend 재시작 중 (스키마 변경 반영)..."
            docker restart dwt-backend 2>$null
            Start-Sleep -Seconds 5
        } else {
            Write-Fail "마이그레이션 실패: $result"
        }
    } else {
        Write-Ok "데이터베이스 최신 상태"
    }
}

# ============================================================
# STEP 6: 헬스체크 (재시도 로직 포함)
# ============================================================
function Test-AllHealth {
    Write-Step "6/7" "서비스 헬스체크"

    $maxRetries = 4
    $retryDelay = 15
    $results = @{}

    # 각 서비스별 헬스체크 정의
    $checks = @(
        @{
            Name    = "PostgreSQL"
            Container = "dwt-postgres"
            Test    = { docker exec dwt-postgres pg_isready -U dwt_user 2>$null; $LASTEXITCODE -eq 0 }
        },
        @{
            Name    = "Redis"
            Container = "dwt-redis"
            Test    = { (docker exec dwt-redis redis-cli ping 2>$null) -eq "PONG" }
        },
        @{
            Name    = "Backend API"
            Container = "dwt-backend"
            Test    = {
                try {
                    $r = Invoke-WebRequest -Uri "http://localhost:8000/docs" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
                    $r.StatusCode -eq 200
                } catch { $false }
            }
        },
        @{
            Name    = "Worker"
            Container = "dwt-worker"
            Test    = {
                $status = docker inspect --format='{{.State.Status}}' dwt-worker 2>$null
                $status -eq "running"
            }
        },
        @{
            Name    = "Frontend"
            Container = "dwt-frontend"
            Test    = {
                try {
                    $r = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
                    $r.StatusCode -eq 200
                } catch { $false }
            }
        },
        @{
            Name    = "Adminer"
            Container = "dwt-adminer"
            Test    = {
                try {
                    $r = Invoke-WebRequest -Uri "http://localhost:8080" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
                    $r.StatusCode -eq 200
                } catch { $false }
            }
        }
    )

    foreach ($check in $checks) {
        $success = $false
        for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
            Write-Info "$($check.Name) 확인 중... (시도 $attempt/$maxRetries)"
            $testResult = & $check.Test
            if ($testResult) {
                Write-Ok "$($check.Name) 정상"
                $success = $true
                $results[$check.Name] = "OK"
                break
            }

            if ($attempt -lt $maxRetries) {
                # 컨테이너가 중지된 경우 재시작 시도
                $containerStatus = docker inspect --format='{{.State.Status}}' $check.Container 2>$null
                if ($containerStatus -ne "running") {
                    Write-Warn "$($check.Name) 컨테이너 재시작 시도..."
                    docker compose up -d $($check.Container -replace 'dwt-', '') 2>$null
                }
                Write-Info ("  " + $retryDelay + "초 후 재시도...")
                Start-Sleep -Seconds $retryDelay
            }
        }

        if (-not $success) {
            Write-Fail "$($check.Name) 응답 없음"
            $results[$check.Name] = "FAIL"

            # 실패 시 최근 로그 출력
            Write-Info "  최근 로그:"
            $logs = docker logs $check.Container --tail 10 2>&1
            foreach ($line in ($logs -split "`n" | Select-Object -Last 5)) {
                Write-Info "    $line"
            }
        }
    }

    return $results
}

# ============================================================
# STEP 7: 최종 결과 리포트
# ============================================================
function Show-Report {
    param([hashtable]$healthResults)

    $elapsed = [math]::Round(((Get-Date) - $script:StartTime).TotalSeconds)

    Write-Step "7/7" "최종 결과 리포트"

    # 서비스 상태 테이블
    $okCount = ($healthResults.Values | Where-Object { $_ -eq "OK" }).Count
    $failCount = ($healthResults.Values | Where-Object { $_ -eq "FAIL" }).Count

    Write-Host ""
    Write-Host "  Service           Status" -ForegroundColor White
    Write-Host "  ───────────────────────────" -ForegroundColor DarkGray
    foreach ($key in @("PostgreSQL", "Redis", "Backend API", "Worker", "Frontend", "Adminer")) {
        $status = $healthResults[$key]
        if (-not $status) { $status = "SKIP" }
        $icon = switch ($status) {
            "OK"   { "[OK]  " }
            "FAIL" { "[FAIL]" }
            default { "[SKIP]" }
        }
        $color = switch ($status) {
            "OK"    { "Green" }
            "FAIL"  { "Red" }
            default { "DarkGray" }
        }
        Write-Host "  $icon $($key.PadRight(18))" -ForegroundColor $color
    }
    Write-Host "  ───────────────────────────" -ForegroundColor DarkGray

    # 경고/오류 요약
    if ($script:Warnings.Count -gt 0) {
        Write-Host ""
        Write-Host "  Warnings ($($script:Warnings.Count)):" -ForegroundColor Yellow
        foreach ($w in $script:Warnings) {
            Write-Host "    - $w" -ForegroundColor Yellow
        }
    }

    if ($script:Errors.Count -gt 0) {
        Write-Host ""
        Write-Host "  Errors ($($script:Errors.Count)):" -ForegroundColor Red
        foreach ($e in $script:Errors) {
            Write-Host "    - $e" -ForegroundColor Red
        }
    }

    # 접속 URL 안내
    Write-Host ""
    if ($failCount -eq 0) {
        Write-Banner "ALL SERVICES RUNNING"
    } else {
        Write-Host "  ========================================" -ForegroundColor Red
        Write-Host "   $failCount SERVICE(S) FAILED" -ForegroundColor Red
        Write-Host "  ========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "  문제 해결:" -ForegroundColor Yellow
        Write-Host "    .\dev.ps1 errors       # 에러 로그 확인" -ForegroundColor Gray
        Write-Host "    .\dev.ps1 logs be      # 백엔드 로그" -ForegroundColor Gray
        Write-Host "    .\dev.ps1 restart be   # 서비스 재시작" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "  Frontend:     http://localhost:3000" -ForegroundColor White
    Write-Host "  Backend API:  http://localhost:8000/docs" -ForegroundColor White
    Write-Host "  Adminer (DB): http://localhost:8080" -ForegroundColor White
    Write-Host ""
    Write-Host ("  소요 시간: " + $elapsed + "초") -ForegroundColor DarkGray
    Write-Host ""
}

# ============================================================
# MAIN - 실행 순서
# ============================================================
Write-Banner "DWT Price Center - Server Startup"
Write-Host "        $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray

# 프로젝트 디렉토리로 이동
Set-Location $PSScriptRoot

# Step 1: Docker Desktop
$dockerReady = Start-DockerDesktop
if (-not $dockerReady) {
    Write-Host ""
    Write-Fail "Docker Desktop이 실행되지 않아 중단합니다."
    Write-Host ""
    exit 1
}

# Step 2: 사전 조건
$prereqOk = Test-Prerequisites
if (-not $prereqOk) {
    Write-Host ""
    Write-Fail "사전 조건을 충족하지 못했습니다."
    Write-Host ""
    exit 1
}

# Step 3: Git Pull
$changedFiles = Invoke-GitPullStep

# Step 4: 서비스 시작
Start-Services -changedFiles $changedFiles

# Step 5: 마이그레이션
Invoke-MigrationStep

# Step 6: 헬스체크
$healthResults = Test-AllHealth

# Step 7: 리포트
Show-Report -healthResults $healthResults
