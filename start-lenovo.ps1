# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
<#
  LearnMate local launcher (Windows, no Docker) - THIS MACHINE (Lenovo)
  ------------------------------------------------------------------
  Machine-local copy of start-learnmate.ps1 with this PC's paths:
    project : folder containing this script
    runtime : C:\Users\Lenovo\learnmate-runtime   (logs only)
    mysql   : C:\Users\Lenovo\mysql84             (MySQL 8.4 green install)
    order   : MySQL 8.4 (3306) -> backend Node (5800) -> student Vite (5173) -> teacher Vite (5174)

  ASCII-only on purpose: powershell.exe -File reads scripts as ANSI when no BOM is
  present, which corrupts non-ASCII string literals. All paths here are ASCII.

  Usage:
    .\start-lenovo.ps1                  start (services already up are skipped)
    .\start-lenovo.ps1 -Restart         stop old processes first, then start
    .\start-lenovo.ps1 -Restart -Open   restart and open the browser
    .\start-lenovo.ps1 -Stop            stop backend + frontends (MySQL keeps running)
    .\start-lenovo.ps1 -Stop -StopMysql stop MySQL too
    .\start-lenovo.ps1 -Install         reinstall deps in all three folders
    .\start-lenovo.ps1 -Watch           backend runs with node --watch
#>
param(
  [switch]$Restart,
  [switch]$Stop,
  [switch]$StopMysql,
  [switch]$Open,
  [switch]$Install,
  [switch]$Watch
)

$ErrorActionPreference = 'Continue'

$Root = $env:LEARNMATE_ROOT
if (-not $Root) { $Root = $PSScriptRoot }
if (-not $Root -or -not (Test-Path (Join-Path $Root 'backend\src\index.js'))) {
  $Root = 'C:\Users\Lenovo\Desktop\-'
}

$RuntimeRoot = 'C:\Users\Lenovo\learnmate-runtime'
$MysqlHome   = 'C:\Users\Lenovo\mysql84'
$MysqlData   = Join-Path $MysqlHome 'data'
$MysqlBin    = Join-Path $MysqlHome 'bin'
$MysqlCfg    = Join-Path $MysqlHome 'my.ini'
$LogDir      = Join-Path $RuntimeRoot 'logs'
$NodeExe     = (Get-Command node -ErrorAction SilentlyContinue).Source
$NpmCmd      = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) { $NodeExe = 'C:\Program Files\nodejs\node.exe' }
if (-not $NpmCmd)  { $NpmCmd  = 'C:\Program Files\nodejs\npm.cmd' }

