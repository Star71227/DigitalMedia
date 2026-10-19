# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
<#
  LearnMate（智课研伴）本地一键启动 / 重启脚本 —— 不需要 Docker
  ------------------------------------------------------------------
  启动顺序：MySQL 8.4 (3306) → 后端 Node (5800) → 学生端 Vite (5173) → 教师端 Vite (5174)

  用法（在项目根目录执行）：
    .\start-learnmate-local.ps1                  启动（已在运行的服务自动跳过）
    .\start-learnmate-local.ps1 -Restart         先停掉旧的前后端再启动（最常用）
    .\start-learnmate-local.ps1 -Restart -Open   重启并自动打开浏览器页面
    .\start-learnmate-local.ps1 -Stop            只停止前后端（MySQL 保持运行）
    .\start-learnmate-local.ps1 -Stop -StopMysql 连 MySQL 一起停
    .\start-learnmate-local.ps1 -Install         重新安装三个目录的依赖（组员改了 package.json 后）
    .\start-learnmate-local.ps1 -Restart -Watch  后端用 node --watch，改后端代码自动重启

  提示：本机 PowerShell 执行策略为 Restricted，直接运行 .ps1 可能被拒绝，
        双击同目录的 重启LearnMate.bat / 停止LearnMate.bat 即可（已带 Bypass）。
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

# Some launchers inject both `Path` and `PATH`. Start-Process builds a
# case-insensitive environment dictionary on Windows and crashes when both are
# present. Preserve every path segment, then expose one canonical variable.
function Normalize-ProcessPathVariable {
  $entries = @([Environment]::GetEnvironmentVariables('Process').GetEnumerator() |
    Where-Object { $_.Key -ieq 'Path' })
  if ($entries.Count -le 1) { return }
  $segments = @()
  foreach ($entry in $entries) { $segments += ([string]$entry.Value -split ';') }
  foreach ($name in @($entries.Key)) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
  }
  $env:Path = (($segments | Where-Object { $_ } | Select-Object -Unique) -join ';')
}
Normalize-ProcessPathVariable

# 项目根目录 = 脚本所在目录。不要写死盘符：换机器、换路径都必须能跑。
$Root = $PSScriptRoot
if ([string]::IsNullOrEmpty($Root)) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Definition }

# ---- 运行时自动探测：Node / npm / MySQL（同时支持“自带 runtime”与“本机已装”两种布局）----
function Find-FirstPath([string[]]$Candidates) {
  foreach ($item in $Candidates) {
    if (-not [string]::IsNullOrEmpty($item) -and (Test-Path $item)) { return $item }
  }
  return ''
}

