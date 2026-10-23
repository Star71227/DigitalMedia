# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = "Stop"

$extractRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadPath = Join-Path $extractRoot "LearnMate-Payload.zip"
$runtimeRoot = Join-Path $env:LOCALAPPDATA "LearnMate-Rescue"
$appRoot = Join-Path $runtimeRoot "app"

if (-not (Test-Path -LiteralPath $payloadPath)) {
    Write-Host "LearnMate payload is missing." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$runtimeFull = [System.IO.Path]::GetFullPath($runtimeRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$appFull = [System.IO.Path]::GetFullPath($appRoot)
if (-not $appFull.StartsWith($runtimeFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to extract outside the LearnMate runtime directory."
}
if (Test-Path -LiteralPath $appRoot) {
    Remove-Item -LiteralPath $appRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
Expand-Archive -LiteralPath $payloadPath -DestinationPath $appRoot -Force

$startScript = Join-Path $appRoot "packaging\start-learnmate.ps1"
if (-not (Test-Path -LiteralPath $startScript)) {
    Write-Host "LearnMate startup script is missing from the payload." -ForegroundColor Red
    exit 1
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript
exit $LASTEXITCODE
