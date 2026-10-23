# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmPath = if ($npm) { $npm.Source } else { $env:LEARNMATE_NPM }
if (-not $npmPath) {
  $candidates = @(
    (Join-Path $PSScriptRoot 'learnmate-local-runtime\node\npm.cmd'),
    'C:\Program Files\nodejs\npm.cmd',
    (Join-Path $env:USERPROFILE 'Documents\Codex\2026-09-14\ba\work\learnmate-local-runtime\node\npm.cmd')
  )
  $npmPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $npmPath) { throw 'npm.cmd not found. Install Node.js 24 or set LEARNMATE_NPM and reopen this script.' }
$env:Path = (Split-Path -Parent $npmPath) + ';' + $env:Path
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  $cachedNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
  if (Test-Path -LiteralPath (Join-Path $cachedNode 'node.exe')) { $env:Path = $cachedNode + ';' + $env:Path }
}
function Invoke-Npm([string[]]$Arguments) {
  & $npmPath @Arguments
  if ($LASTEXITCODE -ne 0) { throw ('npm failed: ' + ($Arguments -join ' ')) }
}
function Stop-ClientFileOwners([string]$ClientRoot) {
  $moduleRoot = [IO.Path]::GetFullPath((Join-Path $ClientRoot 'node_modules')).TrimEnd('\') + '\'
  foreach ($process in @(Get-Process node -ErrorAction SilentlyContinue)) {
    try {
      $owned = @($process.Modules | Where-Object {
        $_.FileName.StartsWith($moduleRoot, [StringComparison]::OrdinalIgnoreCase)
      })
      if ($owned.Count -gt 0) {
        Write-Host "Stopping this client's dependency file owner: PID $($process.Id)"
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
        Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
      }
    } catch { throw "Cannot release dependency files for $ClientRoot. Close its Vite terminal and retry. $($_.Exception.Message)" }
  }
}
$env:npm_config_cache = Join-Path $PSScriptRoot '.ai-cache\npm'
foreach ($client in @('frontend-new', 'frontend-teacher')) {
  $clientRoot = Join-Path $PSScriptRoot $client
  Write-Host "Checking $client dependencies..."
  & $npmPath --prefix $client ls --depth=0 --json *> $null
  $repairNeeded = $LASTEXITCODE -ne 0
  foreach ($entry in @('typescript\bin\tsc', 'vite\bin\vite.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $clientRoot "node_modules\$entry"))) { $repairNeeded = $true }
  }
  if ($repairNeeded) {
    Stop-ClientFileOwners $clientRoot
    Write-Host "Repairing $client dependencies without deleting the entire node_modules directory..."
    Invoke-Npm @('--prefix', $client, 'install', '--no-audit', '--no-fund')
  } else {
    Write-Host "$client dependencies are ready; skipping installation."
  }
}
Invoke-Npm @('run', 'typecheck')
Invoke-Npm @('test')
Invoke-Npm @('run', 'build')
Write-Host 'PASS: types, UI tests and both production builds completed.' -ForegroundColor Green
Write-Host 'Restart LearnMate to load backend changes. Start the local model API for AI generation.'