# 想指定非标准位置时，可在运行前设置：$env:LEARNMATE_NODE / $env:LEARNMATE_NPM /
# $env:LEARNMATE_MYSQL_HOME / $env:LEARNMATE_MYSQL_CFG，无需改脚本。
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$npmCommand  = Get-Command npm.cmd  -ErrorAction SilentlyContinue
$NodeExe = ''
if ($nodeCommand) { $NodeExe = $nodeCommand.Source }
if (-not $NodeExe) {
  $NodeExe = Find-FirstPath @(
    $env:LEARNMATE_NODE,
    (Join-Path $Root 'learnmate-local-runtime\node\node.exe'),
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe',
    'C:\Users\LENOVO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  )
}
$NpmCmd = ''
if ($npmCommand) { $NpmCmd = $npmCommand.Source }
if (-not $NpmCmd) {
  $NpmCmd = Find-FirstPath @(
    $env:LEARNMATE_NPM,
    (Join-Path $Root 'learnmate-local-runtime\node\npm.cmd'),
    'C:\Program Files\nodejs\npm.cmd',
    'C:\Program Files (x86)\nodejs\npm.cmd',
    'C:\Users\LENOVO\Documents\Codex\2026-09-14\ba\work\learnmate-local-runtime\node\npm.cmd'
  )
}

# MySQL：先看项目内/历史遗留的自带 runtime，再看本机用户目录下的 MySQL 安装
$MysqlCfg = Find-FirstPath @(
  $env:LEARNMATE_MYSQL_CFG,
  (Join-Path $Root 'learnmate-local-runtime\mysql\my.ini'),
  'C:\Users\LENOVO\Documents\Codex\2026-09-14\ba\work\learnmate-local-runtime\mysql\my.ini'
)
$MysqlHome = Find-FirstPath @(
  $env:LEARNMATE_MYSQL_HOME,
  'C:\Users\LENOVO\Documents\Codex\2026-09-14\ba\work\mysql-runtime\mysql-8.4.11-winx64'
)
if (-not $MysqlHome) {
  $mysqlRoot = Join-Path $env:USERPROFILE 'mysql'
  $candidates = @(Get-ChildItem $mysqlRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'mysql-*' } | Sort-Object Name -Descending)
  if ($candidates.Count -gt 0) { $MysqlHome = $candidates[0].FullName }
}
if (-not $MysqlCfg) {
  $userCfg = Join-Path $env:USERPROFILE 'mysql\my.ini'
  if (Test-Path $userCfg) { $MysqlCfg = $userCfg }
}
$MysqlBin = ''
if ($MysqlHome) { $MysqlBin = Join-Path $MysqlHome 'bin' }
$UseBundledMysql = [bool]($MysqlCfg -and $MysqlCfg.ToLower().Contains('learnmate-local-runtime'))
$MysqlData = ''
if ($UseBundledMysql) { $MysqlData = Join-Path (Split-Path $MysqlCfg -Parent) 'data' }
$RuntimeRoot = $Root
if ($UseBundledMysql) { $RuntimeRoot = Split-Path (Split-Path $MysqlCfg -Parent) -Parent }

if ($NodeExe) { $env:Path = "$(Split-Path $NodeExe -Parent);$env:Path" }
if ($MysqlBin) { $env:Path = "$MysqlBin;$env:Path" }

$MysqlPort   = 3306
$BackendPort = 5800
$StudentPort = 5173
$TeacherPort = 5174

