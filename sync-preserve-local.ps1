# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$bundle = Join-Path $PSScriptRoot 'backups\git-sync-20260919'
$plan = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw | ConvertFrom-Json
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
  $candidates = @('C:\Program Files\Git\cmd', 'C:\Program Files (x86)\Git\cmd')
  $desktop = Join-Path $env:LOCALAPPDATA 'GitHubDesktop'
  $candidates += @(Get-ChildItem -LiteralPath $desktop -Directory -Filter 'app-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'resources\app\git\cmd' })
  $gitDir = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'git.exe') } | Select-Object -First 1
  if (-not $gitDir) { throw 'Git not found. Open GitHub Desktop first.' }
  $env:Path = $gitDir + ';' + $env:Path
}
function Run-Git([string[]]$Arguments) {
  & git @Arguments
  if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($Arguments -join ' ')) }
}
if ((git branch --show-current) -ne 'main') { throw 'Expected main branch. No files changed.' }
if ((git rev-parse HEAD) -ne $plan.head) { throw 'Local history changed. No files changed; prepare a new merge.' }
if (@(git diff --name-only --diff-filter=U).Count) { throw 'An unresolved merge already exists.' }
foreach ($file in $plan.files) {
  if ((Get-FileHash -LiteralPath $file.path).Hash -ne $file.originalSha) { throw "Local file changed: $($file.path). No files changed; prepare a new merge." }
  if ((Get-FileHash -LiteralPath (Join-Path $bundle $file.merged)).Hash -ne $file.mergedSha) { throw 'Prepared merge checksum mismatch.' }
}
Run-Git @('fetch', 'origin')
if ((git rev-parse origin/main) -ne $plan.remote) { throw 'Remote updated again. No local files changed; prepare a new merge.' }
$oldStash = git rev-parse --verify refs/stash 2>$null
Run-Git @('stash', 'push', '--include-untracked', '-m', 'LearnMate preserved local edits before prepared sync 20260919')
$saved = git rev-parse refs/stash
if ($saved -eq $oldStash) { throw 'No new backup created; stopping.' }
Set-Content -LiteralPath (Join-Path $bundle 'saved-stash.txt') -Value $saved -Encoding ascii
Run-Git @('merge', '--ff-only', $plan.remote)
git stash apply $saved
$applyCode = $LASTEXITCODE
$conflicts = @(git -c core.quotepath=false diff --name-only --diff-filter=U)
$unexpected = @($conflicts | Where-Object { $_ -notin @($plan.files.path) })
if ($unexpected.Count -or ($applyCode -ne 0 -and -not $conflicts.Count)) {
  throw "Unexpected restore conflict. Backup retained at stash $saved; do not discard it."
}
foreach ($file in $plan.files) {
  Copy-Item -LiteralPath (Join-Path $bundle $file.merged) -Destination $file.path -Force
  if ($file.path -in $conflicts) {
    Run-Git @('add', '--', $file.path)
    Run-Git @('restore', '--staged', '--', $file.path)
  }
}
if (@(git diff --name-only --diff-filter=U).Count) { throw 'Unresolved files remain. Backup retained.' }
Write-Host 'SUCCESS: remote updates merged; local AI changes preserved.' -ForegroundColor Green
Write-Host "Recovery stash retained: $saved"
Write-Host 'GitHub Desktop: review Changes, then commit the work before the next pull.'
