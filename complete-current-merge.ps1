# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
  $locations = @('C:\Program Files\Git\cmd')
  $locations += @(Get-ChildItem (Join-Path $env:LOCALAPPDATA 'GitHubDesktop') -Directory -Filter 'app-*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'resources\app\git\cmd' })
  $found = $locations | Where-Object { Test-Path (Join-Path $_ 'git.exe') } | Select-Object -First 1
  if (-not $found) { throw 'Git not found.' }
  $env:Path = $found + ';' + $env:Path
}
if ((git rev-parse HEAD) -ne '6ed45c4435efe64dd88f253834b0b5de7dd576f0') { throw 'Repository changed or merge already completed. Check GitHub Desktop.' }
if ((git rev-parse MERGE_HEAD) -ne 'f71f0c48e6d52036cc2586061aa0878390b3b9ec') { throw 'Not the prepared merge. No files changed.' }
$files = @('frontend-new/src/components/layout/AppShell.tsx','frontend-teacher/src/components/Layout.tsx','frontend-teacher/src/components/Sidebar.tsx')
foreach ($file in $files) {
  if (Select-String -LiteralPath $file -Pattern '^(<<<<<<<|=======|>>>>>>>)' -Quiet) { throw "Conflict markers remain in $file" }
}
git add -- @files
if ($LASTEXITCODE -ne 0) { throw 'Could not mark conflicts resolved.' }
if (@(git diff --name-only --diff-filter=U).Count) { throw 'Other unresolved conflicts remain.' }
git commit --no-edit
if ($LASTEXITCODE -ne 0) { throw 'Merge commit failed. Changes remain saved; inspect GitHub Desktop.' }
Write-Host 'SUCCESS: merge completed. Local changes and team navigation preserved.' -ForegroundColor Green
Write-Host 'Nothing was pushed. Review the merge in GitHub Desktop before pushing.'
