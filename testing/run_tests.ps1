#Requires -Version 5.1
<#
.SYNOPSIS
    Run CTM test suites for all 10 modules.

.DESCRIPTION
    Executes unit, integration, and E2E tests for every service.
    Requires the full stack to be running for integration and E2E tests.

.PARAMETER Module
    Run tests for a specific module only (e.g. -Module m3)
.PARAMETER Unit
    Run only unit tests (fast, no services required)
.PARAMETER Integration
    Run integration tests (requires running services)
.PARAMETER E2E
    Run Playwright E2E tests (requires full stack on localhost)
.PARAMETER Coverage
    Generate coverage reports

.EXAMPLE
    .\run_tests.ps1                   # all unit tests
    .\run_tests.ps1 -Module m4        # M4 formula engine only
    .\run_tests.ps1 -E2E              # E2E tests
    .\run_tests.ps1 -Integration      # integration tests
    .\run_tests.ps1 -Coverage         # with coverage report
#>

param(
    [string]$Module = "",
    [switch]$Unit,
    [switch]$Integration,
    [switch]$E2E,
    [switch]$Coverage,
    [switch]$All
)

$Root = $PSScriptRoot
$ErrorActionPreference = "Continue"
$TotalPassed = 0
$TotalFailed = 0
$Results = @()

function Write-Header { param($msg) Write-Host "`n  ══ $msg ══" -ForegroundColor Cyan }
function Write-Pass   { param($msg) Write-Host "  ✓  $msg" -ForegroundColor Green; $script:TotalPassed++ }
function Write-Fail   { param($msg) Write-Host "  ✗  $msg" -ForegroundColor Red;   $script:TotalFailed++ }
function Write-Skip   { param($msg) Write-Host "  -  $msg" -ForegroundColor DarkGray }

# Default: run unit tests
if (-not ($Unit -or $Integration -or $E2E -or $All)) { $Unit = $true }
if ($All) { $Unit = $true; $Integration = $true; $E2E = $true }

Set-Location $Root

Write-Host ""
Write-Host "  ╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║    CTM Platform — Test Runner          ║" -ForegroundColor Cyan
Write-Host "  ╚════════════════════════════════════════╝" -ForegroundColor Cyan

# ─── TypeScript / Vitest tests (M1, M2, M3, M4, M7, M8, M10) ─────────────────
if ($Unit -or $Integration) {
    Write-Header "TypeScript Tests (Vitest)"

    $vitestCmd = if ($Coverage) { "pnpm vitest run --coverage" } else { "pnpm vitest run" }

    $runVitest = $true
    if ($Module) {
        $vitestCmd += " $Module"
    }

    if ($runVitest) {
        Write-Host "  Running: $vitestCmd" -ForegroundColor DarkCyan
        Set-Location $Root
        $exitCode = (Start-Process -FilePath "pnpm" -ArgumentList "vitest","run","--reporter=verbose" -Wait -PassThru -NoNewWindow).ExitCode
        if ($exitCode -eq 0) { Write-Pass "Vitest (M1, M2, M3, M4, M7, M8, M10)" }
        else                  { Write-Fail "Vitest — $exitCode test failures" }
    }
}

# ─── Go tests (M5 — PM Service) ───────────────────────────────────────────────
if ($Unit -and (-not $Module -or $Module -eq "m5")) {
    Write-Header "M5 — PM Service (Go)"
    Set-Location "$Root\..\apps\pm-service"

    $goResult = Start-Process -FilePath "go" -ArgumentList "test","./...","../../../testing/m5-pm/...","- v" -Wait -PassThru -NoNewWindow
    if ($goResult.ExitCode -eq 0) { Write-Pass "M5 Go tests (CPM, Approval FSM, Triggers)" }
    else {
        # Try running tests directly from testing dir
        Set-Location "$Root\m5-pm"
        $goResult2 = Start-Process -FilePath "go" -ArgumentList "test","./...","./...","...","- v" -Wait -PassThru -NoNewWindow
        if ($goResult2.ExitCode -eq 0) { Write-Pass "M5 Go tests" }
        else { Write-Fail "M5 Go tests — check Go installation and dependencies" }
    }
    Set-Location $Root
}

# ─── Python tests (M6 — AI Service) ──────────────────────────────────────────
if ($Unit -and (-not $Module -or $Module -eq "m6")) {
    Write-Header "M6 — AI Agent Service (pytest)"
    Set-Location "$Root\m6-ai"

    $pyResult = Start-Process -FilePath "python" -ArgumentList "-m","pytest","unit/","-v","--tb=short" -Wait -PassThru -NoNewWindow
    if ($pyResult.ExitCode -eq 0) { Write-Pass "M6 Python unit tests (guards, llm_client)" }
    else {
        Write-Fail "M6 Python tests — ensure pytest is installed: pip install -r requirements-test.txt"
    }
    Set-Location $Root
}

# ─── Database tests (M9) ──────────────────────────────────────────────────────
if ($Integration -and (-not $Module -or $Module -eq "m9")) {
    Write-Header "M9 — Database RLS Tests (PostgreSQL)"

    # Check if PostgreSQL is running
    $pgRunning = docker ps --filter "name=ctm-postgres" --format "{{.Status}}" 2>$null
    if ($pgRunning -and $pgRunning -match "Up") {
        $sqlResult = docker exec ctm-postgres psql -U ctm -d ctm -f /dev/stdin 2>&1 `
            -InputObject (Get-Content "$Root\m9-database\rls_policies.test.sql" -Raw)
        if ($LASTEXITCODE -eq 0) { Write-Pass "M9 RLS policy tests" }
        else { Write-Fail "M9 RLS tests failed — check PostgreSQL logs" }
    } else {
        Write-Skip "M9 DB tests skipped — PostgreSQL not running (start with .\start_all.ps1)"
    }
}

# ─── E2E tests (Playwright) ───────────────────────────────────────────────────
if ($E2E) {
    Write-Header "E2E Tests (Playwright)"

    $frontendUp = try {
        (Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing).StatusCode -lt 400
    } catch { $false }

    if ($frontendUp) {
        Set-Location $Root
        $e2eResult = Start-Process -FilePath "pnpm" -ArgumentList "playwright","test" -Wait -PassThru -NoNewWindow
        if ($e2eResult.ExitCode -eq 0) { Write-Pass "Playwright E2E tests" }
        else { Write-Fail "Playwright E2E tests failed — see playwright-report/" }
    } else {
        Write-Skip "E2E tests skipped — frontend not running. Start with .\start_all.ps1"
    }
}

# ─── Summary ─────────────────────────────────────────────────────────────────
Set-Location $Root
Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Results: " -NoNewline
Write-Host "$TotalPassed passed" -ForegroundColor Green -NoNewline
Write-Host ", " -NoNewline
if ($TotalFailed -gt 0) {
    Write-Host "$TotalFailed failed" -ForegroundColor Red
} else {
    Write-Host "0 failed" -ForegroundColor Green
}
Write-Host ""

if ($TotalFailed -gt 0) { exit 1 } else { exit 0 }
