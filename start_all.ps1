#Requires -Version 5.1
<#
.SYNOPSIS
    Start the entire CTM Platform (all 10 microservices + infrastructure).

.DESCRIPTION
    Performs pre-flight checks, sets up the .env file, starts all Docker
    Compose services in dependency order, waits for each health check to
    pass, and prints a live status table when everything is up.

.EXAMPLE
    .\start_all.ps1
    .\start_all.ps1 -Rebuild          # force re-build images before starting
    .\start_all.ps1 -Detach:$false    # stream all logs to console (dev mode)
#>

param(
    [switch]$Rebuild,
    [switch]$NoHealthWait,
    [bool]$Detach = $true
)

Set-StrictMode -Version Latest
# Use Continue so docker stderr warnings don't abort the script
$ErrorActionPreference = "Continue"

# ---- Colours ----------------------------------------------------------------
function Write-Header  { param($msg) Write-Host "" ; Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok      { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail    { param($msg) Write-Host "  [X]   $msg" -ForegroundColor Red }
function Write-Step    { param($msg) Write-Host "  -->   $msg" -ForegroundColor DarkCyan }
function Write-Divider { Write-Host ("  " + ("-" * 60)) -ForegroundColor DarkGray }

# ---- Root directory ---------------------------------------------------------
$Root = $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Cyan
Write-Host "  |        CTM Platform  -  Start All Services                  |" -ForegroundColor Cyan
Write-Host "  ================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Step 1: Pre-flight checks
# ============================================================
Write-Header "Step 1 - Pre-flight checks"

try {
    $dockerVer = docker version --format "{{.Server.Version}}" 2>$null
    if (-not $dockerVer) { throw "Docker not running" }
    Write-Ok "Docker Engine $dockerVer"
} catch {
    Write-Fail "Docker is not running or not installed."
    Write-Warn "Start Docker Desktop and re-run this script."
    exit 1
}

try {
    $composeVer = docker compose version --short 2>$null
    if (-not $composeVer) { throw "Compose not found" }
    Write-Ok "Docker Compose $composeVer"
} catch {
    Write-Fail "docker compose plugin not found."
    Write-Warn "Upgrade Docker Desktop to v4+ which bundles Compose v2."
    exit 1
}

$VertexKeyDefault = "C:\Users\User\Code\VertexKeys\d-sxd110x-ssd1-aaos-34f80b5f4448.json"
if (Test-Path $VertexKeyDefault) {
    Write-Ok "Vertex AI key found: $VertexKeyDefault"
} else {
    Write-Warn "Vertex AI key not found at: $VertexKeyDefault"
    Write-Warn "AI features will be degraded. Set VERTEX_KEY_PATH in .env to override."
}

Write-Divider

# ============================================================
# Step 2: .env file
# ============================================================
Write-Header "Step 2 - Environment configuration"

$EnvFile    = Join-Path $Root ".env"
$EnvExample = Join-Path $Root ".env.example"

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Ok ".env created from .env.example"
        Write-Warn "Review $EnvFile and add any missing secrets before proceeding."
    } else {
        Write-Fail ".env and .env.example not found."
        exit 1
    }
} else {
    Write-Ok ".env found"
}

$envContent = Get-Content $EnvFile -Raw
if ($envContent -notmatch "VERTEX_KEY_PATH") {
    Add-Content $EnvFile "`nVERTEX_KEY_PATH=$VertexKeyDefault"
    Write-Ok "VERTEX_KEY_PATH written to .env"
} else {
    Write-Ok "VERTEX_KEY_PATH already set in .env"
}

Write-Divider

# ============================================================
# Step 3: Start infrastructure
# ============================================================
Write-Header "Step 3 - Starting infrastructure services"

$infraServices = @("postgres", "redis", "kafka", "minio")

Write-Step "Pulling infrastructure images..."
docker compose pull $infraServices --quiet 2>$null

if ($Rebuild) {
    Write-Step "Building infrastructure images..."
    docker compose build $infraServices --quiet
}

Write-Step "Starting: $($infraServices -join ', ')"
docker compose up -d $infraServices
if ($LASTEXITCODE -ne 0) {
    Write-Fail "docker compose up failed for infrastructure"
    exit 1
}

docker compose up -d kafka-ui 2>$null

Write-Step "Initialising MinIO buckets..."
docker compose up minio-init 2>$null | Out-Null

