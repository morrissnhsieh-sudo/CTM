#Requires -Version 5.1
<#
.SYNOPSIS
    Stop the CTM Platform and optionally clean up volumes / images.

.DESCRIPTION
    Gracefully stops all CTM Docker Compose services in reverse dependency
    order.  Provides optional flags for progressively deeper cleanup:
      -Volumes   → also delete all persistent data volumes (DB, Kafka, etc.)
      -Images    → also remove all CTM Docker images (forces full rebuild next start)
      -Full      → equivalent to -Volumes -Images (full wipe)
      -Prune     → run docker system prune after stopping (reclaims disk space)

.EXAMPLE
    .\stop_all.ps1                  # stop containers, keep data
    .\stop_all.ps1 -Volumes        # stop + delete all data volumes
    .\stop_all.ps1 -Full           # stop + delete volumes + images
    .\stop_all.ps1 -Full -Prune    # full wipe + system prune
#>

param(
    [switch]$Volumes,   # remove named volumes (PostgreSQL, Redis, Kafka, MinIO, Keycloak data)
    [switch]$Images,    # remove built CTM images
    [switch]$Full,      # shortcut for -Volumes -Images
    [switch]$Prune,     # docker system prune after stopping
    [switch]$Force      # skip confirmation prompts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"   # continue even if a container is already gone

# ─── Resolve -Full shortcut ───────────────────────────────────────────────────
if ($Full) { $Volumes = $true; $Images = $true }

# ─── Colours ─────────────────────────────────────────────────────────────────
function Write-Header  { param($msg) Write-Host "`n  $msg" -ForegroundColor Cyan }
function Write-Ok      { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail    { param($msg) Write-Host "  [X]   $msg" -ForegroundColor Red }
function Write-Step    { param($msg) Write-Host "  -->   $msg" -ForegroundColor DarkCyan }
function Write-Divider { Write-Host ("  " + ("─" * 60)) -ForegroundColor DarkGray }

$Root = $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "  ║          CTM Platform  ·  Stop All Services             ║" -ForegroundColor Yellow
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# ─── Destructive-action confirmation ─────────────────────────────────────────
if (($Volumes -or $Images) -and -not $Force) {
    Write-Host "  WARNING: The following destructive actions will be performed:" -ForegroundColor Red
    if ($Volumes) { Write-Host "    - Delete all persistent data volumes (database, Kafka, MinIO)" -ForegroundColor Red }
    if ($Images)  { Write-Host "    - Remove all built CTM Docker images" -ForegroundColor Red }
    Write-Host ""
    $answer = Read-Host "  Type YES to confirm"
    if ($answer -ne "YES") {
        Write-Warn "Aborted — no changes made."
        exit 0
    }
    Write-Host ""
}

# ─── Docker check ─────────────────────────────────────────────────────────────
try {
    docker version --format "{{.Server.Version}}" 2>$null | Out-Null
} catch {
    Write-Fail "Docker is not running. Nothing to stop."
    exit 0
}

# ─── Step 1: Stop frontend first (fastest user-facing signal) ─────────────────
Write-Header "Step 1 — Stopping Frontend (M1)"
Write-Step "Stopping ctm-frontend…"
docker compose stop frontend --timeout 15 2>$null
docker compose rm -f frontend 2>$null
Write-Ok "Frontend stopped"

Write-Divider

# ─── Step 2: Stop application microservices ───────────────────────────────────
Write-Header "Step 2 — Stopping application microservices"

$appServices = @(
    @{ container = "ctm-messaging";   name = "messaging-service"; label = "M7 Messaging Service" }
    @{ container = "ctm-ai";          name = "ai-service";        label = "M6 AI Agent Service" }
    @{ container = "ctm-pm";          name = "pm-service";        label = "M5 PM Service" }
    @{ container = "ctm-api";         name = "api-service";       label = "M3+M4 API Gateway" }
    @{ container = "ctm-collab";      name = "collab-service";    label = "M2 Collaboration Engine" }
)

foreach ($svc in $appServices) {
    Write-Step "Stopping $($svc.label)…"
    docker compose stop $svc.name --timeout 20 2>$null
    docker compose rm -f $svc.name 2>$null
    Write-Ok "$($svc.label) stopped"
}

Write-Divider

# ─── Step 3: Stop Keycloak ────────────────────────────────────────────────────
Write-Header "Step 3 — Stopping Keycloak (M10)"
Write-Step "Stopping ctm-keycloak…"
docker compose stop keycloak --timeout 30 2>$null
docker compose rm -f keycloak 2>$null
Write-Ok "Keycloak stopped"

Write-Divider

# ─── Step 4: Stop infrastructure ─────────────────────────────────────────────
Write-Header "Step 4 — Stopping infrastructure services"

$infraServices = @(
    @{ name = "kafka-ui";  label = "Kafka UI" }
    @{ name = "minio-init"; label = "MinIO Init" }
    @{ name = "kafka";     label = "M8 Kafka (KRaft)" }
    @{ name = "minio";     label = "M9 MinIO" }
    @{ name = "redis";     label = "M9 Redis" }
    @{ name = "postgres";  label = "M9 PostgreSQL" }
)

foreach ($svc in $infraServices) {
    Write-Step "Stopping $($svc.label)…"
    docker compose stop $svc.name --timeout 15 2>$null
    docker compose rm -f $svc.name 2>$null
    Write-Ok "$($svc.label) stopped"
}

Write-Divider

# ─── Step 5: Verify all CTM containers are gone ───────────────────────────────
Write-Header "Step 5 — Verifying all containers stopped"

$ctmContainers = docker ps -a --filter "name=ctm-" --format "{{.Names}}" 2>$null
if ($ctmContainers) {
    Write-Warn "These containers are still present — force-removing:"
    foreach ($c in $ctmContainers -split "`n" | Where-Object { $_ }) {
        Write-Host "    $c" -ForegroundColor DarkYellow
        docker rm -f $c 2>$null
    }
} else {
    Write-Ok "All CTM containers removed"
}

Write-Divider

# ─── Step 6 (optional): Remove volumes ───────────────────────────────────────
if ($Volumes) {
    Write-Header "Step 6 — Removing persistent data volumes"

    $namedVolumes = @(
        "ctm_postgres-data"
        "ctm_redis-data"
        "ctm_kafka-data"
        "ctm_minio-data"
        "ctm_keycloak-data"
    )

    foreach ($vol in $namedVolumes) {
        Write-Step "Removing volume: $vol"
        docker volume rm $vol 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Ok "Removed $vol" }
        else { Write-Warn "$vol not found (already removed or never created)" }
    }

    Write-Warn "All persistent data has been deleted."
    Write-Warn "Next start will initialise fresh databases and Kafka topics."
    Write-Divider
}

# ─── Step 7 (optional): Remove images ────────────────────────────────────────
if ($Images) {
    Write-Header "Step 7 — Removing CTM Docker images"

    $imagePatterns = @("ctm-frontend", "ctm-api", "ctm-collab", "ctm-pm", "ctm-ai", "ctm-messaging")

    foreach ($pattern in $imagePatterns) {
        $images = docker images --filter "reference=*$pattern*" --format "{{.Repository}}:{{.Tag}}" 2>$null
        if ($images) {
            foreach ($img in $images -split "`n" | Where-Object { $_ }) {
                Write-Step "Removing image: $img"
                docker rmi $img --force 2>$null
                Write-Ok "Removed $img"
            }
        }
    }

    # Also remove images built by compose (project-prefixed)
    $composeImages = docker images --filter "label=com.docker.compose.project=ctm" --format "{{.ID}}" 2>$null
    if ($composeImages) {
        foreach ($imgId in $composeImages -split "`n" | Where-Object { $_ }) {
            docker rmi $imgId --force 2>$null
        }
        Write-Ok "Compose-built images removed"
    }

    Write-Divider
}

# ─── Step 8 (optional): Docker system prune ──────────────────────────────────
if ($Prune) {
    Write-Header "Step 8 — Docker system prune"
    Write-Step "Removing unused containers, networks, and dangling images…"
    docker system prune -f 2>$null
    Write-Ok "System prune complete"
    Write-Divider
}

# ─── Done ─────────────────────────────────────────────────────────────────────

# Final status check — confirm nothing CTM is still running
$stillRunning = docker ps --filter "name=ctm-" --format "{{.Names}}" 2>$null
Write-Host ""

if (-not $stillRunning) {
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "  ║           All CTM services stopped cleanly.             ║" -ForegroundColor Green
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
} else {
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "  ║   Stopped. Some containers may still be shutting down.  ║" -ForegroundColor Yellow
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Still running:" -ForegroundColor Yellow
    foreach ($c in $stillRunning -split "`n" | Where-Object { $_ }) {
        Write-Host "    $c" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "  To restart:     .\start_all.ps1" -ForegroundColor DarkGray
Write-Host "  To full reset:  .\stop_all.ps1 -Full -Force  then  .\start_all.ps1 -Rebuild" -ForegroundColor DarkGray
Write-Host ""
