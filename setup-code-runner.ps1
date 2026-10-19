# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
param([string]$Distribution = 'Ubuntu-24.04')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$drive = $projectRoot.Substring(0, 1).ToLowerInvariant()
$linuxRoot = '/mnt/' + $drive + $projectRoot.Substring(2).Replace('\', '/')
Write-Host '[1/4] Preparing isolated CodeLab compiler in WSL...'
& wsl.exe -d $Distribution --user root --exec bash "$linuxRoot/backend/scripts/setup-code-runner-wsl.sh"
if ($LASTEXITCODE -ne 0) { throw 'WSL / Docker setup failed. No execution configuration was changed.' }
$env:CODE_EXECUTION_MODE = 'docker'
$env:CODE_RUNNER_TRANSPORT = 'wsl'
$env:CODE_RUNNER_WSL_DISTRO = $Distribution
Write-Host '[2/4] Testing compilation and execution...'
Push-Location (Join-Path $projectRoot 'backend')
try {
  & node scripts/verifyCodeRunnerDocker.js
  if ($LASTEXITCODE -ne 0) { throw 'Compiler self-test failed. No execution configuration was changed.' }
} finally { Pop-Location }
Write-Host '[3/4] Enabling verified runner...'
foreach ($relative in @('.env', 'backend/.env')) {
  $configPath = Join-Path $projectRoot $relative
  if (-not (Test-Path -LiteralPath $configPath)) { continue }
  $configText = [IO.File]::ReadAllText($configPath)
  foreach ($entry in @{ CODE_EXECUTION_MODE='docker'; CODE_RUNNER_TRANSPORT='wsl'; CODE_RUNNER_WSL_DISTRO=$Distribution }.GetEnumerator()) {
    $pattern = '(?m)^' + $entry.Key + '=[^\r\n]*'
    $line = $entry.Key + '=' + $entry.Value
    if ($configText -match $pattern) { $configText = [regex]::Replace($configText, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $line }) }
    else { $configText += "`r`n$line`r`n" }
  }
  [IO.File]::WriteAllText($configPath, $configText, (New-Object Text.UTF8Encoding($false)))
}
Write-Host '[4/4] Restarting LearnMate...'
& (Join-Path $projectRoot 'start-learnmate.ps1') -Restart -Open