function Say  ($m) { Write-Host $m }
function Step ($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   ($m) { Write-Host "[ok] $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "[!!] $m" -ForegroundColor Yellow }

function Test-Tcp([string]$HostName, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(700, $false)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# 端口上是否有服务在监听。所有本地服务固定绑定 IPv4 回环地址，
# 避免 Windows 把 localhost 解析到 ::1 后出现端口在运行但网页打不开。
function Test-PortUp([int]$Port) {
  return (Test-Tcp '127.0.0.1' $Port)
}

# 列出监听指定端口的进程 PID
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
  if ($pids.Count -eq 0) { Ok "$Name 未运行 ($Port)"; return }
  foreach ($procId in $pids) {
    Say "     结束 $Name PID $procId"
    & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null
  }
  Start-Sleep -Milliseconds 500
  # taskkill 可能没有结束只监听 IPv6 的旧 Vite 进程；无论 IPv4 检查结果如何，
  # 都重新读取端口并用 PowerShell 结束残留进程。
  foreach ($remainingPid in (Get-PortPids $Port)) {
    Stop-Process -Id $remainingPid -Force -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 400
    if (-not (Test-PortUp $Port)) { break }
  }
  if (Test-PortUp $Port) { Warn "$Name 端口 $Port 仍被占用" } else { Ok "$Name 已停止 ($Port)" }
}

function Wait-Http([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $request = [System.Net.HttpWebRequest]::Create($Url)
      $request.Proxy = $null
      $request.Timeout = 2000
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
    Warn "$Title 最后几行日志："
    Get-Content $Path -Tail 12 -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { Say "     $_" }
  }
}

function Repair-EnvFile {
  $envPath = Join-Path $Root '.env'
  if (-not (Test-Path $envPath)) {
    $template = Join-Path $Root '.env.docker.example'
    if (-not (Test-Path $template)) { Warn '.env 不存在且没有 .env.docker.example 模板，请按 本地启动说明.md 配置'; exit 1 }
    Copy-Item $template $envPath -Force
    Warn '.env 不存在，已从 .env.docker.example 复制一份'
  }

  $text = [System.IO.File]::ReadAllText($envPath, [System.Text.UTF8Encoding]::new($false))
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $changed = @()

  # CORS 白名单：补齐本地开发端口，否则浏览器登录/提交会 403
  $devOrigins = @('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174')
  $corsMatch = [regex]::Match($text, '(?m)^CORS_ALLOWED_ORIGINS=(.*)$')
  if ($corsMatch.Success) {
    $list = @($corsMatch.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    $missing = @($devOrigins | Where-Object { $list -notcontains $_ })
    if ($missing.Count -gt 0) {
      foreach ($origin in $missing) { $list += $origin }
      $text = $text.Remove($corsMatch.Index, $corsMatch.Length).Insert($corsMatch.Index, 'CORS_ALLOWED_ORIGINS=' + ($list -join ','))
      $changed += "CORS_ALLOWED_ORIGINS 补入 $($missing.Count) 个本地端口"
    }
  } else {
    $text = $text.TrimEnd() + $nl + 'CORS_ALLOWED_ORIGINS=' + ($devOrigins -join ',') + $nl
    $changed += 'CORS_ALLOWED_ORIGINS 已写入本地端口'
  }

  # JWT_SECRET：缺失/过短/占位则生成（生产模式要求至少 32 位）
  $jwtMatch = [regex]::Match($text, '(?m)^JWT_SECRET=(.*)$')
  $jwtValue = ''
  if ($jwtMatch.Success) { $jwtValue = $jwtMatch.Groups[1].Value.Trim() }
  if ($jwtValue.Length -lt 32 -or $jwtValue -match '(?i)^(请|change[-_ ]?me|replace[-_ ]?me|example|your[-_ ])') {
    $alphabet = @()
    $alphabet += (48..57 | ForEach-Object { [char]$_ })
    $alphabet += (65..90 | ForEach-Object { [char]$_ })
    $alphabet += (97..122 | ForEach-Object { [char]$_ })
    $generated = -join (1..64 | ForEach-Object { $alphabet | Get-Random })
    if ($jwtMatch.Success) { $text = $text.Remove($jwtMatch.Index, $jwtMatch.Length).Insert($jwtMatch.Index, 'JWT_SECRET=' + $generated) }
    else { $text = $text.TrimEnd() + $nl + 'JWT_SECRET=' + $generated + $nl }
    $changed += 'JWT_SECRET 已生成 64 位随机值'
  }

  # DEMO_PASSWORD：缺失/过短则生成（内置账号密码，不打印完整值）
  $demoMatch = [regex]::Match($text, '(?m)^DEMO_PASSWORD=(.*)$')
  $demoValue = ''
  if ($demoMatch.Success) { $demoValue = $demoMatch.Groups[1].Value.Trim() }
  if ($demoValue.Length -lt 12) {
    $generated = 'LearnMate' + (Get-Random -Minimum 100000 -Maximum 999999) + 'Local!'
    if ($demoMatch.Success) { $text = $text.Remove($demoMatch.Index, $demoMatch.Length).Insert($demoMatch.Index, 'DEMO_PASSWORD=' + $generated) }
    else { $text = $text.TrimEnd() + $nl + 'DEMO_PASSWORD=' + $generated + $nl }
    $changed += 'DEMO_PASSWORD 已生成（内置账号密码，见 .env）'
  }

  # 教师端注册开关
  if ($text -notmatch '(?m)^TEACHER_REGISTRATION_MODE=') {
    $text = $text.TrimEnd() + $nl + '# 教师端注册：open=开放自助注册 / closed=关闭' + $nl + 'TEACHER_REGISTRATION_MODE=open' + $nl
    $changed += 'TEACHER_REGISTRATION_MODE=open 已写入'
  }

  if ($changed.Count -gt 0) {
    Copy-Item $envPath (($envPath) + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -Force
    [System.IO.File]::WriteAllText($envPath, $text, [System.Text.UTF8Encoding]::new($false))
    Warn '已自动修复 .env 的认证配置（原文件已备份为 .env.bak-*）：'
    foreach ($item in $changed) { Say "       · $item" }
  } else {
    Ok '.env 认证配置齐全（CORS / JWT_SECRET / DEMO_PASSWORD / 教师注册开关）'
  }

  # 数据库密码无法代填
  $dbMatch = [regex]::Match($text, '(?m)^DB_PASSWORD=(.*)$')
  $dbValue = ''
  if ($dbMatch.Success) { $dbValue = $dbMatch.Groups[1].Value.Trim() }
  if ($dbValue.Length -eq 0 -or $dbValue -match '(?i)^(请|change[-_ ]?me|replace[-_ ]?me|example|your[-_ ])') {
    Warn 'DB_PASSWORD 还没填：它必须是你本机 MySQL 的密码（无法自动生成）。请在 .env 里填好后重新运行本脚本。'
    exit 1
  }
}

function Stop-All {
  Step '停止前后端服务'
  Stop-Port $StudentPort '学生端'
  Stop-Port $TeacherPort '教师端'
  Stop-Port $BackendPort '后端'
  if ($StopMysql) { Stop-Port $MysqlPort 'MySQL' }
  else { Say '     MySQL 保持运行 (3306)；需要一起停可加 -StopMysql' }
}

# ---------------------------------------------------------------- 主流程

Say ''
Say '=============================================='
Say '  LearnMate 本地启动（MySQL + 后端 + 前端）'
Say "  项目目录：$Root"
Say '=============================================='
Say ''

if (-not (Test-Path (Join-Path $Root 'backend\src\index.js'))) {
  Warn "这个目录不像项目根目录（找不到 backend\src\index.js）：$Root"
  exit 1
}

foreach ($required in @($NodeExe, $NpmCmd)) {
  if ([string]::IsNullOrEmpty($required) -or -not (Test-Path $required)) {
    Warn '找不到 Node/npm：请安装 Node.js 24 后重试（脚本会自动识别 PATH 与常见安装目录）。'
    exit 1
  }
}

if ($Stop -and -not $Restart) { Stop-All; Say ''; Ok '已按要求停止'; exit 0 }

if ($Restart) { Stop-All; Say '' }

# 0) .env 认证配置自检/修复：保证组员机器与开发机行为一致
Step '0/4 .env 认证配置自检'
Repair-EnvFile
Say ''

# 1) MySQL
Step "1/4 MySQL ($MysqlPort)"
if ($UseBundledMysql -and -not (Test-Path (Join-Path $MysqlData 'mysql'))) {
  Say '     首次运行：初始化自带 MySQL 数据目录 ...'
  New-Item -ItemType Directory -Path $MysqlData -Force | Out-Null
  & (Join-Path $MysqlBin 'mysqld.exe') "--defaults-file=$MysqlCfg" "--basedir=$MysqlHome" "--datadir=$MysqlData" --initialize-insecure --console
  if ($LASTEXITCODE -ne 0) { Warn 'MySQL 数据目录初始化失败'; exit 1 }
}
if (Test-PortUp $MysqlPort) {
  Ok 'MySQL 已在运行'
} else {
  if (-not $MysqlBin -or -not $MysqlCfg -or -not (Test-Path (Join-Path $MysqlBin 'mysqld.exe'))) {
    Warn '本机 MySQL 没在运行，且脚本没有找到可用的 mysqld.exe / my.ini。'
    Warn '请任选其一：① 启动本机 MySQL 8.x；② 用 Docker 版 docker compose up -d --build；③ 在脚本顶部把 MysqlHome / MysqlCfg 指到你的 MySQL。'
    exit 1
  }
  Say '     启动 mysqld ...'
  $mysqlArgs = @("--defaults-file=$MysqlCfg")
  if ($UseBundledMysql) { $mysqlArgs += @("--basedir=$MysqlHome", "--datadir=$MysqlData") }
  Start-Process -FilePath (Join-Path $MysqlBin 'mysqld.exe') -ArgumentList $mysqlArgs -WorkingDirectory (Split-Path $MysqlCfg -Parent) -WindowStyle Hidden
  $up = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if (Test-PortUp $MysqlPort) { $up = $true; break }
  }
  if ($up) { Ok 'MySQL 已就绪' } else { Warn "MySQL 启动失败，请检查 $MysqlCfg"; exit 1 }
}

# 2) 依赖
Step '2/4 依赖检查'
$dirs = @('backend', 'frontend-new', 'frontend-teacher')
$needInstall = $false
foreach ($d in $dirs) {
  $modDir = Join-Path $Root "$d\node_modules"
  if (-not (Test-Path $modDir)) {
    Warn "$d\node_modules 不存在"
    $needInstall = $true
  } elseif ((Get-Item (Join-Path $Root "$d\package.json")).LastWriteTime -gt (Get-Item $modDir).LastWriteTime) {
    Warn "$d\package.json 比 node_modules 新，依赖可能已变更（可加 -Install 重装）"
  }
}
if ($Install) { $needInstall = $true }
if ($needInstall) {
  foreach ($d in $dirs) {
    Say "     npm install 于 $d （可能要几分钟）..."
    Push-Location (Join-Path $Root $d)
    & $NpmCmd install 2>&1 | ForEach-Object { Say "       $_" }
    Pop-Location
  }
  Ok '依赖安装完成'
} else {
  Ok '三个目录依赖齐全，跳过安装'
}

# 3) 后端
# An enabled WSL judge must survive a Windows/WSL restart as well.
$runnerEnvPath = Join-Path $Root '.env'
if (Test-Path -LiteralPath $runnerEnvPath) {
  $runnerConfig = Get-Content -LiteralPath $runnerEnvPath -Raw
  if ($runnerConfig -match '(?m)^CODE_EXECUTION_MODE=docker\s*$' -and $runnerConfig -match '(?m)^CODE_RUNNER_TRANSPORT=wsl\s*$') {
    $runnerDistro = 'Ubuntu-24.04'
    if ($runnerConfig -match '(?m)^CODE_RUNNER_WSL_DISTRO=([^\r\n]+)') { $runnerDistro = $Matches[1].Trim() }
    & wsl.exe -d $runnerDistro --user root --exec service docker start
    if ($LASTEXITCODE -ne 0) { Warn 'CodeLab Docker 启动失败，请运行启用CodeLab在线判题.bat' }
  }
}
Step "3/4 后端 ($BackendPort)"
if (Test-PortUp $BackendPort) {
  Ok '后端已在运行'
} else {
  # 浏览器登录会带 Origin（如 http://localhost:5173）。.env 里 NODE_ENV=production 时，
  # 后端只认 CORS_ALLOWED_ORIGINS，不再自动放行 5173/5174，缺失就会 403 CORS_ORIGIN_DENIED。
  # dotenv 不覆盖已存在的环境变量，所以启动前把本地端口补进这个变量最稳妥。
  $devOrigins = @('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174')
  $originList = @()
  $envPath = Join-Path $Root '.env'
  if (Test-Path $envPath) {
    $originLine = Select-String -Path $envPath -Pattern '^CORS_ALLOWED_ORIGINS=' | Select-Object -First 1
    if ($originLine) {
      $originList = @(($originLine.Line -split '=', 2)[1] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    }
  }
  foreach ($o in $devOrigins) { if ($originList -notcontains $o) { $originList += $o } }
  $env:CORS_ALLOWED_ORIGINS = ($originList -join ',')
  Say "     CORS 白名单：$env:CORS_ALLOWED_ORIGINS"
  $backendArgs = @('backend/src/index.js')
  if ($Watch) {
    $backendArgs = @('--watch', 'backend/src/index.js')
    Say '     Watch 模式：改后端代码会自动重启'
  }
  Say '     启动 node ...'
  Start-Process -FilePath $NodeExe -ArgumentList $backendArgs -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Root 'backend.out.log') `
    -RedirectStandardError  (Join-Path $Root 'backend.err.log')
  if (Wait-Http "http://127.0.0.1:$BackendPort/api/health" 60) {
    Ok '后端已就绪（/api/health 正常）'
  } else {
    Warn '后端启动超时'
    Show-LogTail (Join-Path $Root 'backend.err.log') '后端错误'
    Show-LogTail (Join-Path $Root 'backend.out.log') '后端输出'
  }
}

# 4) 前端
Step "4/4 前端 ($StudentPort / $TeacherPort)"
$frontends = @(
  @{ Name = '学生端'; Dir = 'frontend-new';     Port = $StudentPort; Out = 'frontend-new.out.log';     Err = 'frontend-new.err.log' },
  @{ Name = '教师端'; Dir = 'frontend-teacher'; Port = $TeacherPort; Out = 'frontend-teacher.out.log'; Err = 'frontend-teacher.err.log' }
)
foreach ($f in $frontends) {
  if (Test-PortUp $f.Port) {
    Ok "$($f.Name) 已在运行 ($($f.Port))"
    continue
  }
  Say "     启动 $($f.Name) vite ..."
  Start-Process -FilePath $NpmCmd -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--strictPort') -WorkingDirectory (Join-Path $Root $f.Dir) -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Root $f.Out) `
    -RedirectStandardError  (Join-Path $Root $f.Err)
}
foreach ($f in $frontends) {
  if (Wait-Http "http://127.0.0.1:$($f.Port)/" 20) {
    Ok "$($f.Name) 已就绪 ($($f.Port))"
  } else {
    Warn "$($f.Name) 的 Vite 开发服务未就绪，尝试生产构建回退"
    Show-LogTail (Join-Path $Root $f.Out) "$($f.Name) 输出"
    $fallbackScript = Join-Path $RuntimeRoot 'static-frontends.cjs'
    if ((Test-Path $fallbackScript) -and (Test-Path (Join-Path $Root 'frontend-new\dist\index.html')) -and (Test-Path (Join-Path $Root 'frontend-teacher\dist\index.html'))) {
      if (-not (Test-PortUp $StudentPort) -or -not (Test-PortUp $TeacherPort)) {
        Start-Process -FilePath $NodeExe -ArgumentList @($fallbackScript, $Root) -WorkingDirectory $Root -WindowStyle Hidden `
          -RedirectStandardOutput (Join-Path $Root 'frontend-static.out.log') `
          -RedirectStandardError  (Join-Path $Root 'frontend-static.err.log')
      }
      if (Wait-Http "http://127.0.0.1:$($f.Port)/" 15) { Ok "$($f.Name) 已通过生产构建回退启动 ($($f.Port))" }
      else { Warn "$($f.Name) 回退启动失败"; Show-LogTail (Join-Path $Root 'frontend-static.err.log') '静态前端错误' }
    }
  }
}

# 汇总
# 刚启动的 Vite 首次请求要预打包依赖，预算给小了会误报“未通过检查”
$backendOk = Wait-Http "http://127.0.0.1:$BackendPort/api/health" 15
$studentOk = Wait-Http "http://127.0.0.1:$StudentPort/" 15
$teacherOk = Wait-Http "http://127.0.0.1:$TeacherPort/" 15
$allOk = $backendOk -and $studentOk -and $teacherOk
if (-not $backendOk) { Warn "后端未通过健康检查：http://127.0.0.1:$BackendPort/api/health" }
if (-not $studentOk) { Warn "学生端未就绪：http://127.0.0.1:$StudentPort/" }
if (-not $teacherOk) { Warn "教师端未就绪：http://127.0.0.1:$TeacherPort/" }

Say ''
Say '----------------------------------------------'
if ($allOk) { Ok '全部服务已就绪' } else { Warn '至少一个服务未通过检查，请查看上方提示和日志' }
Say ''
Say '  学生端   http://127.0.0.1:5173'
Say '  教师端   http://127.0.0.1:5174'
Say '  后端     http://127.0.0.1:5800/api/health'
Say '  数字讲师 http://127.0.0.1:5173/digital-tutor.html'
Say ''
Say '  内置账号 zhangsan / lisi / teacher_demo'
Say '  密码     见项目根目录 .env 里的 DEMO_PASSWORD'
Say ''
Say '  日志     backend.out.log / backend.err.log / frontend-*.out.log'
Say '  停止     .\start-learnmate.ps1 -Stop'
Say '----------------------------------------------'
Say ''

if ($Open) {
  foreach ($u in @("http://127.0.0.1:$StudentPort/", "http://127.0.0.1:$TeacherPort/", "http://127.0.0.1:$BackendPort/api/health", "http://127.0.0.1:$StudentPort/digital-tutor.html")) {
    Start-Process $u
    Say "[opened] $u"
  }
}

if (-not $allOk) { exit 1 }
exit 0
