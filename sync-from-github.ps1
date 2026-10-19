# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
<#
  LearnMate auto-sync (Windows)
  ---------------------------------------------------------------------------
  Pull teammates' commits from GitHub and restart only the services that need it.

  What it does every run:
    1. git fetch origin main
    2. if the remote moved ahead -> git merge --ff-only (never overwrites local edits)
    3. decide what to restart:
         backend/**            -> restart backend (5800)
         */package.json        -> npm install, then restart that service
         frontend-*/**         -> Vite HMR only, just refresh the browser
         vite.config.ts/.env   -> restart that Vite dev server
    4. fallback: compare a fingerprint of the source tree. The project sits in a
       OneDrive folder, so files can land on disk without any git change
       (OneDrive syncing the teammate's folder directly). If the fingerprint
       changed, the backend is restarted so it loads the new code.
    5. everything is logged to C:\Users\admin\learnmate-runtime\logs\sync.log

  Manual use:
    powershell -ExecutionPolicy Bypass -File .\sync-from-github.ps1
    ... -Status      show local/remote state only
    ... -Force       hard reset to origin/main (discards local edits)
    ... -NoRestart   sync but never restart services
#>
param(
  [switch]$Status,
  [switch]$Force,
  [switch]$NoRestart
)

$ErrorActionPreference = 'Continue'
# The project path contains Chinese characters. powershell.exe -File reads scripts as
# ANSI when there is no BOM, which corrupts any non-ASCII literal, so derive the root
# from this script's own location instead of hardcoding it.
$Root        = if ($PSScriptRoot) { $PSScriptRoot } else { 'C:\Users\admin\OneDrive\Desktop\华五\-' }
if (-not (Test-Path (Join-Path $Root 'backend\src\index.js'))) {
  $Root = 'C:\Users\admin\OneDrive\Desktop\华五\-'
}
$RuntimeRoot = 'C:\Users\admin\learnmate-runtime'
$LogDir      = Join-Path $RuntimeRoot 'logs'
$LockFile    = Join-Path $RuntimeRoot 'sync.lock'
$StateFile   = Join-Path $RuntimeRoot 'source-state.txt'
$LogFile     = Join-Path $LogDir 'sync.log'
$StartScript = Join-Path $Root 'start-learnmate.ps1'
$Branch      = 'main'

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-Log([string]$Message) {
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[$stamp] $Message"
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

# Fingerprint of the source tree: catches files that appear on disk without a git change.
function Get-SourceState {
  $state = @()
  foreach ($dir in @('backend\src', 'backend\scripts', 'backend\data', 'frontend-new\src', 'frontend-teacher\src')) {
    $full = Join-Path $Root $dir
    if (-not (Test-Path $full)) { continue }
    foreach ($f in (Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue)) {
      $state += ('{0}|{1}|{2}' -f $f.FullName.Replace($Root, ''), $f.Length, $f.LastWriteTimeUtc.Ticks)
    }
  }
  foreach ($name in @('backend\package.json', 'frontend-new\package.json', 'frontend-teacher\package.json')) {
    $full = Join-Path $Root $name
    if (Test-Path $full) { $item = Get-Item $full; $state += ('{0}|{1}|{2}' -f $name, $item.Length, $item.LastWriteTimeUtc.Ticks) }
  }
  return (($state | Sort-Object) -join "`n")
}

# Kill every process listening on a port (including its child processes). Returns how many were killed.
function Stop-PortProcess([int]$Port) {
  $pids = @(netstat -ano | Select-String 'LISTENING' | Select-String ":$Port\s" | ForEach-Object {
    $parts = @(($_.ToString() -split '\s+') | Where-Object { $_ -ne '' }); $parts[$parts.Count - 1]
  } | Sort-Object -Unique)
  foreach ($p in $pids) { & taskkill.exe /PID $p /T /F 2>&1 | Out-Null }
  if ($pids.Count) { Start-Sleep -Seconds 1 }
  return $pids.Count
}

# Single instance guard: never run two git operations at once.
if (Test-Path $LockFile) {
  $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
  if ($lockAge.TotalMinutes -lt 10) { exit 0 }
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType File -Path $LockFile -Force | Out-Null

try {
  $env:GIT_TERMINAL_PROMPT = '0'
  $env:GCM_INTERACTIVE = 'never'
  $git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
  if (-not $git) { Write-Log 'ERROR git.exe not found'; exit 1 }

  $localHead  = (& $git -C $Root rev-parse HEAD 2>$null)
  $localShort = if ($localHead) { $localHead.Substring(0, 7) } else { 'unknown' }
  $dirty = @(& $git -C $Root status --porcelain 2>$null | Where-Object { $_ -and $_.Trim() -ne '' })

  if ($Status) {
    Write-Log "STATUS local=$localShort dirty=$($dirty.Count) branch=$(& $git -C $Root rev-parse --abbrev-ref HEAD)"
    & $git -C $Root log --oneline -3
    exit 0
  }

  $needBackend = $false
  $needStudent = $false
  $needTeacher = $false
  $needInstall = @()
  $gitPulled   = $false
  $fetchFailed = $false

  # ---- step 1: git sync (needs GitHub credentials for the private repo) ----
  & $git -C $Root fetch --quiet origin $Branch 2>&1 | ForEach-Object { Write-Log "fetch: $_" }
  if ($LASTEXITCODE -ne 0) {
    $fetchFailed = $true
    Write-Log 'WARN git fetch failed (credentials/network): skip git sync, keep checking local file changes'
  } else {
    $remoteHead = (& $git -C $Root rev-parse "origin/$Branch" 2>$null)
    $remoteShort = if ($remoteHead) { $remoteHead.Substring(0, 7) } else { 'unknown' }

    if ($localHead -ne $remoteHead) {
      Write-Log "new commits on remote: local=$localShort remote=$remoteShort"
      $changed = @(& $git -C $Root diff --name-only "$localShort" "origin/$Branch" 2>$null)

      if ($dirty.Count -gt 0) {
        Write-Log "WARN $($dirty.Count) uncommitted local change(s); using merge --ff-only to protect local files"
      }

      if ($Force) {
        & $git -C $Root reset --hard "origin/$Branch" 2>&1 | ForEach-Object { Write-Log "reset: $_" }
      } else {
        & $git -C $Root merge --ff-only "origin/$Branch" 2>&1 | ForEach-Object { Write-Log "merge: $_" }
      }

      $newHead = (& $git -C $Root rev-parse HEAD 2>$null)
      if ($newHead -ne $remoteHead) {
        Write-Log 'WARN could not fast-forward (local edits conflict or histories diverged); no restart this round. Use -Force to overwrite local edits.'
      } else {
        $gitPulled = $true
        Write-Log "fast-forwarded to $($newHead.Substring(0, 7))"

        foreach ($file in $changed) {
          $f = $file -replace '\\', '/'
          if ($f -like 'backend/package.json' -or $f -like 'backend/package-lock.json') { $needInstall += 'backend'; $needBackend = $true }
          elseif ($f -like 'frontend-new/package.json' -or $f -like 'frontend-new/package-lock.json') { $needInstall += 'frontend-new'; $needStudent = $true }
          elseif ($f -like 'frontend-teacher/package.json' -or $f -like 'frontend-teacher/package-lock.json') { $needInstall += 'frontend-teacher'; $needTeacher = $true }
          elseif ($f -like 'backend/*') { $needBackend = $true }
          elseif ($f -like 'frontend-new/vite.config.ts' -or $f -like 'frontend-new/.env*' -or $f -like 'frontend-new/index.html') { $needStudent = $true }
          elseif ($f -like 'frontend-teacher/vite.config.ts' -or $f -like 'frontend-teacher/.env*' -or $f -like 'frontend-teacher/index.html') { $needTeacher = $true }
          elseif ($f -like 'frontend-new/*') { }   # src changes: Vite HMR picks them up
          elseif ($f -like 'frontend-teacher/*') { }
          else { $needBackend = $true }            # root-level changes: restart backend conservatively
        }
      }
    }
  }

  # ---- step 2: local file fingerprint fallback (covers OneDrive-delivered changes) ----
  $currentState  = Get-SourceState
  $previousState = if (Test-Path $StateFile) { [System.IO.File]::ReadAllText($StateFile) } else { $null }
  if ($null -ne $previousState -and $previousState -ne $currentState) {
    Write-Log 'local source files changed (including OneDrive-delivered updates) -> restart backend so it loads the new code'
    $needBackend = $true
  }
  [System.IO.File]::WriteAllText($StateFile, $currentState, (New-Object System.Text.UTF8Encoding($false)))

  if ($NoRestart) {
    if ($gitPulled) { Write-Log 'synced (NoRestart: services untouched)' }
    elseif (-not $fetchFailed) { Write-Log 'already up to date (NoRestart)' }
    exit 0
  }

  if (-not $gitPulled -and -not $needBackend -and -not $needStudent -and -not $needTeacher) {
    if ($fetchFailed) { exit 1 }
    exit 0
  }

  foreach ($d in ($needInstall | Sort-Object -Unique)) {
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) { $npm = 'D:\Node js\npm.cmd' }
    Write-Log "npm install $d"
    Push-Location (Join-Path $Root $d)
    & $npm install --no-audit --no-fund --loglevel=error 2>&1 | ForEach-Object { Write-Log "npm: $_" }
    Pop-Location
  }

  if ($needBackend) { Write-Log 'restarting backend (5800)'; Stop-PortProcess 5800 | Out-Null }
  foreach ($item in @(@{ Need = $needStudent; Port = 5173 }, @{ Need = $needTeacher; Port = 5174 })) {
    if (-not $item.Need) { continue }
    Write-Log "restarting frontend on $($item.Port)"
    Stop-PortProcess $item.Port | Out-Null
  }

  if ($needBackend -or $needStudent -or $needTeacher) {
    $env:LEARNMATE_ROOT = $Root
    # Run the launcher as a separate process writing to log files, never by piping.
    # Piping lets the long-lived services inherit our stdout/stderr handles, which
    # keeps the pipe open and hangs whoever started this script.
    $startOut = Join-Path $LogDir 'sync-start.out.log'
    $startErr = Join-Path $LogDir 'sync-start.err.log'
    $proc = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', $StartScript) `
      -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $startOut -RedirectStandardError $startErr
    if ($proc.WaitForExit(240000)) {
      Write-Log "launcher exited with code $($proc.ExitCode)"
    } else {
      Write-Log 'WARN launcher still running after 4 minutes; continuing anyway'
    }
    Get-Content -LiteralPath $startOut -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Write-Log "start: $_" }
    Get-Content -LiteralPath $startErr -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Write-Log "start-err: $_" }
  }

  Write-Log "round finished gitSynced=$gitPulled backendRestart=$needBackend studentRestart=$needStudent teacherRestart=$needTeacher"
  if ($fetchFailed) { exit 1 }
  exit 0
} finally {
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
