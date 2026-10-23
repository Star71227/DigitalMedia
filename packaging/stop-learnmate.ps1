# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = $scriptDir
if (Test-Path -LiteralPath (Join-Path $scriptDir "..\docker-compose.yml")) {
    $root = (Resolve-Path (Join-Path $scriptDir ".." )).Path
}
Set-Location -LiteralPath $root

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker CLI was not found."
    }
    & docker compose --project-name learnmate --project-directory $root down
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose could not stop LearnMate." }
    Write-Host "LearnMate has been stopped. Data volumes are preserved." -ForegroundColor Green
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