Write-Divider

# ============================================================
# Step 4: Wait for infrastructure health
# ============================================================
if (-not $NoHealthWait) {
    Write-Header "Step 4 - Waiting for infrastructure health checks"

    $healthTargets = @{
        "ctm-postgres" = 120
        "ctm-redis"    = 30
        "ctm-kafka"    = 90
        "ctm-minio"    = 30
    }

    foreach ($container in $healthTargets.Keys) {
        $timeout  = $healthTargets[$container]
        $elapsed  = 0
        $interval = 3
        $healthy  = $false

        Write-Step "Waiting for $container (timeout: ${timeout}s)..."
        while ($elapsed -lt $timeout) {
            $status = docker inspect --format "{{.State.Health.Status}}" $container 2>$null
            if ($status -eq "healthy") {
                $healthy = $true
                break
            }
            Start-Sleep $interval
            $elapsed += $interval
            Write-Host "    [$elapsed s] status: $status" -ForegroundColor DarkGray
        }

        if ($healthy) {
            Write-Ok "$container is healthy"
        } else {
            Write-Warn "$container did not become healthy within ${timeout}s - continuing anyway"
        }
    }
}

Write-Divider


# ============================================================
# Step 5: Start application microservices
# ============================================================
Write-Header "Step 5 - Starting application microservices"

$appServices = @(
    @{ name = "collab-service";    label = "M2 Collaboration Engine" }
    @{ name = "api-service";       label = "M3+M4 API Gateway + Formula Engine" }
    @{ name = "pm-service";        label = "M5 PM Service (Go)" }
    @{ name = "ai-service";        label = "M6 AI Agent Service (Python)" }
    @{ name = "messaging-service"; label = "M7 Messaging Service" }
)

function Build-ServiceIfNeeded($serviceName, $label) {
    if ($Rebuild) {
        Write-Step "Building $label..."
        docker compose build $serviceName --quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Build failed for $label"
            exit 1
        }
        return
    }

    $imageId = docker compose images --quiet $serviceName 2>$null
    if (-not $imageId) {
        Write-Step "Building missing image for $label..."
        docker compose build $serviceName --quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Build failed for $label"
            exit 1
        }
    }
}

foreach ($svc in $appServices) {
    Write-Step "Starting $($svc.label)..."
    Build-ServiceIfNeeded $svc.name $svc.label
    docker compose up -d $svc.name
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to start $($svc.name) - check: docker compose logs $($svc.name)"
        exit 1
    }
    Write-Ok "$($svc.label) started"
}

Write-Divider

# ============================================================
# Step 6: Start Frontend (M1)
# ============================================================
Write-Header "Step 6 - Starting Frontend (M1 - Next.js 15)"

if ($Rebuild) {
    docker compose build frontend --quiet
}
docker compose up -d frontend
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Frontend started"
} else {
    Write-Warn "Frontend failed - check: docker compose logs frontend"
}

Write-Divider