$MysqlPort   = 3306
$BackendPort = 5800
$StudentPort = 5173
$TeacherPort = 5174

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Say  ($m) { Write-Host $m }
function Step ($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   ($m) { Write-Host "[ok] $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "[!!] $m" -ForegroundColor Yellow }

function Get-EnvValue([string]$Name, [string]$Default = '') {
  $line = Select-String -Path (Join-Path $Root 'backend\.env') -Pattern "^$([regex]::Escape($Name))=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $line) { return $Default }
  return ($line.Line -split '=', 2)[1].Trim()
}

function Test-Tcp([string]$HostName, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(700, $false)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch { return $false } finally { $client.Close() }
}

function Test-PortUp([int]$Port) { return (Test-Tcp '127.0.0.1' $Port) }

function Get-PortPids([int]$Port) {
  $found = @()
  $pattern = ':' + $Port + '\s'
  foreach ($line in (netstat -ano | Select-String 'LISTENING' | Select-String $pattern)) {
    $parts = @(($line.ToString() -split '\s+') | Where-Object { $_ -ne '' })
    $last = $parts[$parts.Count - 1]
    if ($last -match '^\d+$') { $found += [int]$last }
  }
  return @($found | Sort-Object -Unique)
}

function Stop-Port([int]$Port, [string]$Name) {
  $pids = Get-PortPids $Port
  if ($pids.Count -eq 0) { Ok "$Name not running ($Port)"; return }
  foreach ($procId in $pids) {
    Say "     killing $Name PID $procId"
    & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null
  }
  Start-Sleep -Milliseconds 500
  foreach ($remainingPid in (Get-PortPids $Port)) {
    Stop-Process -Id $remainingPid -Force -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 400
    if (-not (Test-PortUp $Port)) { break }
  }
  if (Test-PortUp $Port) { Warn "$Name port $Port still occupied" } else { Ok "$Name stopped ($Port)" }
}

function Wait-Http([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $request = [System.Net.WebRequest]::Create($Url)
      $request.Proxy = $null
      $request.Timeout = 2500
      $response = $request.GetResponse()
      $statusCode = [int]$response.StatusCode
      $response.Close()
      if ($statusCode -ge 200 -and $statusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Show-LogTail([string]$Path, [string]$Title) {
  if (Test-Path $Path) {
    Warn "$Title last lines:"
    Get-Content $Path -Tail 12 -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { Say "     $_" }
  }
}

function Stop-Mysql {
  $user = Get-EnvValue 'DB_USER' 'root'
  $pass = Get-EnvValue 'DB_PASSWORD' ''
  $admin = Join-Path $MysqlBin 'mysqladmin.exe'
  if ((Test-Path $admin) -and (Test-PortUp $MysqlPort)) {
    & $admin --host=127.0.0.1 --port=$MysqlPort --user=$user "--password=$pass" shutdown 2>&1 | Out-Null
    for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if (-not (Test-PortUp $MysqlPort)) { break } }
  }
  if (Test-PortUp $MysqlPort) { Stop-Port $MysqlPort 'mysql' } else { Ok 'MySQL stopped' }
}

function Stop-All {
  Step 'stopping backend + frontends'
  Stop-Port $StudentPort 'student-web'
  Stop-Port $TeacherPort 'teacher-web'
  Stop-Port $BackendPort 'backend'
  if ($StopMysql) { Stop-Mysql } else { Say '     MySQL stays up (3306); add -StopMysql to stop it too' }
}

# ---------------------------------------------------------------- main
Say ''
Say '=============================================='
Say '  LearnMate local start (MySQL + backend + web)'
Say "  project: $Root"
Say '=============================================='
Say ''

if (-not (Test-Path (Join-Path $Root 'backend\src\index.js'))) {
  Warn "not a project root (backend\src\index.js missing): $Root"
  exit 1
}
foreach ($required in @($NodeExe, $NpmCmd, (Join-Path $MysqlBin 'mysqld.exe'), $MysqlCfg)) {
  if (-not (Test-Path $required)) { Warn "runtime incomplete, missing: $required"; exit 1 }
}

if ($Stop -and -not $Restart) { Stop-All; Say ''; Ok 'stopped'; exit 0 }
if ($Restart) { Stop-All; Say '' }

# 1) MySQL
Step "1/4 MySQL ($MysqlPort)"
if (-not (Test-Path (Join-Path $MysqlData 'mysql'))) {
  Warn "MySQL data directory not initialized: $MysqlData"
  Warn "run once: powershell -ExecutionPolicy Bypass -File `"$RuntimeRoot\init-mysql.ps1`""
  exit 1
}
if (Test-PortUp $MysqlPort) {
  Ok 'MySQL already running'
} else {
  Say '     starting mysqld ...'
  Start-Process -FilePath (Join-Path $MysqlBin 'mysqld.exe') `
    -ArgumentList @("--defaults-file=$MysqlCfg") -WorkingDirectory $MysqlBin -WindowStyle Hidden
  $up = $false
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Seconds 2; if (Test-PortUp $MysqlPort) { $up = $true; break } }
  if ($up) { Ok 'MySQL ready' } else { Warn "MySQL failed to start, see $MysqlData\*.err"; exit 1 }
}

# 2) dependencies
Step '2/4 dependency check'
$dirs = @('backend', 'frontend-new', 'frontend-teacher')
$needInstall = $false
foreach ($d in $dirs) {
  $modDir = Join-Path $Root "$d\node_modules"
  if (-not (Test-Path $modDir)) { Warn "$d\node_modules missing"; $needInstall = $true }
  elseif ((Get-Item (Join-Path $Root "$d\package.json")).LastWriteTime -gt (Get-Item $modDir).LastWriteTime) {
    Warn "$d\package.json newer than node_modules (use -Install to reinstall)"
  }
}
if ($Install) { $needInstall = $true }
if ($needInstall) {
  foreach ($d in $dirs) {
    Say "     npm install in $d (may take a few minutes) ..."
    Push-Location (Join-Path $Root $d)
    & $NpmCmd install --no-audit --no-fund 2>&1 | ForEach-Object { Say "       $_" }
    Pop-Location
  }
  Ok 'dependencies installed'
} else { Ok 'dependencies present, skipping install' }

# 3) backend
Step "3/4 backend ($BackendPort)"
if (Test-PortUp $BackendPort) {
  Ok 'backend already running'
} else {
  $devOrigins = @('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174')
  $originList = @((Get-EnvValue 'CORS_ALLOWED_ORIGINS' '') -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
  foreach ($o in $devOrigins) { if ($originList -notcontains $o) { $originList += $o } }
  $env:CORS_ALLOWED_ORIGINS = ($originList -join ',')
  Say "     CORS allowlist: $env:CORS_ALLOWED_ORIGINS"
  $backendArgs = @('backend/src/index.js')
  if ($Watch) { $backendArgs = @('--watch', 'backend/src/index.js'); Say '     watch mode: backend restarts on code change' }
  Say '     starting node ...'
  Start-Process -FilePath $NodeExe -ArgumentList $backendArgs -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'backend.out.log') `
    -RedirectStandardError  (Join-Path $LogDir 'backend.err.log')
  if (Wait-Http "http://127.0.0.1:$BackendPort/api/health" 90) {
    Ok 'backend ready (/api/health ok)'
  } else {
    Warn 'backend start timed out'
    Show-LogTail (Join-Path $LogDir 'backend.err.log') 'backend stderr'
    Show-LogTail (Join-Path $LogDir 'backend.out.log') 'backend stdout'
  }
}

# 4) frontends
Step "4/4 frontends ($StudentPort / $TeacherPort)"
$frontends = @(
  @{ Name = 'student-web'; Dir = 'frontend-new';     Port = $StudentPort; Out = 'frontend-new.out.log';     Err = 'frontend-new.err.log' },
  @{ Name = 'teacher-web'; Dir = 'frontend-teacher'; Port = $TeacherPort; Out = 'frontend-teacher.out.log'; Err = 'frontend-teacher.err.log' }
)
foreach ($f in $frontends) {
  if (Test-PortUp $f.Port) { Ok "$($f.Name) already running ($($f.Port))"; continue }
  Say "     starting $($f.Name) vite ..."
  Start-Process -FilePath $NpmCmd -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--strictPort') `
    -WorkingDirectory (Join-Path $Root $f.Dir) -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir $f.Out) `
    -RedirectStandardError  (Join-Path $LogDir $f.Err)
}
foreach ($f in $frontends) {
  if (Wait-Http "http://127.0.0.1:$($f.Port)/" 60) { Ok "$($f.Name) ready ($($f.Port))" }
  else { Warn "$($f.Name) vite not ready"; Show-LogTail (Join-Path $LogDir $f.Err) "$($f.Name) stderr"; Show-LogTail (Join-Path $LogDir $f.Out) "$($f.Name) stdout" }
}

# summary
$backendOk = Wait-Http "http://127.0.0.1:$BackendPort/api/health" 5
$studentOk = Wait-Http "http://127.0.0.1:$StudentPort/" 3
$teacherOk = Wait-Http "http://127.0.0.1:$TeacherPort/" 3
$allOk = $backendOk -and $studentOk -and $teacherOk

Say ''
Say '----------------------------------------------'
if ($allOk) { Ok 'all services ready' } else { Warn 'at least one service failed its check, see logs above' }
Say ''
Say '  student  http://127.0.0.1:5173'
Say '  teacher  http://127.0.0.1:5174'
Say '  backend  http://127.0.0.1:5800/api/health'
Say '  tutor    http://127.0.0.1:5173/digital-tutor.html'
Say ''
Say '  demo accounts: zhangsan / lisi / teacher_demo'
Say '  password: see DEMO_PASSWORD in backend\.env'
Say ''
Say "  logs : $LogDir\*.log"
Say '  stop : .\start-lenovo.ps1 -Stop'
Say '----------------------------------------------'
Say ''

if ($Open) {
  foreach ($u in @("http://127.0.0.1:$StudentPort/", "http://127.0.0.1:$TeacherPort/", "http://127.0.0.1:$BackendPort/api/health")) {
    Start-Process $u
    Say "[opened] $u"
  }
}

if (-not $allOk) { exit 1 }
exit 0
