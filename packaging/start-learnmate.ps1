# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
    Write-Host "[LearnMate] $Message" -ForegroundColor Cyan
}

function Write-Fail([string]$Message) {
    Write-Host "[LearnMate] $Message" -ForegroundColor Red
}

function New-Secret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($buffer) -replace "-", "")
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = $scriptDir
if (Test-Path -LiteralPath (Join-Path $scriptDir "..\docker-compose.yml")) {
    $root = (Resolve-Path (Join-Path $scriptDir ".." )).Path
}
Set-Location -LiteralPath $root
$runtimeRoot = Join-Path $env:LOCALAPPDATA "LearnMate-Rescue"
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker CLI was not found. Install Docker Desktop for Windows, then run this file again."
    }

    $dockerInfo = & docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Docker Desktop is not ready; attempting to start it..."
        $dockerDesktopCandidates = @(
            (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
            (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
        )
        $dockerDesktop = $dockerDesktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($dockerDesktop) {
            Start-Process -FilePath $dockerDesktop | Out-Null
        } else {
            throw "Docker Desktop is not running and its installation could not be found."
        }

        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 2
            & docker info *> $null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Write-Host "." -NoNewline
        }
        Write-Host ""
        if (-not $ready) { throw "Docker Desktop did not become ready within 120 seconds." }
    }

    $envPath = Join-Path $root ".env"
    $templatePath = Join-Path $root ".env.docker.example"
    $persistentEnvPath = Join-Path $runtimeRoot ".env"
    if (Test-Path -LiteralPath $persistentEnvPath) {
        Copy-Item -LiteralPath $persistentEnvPath -Destination $envPath -Force
    } elseif (-not (Test-Path -LiteralPath $envPath)) {
        if (-not (Test-Path -LiteralPath $templatePath)) {
            throw "The packaged .env.docker.example file is missing."
        }
        Write-Info "Creating local configuration and random secrets..."
        $envText = Get-Content -LiteralPath $templatePath -Raw
        $envText = $envText -replace "(?m)^MYSQL_ROOT_PASSWORD=.*$", "MYSQL_ROOT_PASSWORD=$(New-Secret 24)"
        $envText = $envText -replace "(?m)^DB_PASSWORD=.*$", "DB_PASSWORD=$(New-Secret 24)"
        $envText = $envText -replace "(?m)^JWT_SECRET=.*$", "JWT_SECRET=$(New-Secret 32)"
        $envText = $envText -replace "(?m)^KNOWLEDGE_IMPORT_ON_START=.*$", "KNOWLEDGE_IMPORT_ON_START=true"
        $envText = $envText -replace "(?m)^SEED_DEMO_DATA=.*$", "SEED_DEMO_DATA=true"
        $envText = $envText -replace "(?m)^DEMO_PASSWORD=.*$", "DEMO_PASSWORD=LearnMateLocal2026!"
        Write-Utf8NoBom $envPath $envText
    }
    Copy-Item -LiteralPath $envPath -Destination $persistentEnvPath -Force
    Copy-Item -LiteralPath (Join-Path $root "docker-compose.yml") -Destination (Join-Path $runtimeRoot "docker-compose.yml") -Force
    $packagedStop = Join-Path $root "packaging\stop-learnmate.ps1"
    if (Test-Path -LiteralPath $packagedStop) {
        Copy-Item -LiteralPath $packagedStop -Destination (Join-Path $runtimeRoot "stop-learnmate.ps1") -Force
    }

    Write-Info "Validating Docker Compose configuration..."
    & docker compose --project-name learnmate --project-directory $root config --quiet
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose configuration validation failed." }

    Write-Info "Building and starting LearnMate (the first run may take several minutes)..."
    & docker compose --project-name learnmate --project-directory $root up -d --build
    if ($LASTEXITCODE -ne 0) { throw "LearnMate failed to start. Run 'docker compose logs' in the extracted folder for details." }

    Write-Info "Waiting for the backend health check..."
    $healthy = $false
    for ($i = 0; $i -lt 120; $i++) {
        Start-Sleep -Seconds 2
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5800/api/health" -TimeoutSec 5
            if ($response.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
        Write-Host "." -NoNewline
    }
    Write-Host ""
    if (-not $healthy) { throw "The backend did not become healthy within 240 seconds." }

    Start-Process "http://localhost:8080" | Out-Null
    Write-Info "LearnMate is running. Student: http://localhost:8080  Teacher: http://localhost:8081"
    Write-Info "Demo password: LearnMateLocal2026! (student: zhangsan / lisi; teacher: teacher_demo)"
    Write-Info "To stop it later, run $runtimeRoot\stop-learnmate.ps1."
} catch {
    Write-Fail $_.Exception.Message
    Write-Host ""
    Write-Host "Press Enter to close..." -ForegroundColor Yellow
    [Console]::ReadLine() | Out-Null
    exit 1
}