# ============================================================
# Step 6: Wait for application health endpoints
# ============================================================
if (-not $NoHealthWait) {
    Write-Header "Step 6 - Waiting for application health endpoints"

    $healthEndpoints = @(
        @{ url = "http://localhost:3001/health"; label = "M3 API Gateway";       timeout = 60; reqTimeout = 5 }
        @{ url = "http://localhost:8001/health"; label = "M6 AI Service";        timeout = 90; reqTimeout = 5 }
        @{ url = "http://localhost:3002/health"; label = "M7 Messaging Service"; timeout = 60; reqTimeout = 5 }
    )

    foreach ($ep in $healthEndpoints) {
        Write-Step "Checking $($ep.label) at $($ep.url)..."
        $elapsed = 0
        $up = $false

        $reqTimeout = if ($ep.reqTimeout) { $ep.reqTimeout } else { 5 }
        while ($elapsed -lt $ep.timeout) {
            try {
                $resp = Invoke-WebRequest -Uri $ep.url `
                    -TimeoutSec $reqTimeout -UseBasicParsing -ErrorAction SilentlyContinue
                if ($resp.StatusCode -lt 400) {
                    $up = $true
                    break
                }
            } catch { }

            Start-Sleep 5
            $elapsed += 5
            Write-Host "    [$elapsed s] waiting..." -ForegroundColor DarkGray
        }

        if ($up) {
            Write-Ok "$($ep.label) is up"
        } else {
            Write-Warn "$($ep.label) did not respond in $($ep.timeout)s - may still be starting"
        }
    }

    # ── Frontend: TCP port check (avoids triggering Next.js JIT compilation) ──
    Write-Step "Checking M1 Frontend (port 3000)..."
    $feUp = $false
    $feElapsed = 0
    while ($feElapsed -lt 30) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("localhost", 3000)
            $tcp.Close()
            $feUp = $true
            break
        } catch { }
        Start-Sleep 2
        $feElapsed += 2
    }
    if ($feUp) {
        Write-Ok "M1 Frontend is up at http://localhost:3000"
    } else {
        Write-Warn "M1 Frontend port 3000 not open after 30s - check: docker compose logs frontend"
    }
}

Write-Divider

# ============================================================
# Step 7: Status summary
# ============================================================
Write-Header "Step 7 - Service status"

$allContainers = @(
    @{ container = "ctm-postgres";   label = "M9  PostgreSQL 16 + pgvector";   port = "5432" }
    @{ container = "ctm-redis";      label = "M9  Redis 7.2";                  port = "6379" }
    @{ container = "ctm-kafka";      label = "M8  Kafka 3.7 (KRaft)";          port = "9092" }
    @{ container = "ctm-kafka-ui";   label = "M8  Kafka UI";                   port = "8090" }
    @{ container = "ctm-minio";      label = "M9  MinIO (S3)";                 port = "9001" }
    @{ container = "ctm-collab";     label = "M2  Collaboration Engine";       port = "1234" }
    @{ container = "ctm-api";        label = "M3+M4 API Gateway + Formulas";   port = "3001" }
    @{ container = "ctm-pm";         label = "M5  PM Service (Go)";            port = "8085" }
    @{ container = "ctm-ai";         label = "M6  AI Agent Service";           port = "8001" }
    @{ container = "ctm-messaging";  label = "M7  Messaging Service";          port = "3002" }
    @{ container = "ctm-frontend";   label = "M1  Frontend (Next.js 15)";      port = "3000" }
)

Write-Host ""
Write-Host ("  {0,-42} {1,-8} {2}" -f "Service", "Port", "Status") -ForegroundColor White
Write-Host ("  {0,-42} {1,-8} {2}" -f ("-" * 40), ("-" * 6), ("-" * 12)) -ForegroundColor DarkGray

foreach ($svc in $allContainers) {
    $state  = docker inspect --format "{{.State.Status}}" $svc.container 2>$null
    $health = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}" $svc.container 2>$null

    # Build status text without multi-line if-expression (PS 5.1 compatible)
    if ($state -eq "running") {
        if ($health -eq "healthy") {
            $statusText = "running [OK]"
        } elseif ($health -eq "n/a") {
            $statusText = "running"
        } else {
            $statusText = "running ($health)"
        }
        $color = "Green"
    } elseif ($state) {
        $statusText = $state
        $color = "Red"
    } else {
        $statusText = "not found"
        $color = "Red"
    }

    Write-Host ("  {0,-42} {1,-8} {2}" -f $svc.label, $svc.port, $statusText) -ForegroundColor $color
}

Write-Host ""
Write-Divider

# ============================================================
# Done
# ============================================================
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host "  |              CTM Platform is running!                       |" -ForegroundColor Green
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Access points:" -ForegroundColor White
Write-Host "    Frontend    -> http://localhost:3000" -ForegroundColor Cyan
Write-Host "    API Docs    -> http://localhost:3001/v1/docs  (Swagger)" -ForegroundColor Cyan
Write-Host "    Kafka UI    -> http://localhost:8090" -ForegroundColor Cyan
Write-Host "    MinIO       -> http://localhost:9001  (ctm_admin / ctm_minio_pass)" -ForegroundColor Cyan
Write-Host "    AI Service  -> http://localhost:8001/docs  (FastAPI)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Demo login:  demo@ctm.app / demo123" -ForegroundColor Yellow
Write-Host "  Admin login: admin@ctm.dev / password123" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor White
Write-Host "    docker compose logs -f <service>   # stream logs" -ForegroundColor DarkGray
Write-Host "    .\stop_all.ps1                     # stop everything" -ForegroundColor DarkGray
Write-Host "    .\start_all.ps1 -Rebuild           # rebuild + restart" -ForegroundColor DarkGray
Write-Host ""
