# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 智课研伴 LearnMate — 包内公共函数（被 start / stop / uninstall / configure-ai 共用）
# 兼容 Windows PowerShell 5.1：不使用三元运算符、?? 等 PS7 语法，也不开 StrictMode
# （配置对象是 JSON 反序列化来的，缺字段时按 $null 处理更稳妥）。

function Get-LmProp($Object, [string]$Name, $Default = $null) {
    if ($null -eq $Object) { return $Default }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value -or "$($property.Value)" -eq '') { return $Default }
    return $property.Value
}

function Write-LmInfo([string]$Message) { Write-Host "[智课研伴] $Message" -ForegroundColor Cyan }
function Write-LmOk([string]$Message) { Write-Host "[智课研伴] $Message" -ForegroundColor Green }
function Write-LmWarn([string]$Message) { Write-Host "[智课研伴] $Message" -ForegroundColor Yellow }
function Write-LmError([string]$Message) { Write-Host "[智课研伴] $Message" -ForegroundColor Red }

function New-LmSecret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($buffer) -replace '-', '')
}

function Write-LmText([string]$Path, [string]$Text, [switch]$WithBom) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $encoding = New-Object System.Text.UTF8Encoding($WithBom.IsPresent)
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Read-LmJson([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Write-LmJson([string]$Path, $Object) {
    Write-LmText -Path $Path -Text ($Object | ConvertTo-Json -Depth 8)
}

function Get-LmRoot {
    # scripts\ 的上一级就是软件根目录
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-LmConfigPath([string]$Root) { return (Join-Path $Root 'runtime\config.json') }

function New-LmAiConfig([string]$Root) {
    # 有云端功能配置模板（seed\cloud.env）就照它来：桌面版的大模型功能与云端保持一致
    $profile = Read-LmCloudProfile $Root
    $enabled = $false
    if ((Get-LmProfileValue $profile 'AI_ENABLED' 'false') -eq 'true') { $enabled = $true }
    return [pscustomobject]@{
        enabled      = $enabled
        provider     = (Get-LmProfileValue $profile 'LLM_PROVIDER' 'openai-compatible')
        baseUrl      = (Get-LmProfileValue $profile 'LLM_API_URL' '')
        model        = (Get-LmProfileValue $profile 'LLM_MODEL' '')
        apiKey       = (Get-LmProfileValue $profile 'LLM_API_KEY' '')
        visionModel  = (Get-LmProfileValue $profile 'LLM_VISION_MODEL' '')
        tutorModel   = (Get-LmProfileValue $profile 'LLM_TUTOR_MODEL' '')
        plannerModel = (Get-LmProfileValue $profile 'LLM_PLANNER_MODEL' '')
        quizModel    = (Get-LmProfileValue $profile 'LLM_QUIZ_MODEL' '')
        timeoutMs    = (Get-LmProfileValue $profile 'LLM_TIMEOUT_MS' '120000')
        jsonMode     = (Get-LmProfileValue $profile 'LLM_JSON_MODE' '')
    }
}

function New-LmConfig([string]$Root = '') {
    $demoPassword = 'LearnMateLocal2026!'
    $codeExecution = 'auto'
    $ai = [pscustomobject]@{ enabled = $false; baseUrl = ''; model = ''; apiKey = ''; provider = '' }
    if ($Root) {
        $profile = Read-LmCloudProfile $Root
        $demoPassword = (Get-LmProfileValue $profile 'DEMO_PASSWORD' $demoPassword)
        $codeExecution = (Get-LmProfileValue $profile 'CODE_EXECUTION_MODE' 'auto')
        if (@('auto', 'docker', 'local', 'disabled') -notcontains $codeExecution) { $codeExecution = 'auto' }
        $ai = New-LmAiConfig $Root
    }
    return [pscustomobject]@{
        schema        = 1
        createdAt     = (Get-Date).ToString('s')
        ports         = [pscustomobject]@{ mysql = 13306; backend = 5800; student = 8080; teacher = 8081 }
        db            = [pscustomobject]@{ name = 'learnmate'; user = 'learnmate'; password = (New-LmSecret 18); rootPassword = (New-LmSecret 18) }
        jwtSecret     = (New-LmSecret 32)
        demoPassword  = $demoPassword
        seeded        = $false
        codeExecution = $codeExecution
        ai            = $ai
    }
}

function Get-LmConfig([string]$Root, [switch]$Create) {
    $path = Get-LmConfigPath $Root
    $config = Read-LmJson $path
    if (-not $config) {
        if (-not $Create) { return $null }
        $config = New-LmConfig $Root
        Write-LmJson -Path $path -Object $config
    }
    return $config
}

function Test-LmPortOpen([int]$Port, [int]$TimeoutMs = 400) {
    # 只探测本机回环地址；注意不要用 $Host 当参数名，那是 PowerShell 的内置只读变量
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-LmFreePort([int]$Preferred, [int]$Tries = 60) {
    for ($i = 0; $i -lt $Tries; $i++) {
        $candidate = $Preferred + $i
        if ($candidate -gt 65535) { break }
        if (-not (Test-LmPortOpen $candidate)) { return $candidate }
    }
    throw "端口 $Preferred 起连续 $Tries 个端口都被占用，请先释放端口或关闭占用程序。"
}

function Wait-LmPort([int]$Port, [int]$TimeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-LmPortOpen $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Wait-LmHttp([string]$Url, [int]$TimeoutSec = 300) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $lastError = ''
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Seconds 2
    }
    if ($lastError) { Write-LmWarn "等待 $Url 超时：$lastError" }
    return $false
}

function Get-LmProcess([int]$ProcessId) {
    try { return (Get-Process -Id $ProcessId -ErrorAction Stop) } catch { return $null }
}

function Test-LmOwnProcess([int]$ProcessId, [string]$Root, [string]$ExtraRoot = '') {
    # PID 会被系统复用，所以还要确认可执行文件确实属于本包
    # （路径含中文时 MySQL 运行时会被搬到 ASCII 目录，所以允许额外的根目录）
    $process = Get-LmProcess $ProcessId
    if (-not $process) { return $false }
    try {
        $path = $process.Path
    } catch {
        return $false
    }
    if (-not $path) { return $false }
    if ($path.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($ExtraRoot -and $path.StartsWith($ExtraRoot, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $false
}

function Read-LmPidFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    try {
        $value = (Get-Content -LiteralPath $Path -Raw).Trim()
        $parsed = 0
        if ([int]::TryParse($value, [ref]$parsed)) { return $parsed }
        return 0
    } catch { return 0 }
}

function Write-LmPidFile([string]$Path, [int]$ProcessId) {
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-LmText -Path $Path -Text "$ProcessId"
}

function Test-LmAsciiPath([string]$Path) {
    return (-not ($Path -match '[^\x00-\x7F]'))
}

function Get-LmMySqlHome([string]$Root) {
    # MySQL 8.4（Windows 版）无法处理自身路径里的非 ASCII 字符：实测把
    # C:\Users\admin\lm-中文-test 认成 C:\Users\admin\lm-，随后 basedir/datadir 全错并退出。
    # 中文用户名/中文目录非常常见，所以路径含非 ASCII 时把 MySQL 运行时与数据目录
    # 迁到纯 ASCII 位置（优先公共目录）；目录名带安装路径哈希，保证多份拷贝互不串用。
    if (Test-LmAsciiPath $Root) { return '' }
    $md5 = [System.Security.Cryptography.MD5]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())
        $hash = ([System.BitConverter]::ToString($md5.ComputeHash($bytes)) -replace '-', '').Substring(0, 8).ToLowerInvariant()
    } finally {
        $md5.Dispose()
    }
    foreach ($candidate in @(
        $(if ($env:PUBLIC) { Join-Path $env:PUBLIC "LearnMateRuntime\$hash" }),
        $(if ($env:SystemDrive) { Join-Path $env:SystemDrive "LearnMateRuntime\$hash" })
    )) {
        if ($candidate -and (Test-LmAsciiPath $candidate)) { return $candidate }
    }
    return ''
}

function Get-LmPaths([string]$Root) {
    $mySqlHome = Get-LmMySqlHome $Root
    $mySqlBase = Join-Path $Root 'runtime\mysql'
    $mySqlData = Join-Path $Root 'data\mysql'
    $mySqlLogs = Join-Path $Root 'logs'
    $mySqlPids = Join-Path $Root 'runtime\pids'
    if ($mySqlHome) {
        $mySqlBase = Join-Path $mySqlHome 'mysql'
        $mySqlData = Join-Path $mySqlHome 'data'
        $mySqlLogs = Join-Path $mySqlHome 'logs'
        $mySqlPids = Join-Path $mySqlHome 'pids'
    }
    return [pscustomobject]@{
        Root         = $Root
        Node         = (Join-Path $Root 'runtime\node\node.exe')
        MySqlHome    = $mySqlHome
        MySqlBin     = (Join-Path $mySqlBase 'bin')
        MySqlBase    = $mySqlBase
        MySqlData    = $mySqlData
        MySqlLogs    = $mySqlLogs
        MySqlPids    = $mySqlPids
        Backend      = (Join-Path $Root 'backend')
        WebStudent   = (Join-Path $Root 'web\student')
        WebTeacher   = (Join-Path $Root 'web\teacher')
        Storage      = (Join-Path $Root 'data\storage')
        Logs         = (Join-Path $Root 'logs')
        Pids         = (Join-Path $Root 'runtime\pids')
        Env          = (Join-Path $Root '.env')
        Server       = (Join-Path $Root 'scripts\static-server.cjs')
    }
}

function Initialize-LmMySqlHome([string]$Root) {
    # 需要时把 runtime\mysql 复制到 ASCII 位置（只做一次，约 98MB）
    $p = Get-LmPaths $Root
    if (-not $p.MySqlHome) { return $false }
    $target = $p.MySqlBase
    if (Test-Path -LiteralPath (Join-Path $target 'bin\mysqld.exe')) {
        foreach ($dir in @($p.MySqlData, $p.MySqlLogs, $p.MySqlPids)) {
            if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        }
        return $false
    }
    Write-LmWarn "当前路径含中文/特殊字符，内置数据库无法就地运行，正在把 MySQL 运行时搬到 $target（只做一次）…"
    if (-not (Test-Path -LiteralPath $p.MySqlHome)) { New-Item -ItemType Directory -Path $p.MySqlHome -Force | Out-Null }
    Copy-Item -LiteralPath (Join-Path $Root 'runtime\mysql') -Destination $target -Recurse -Force
    foreach ($dir in @($p.MySqlData, $p.MySqlLogs, $p.MySqlPids)) {
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    }
    Write-LmInfo "MySQL 运行时已就位：$target"
    return $true
}


function Write-LmEnvFile($Config, [string]$Root) {
    $p = Get-LmPaths $Root
    $student = [int]$Config.ports.student
    $teacher = [int]$Config.ports.teacher
    $seed = 'false'
    $import = 'false'
    if (-not $Config.seeded) { $seed = 'true'; $import = 'true' }
    $aiEnabled = 'false'
    if ($Config.ai -and $Config.ai.enabled) { $aiEnabled = 'true' }
    $codeMode = 'disabled'
    # 执行器由 config.codeExecution 决定（auto：装了 Docker 就用 docker），与云端能力保持一致
    $configuredCodeMode = [string](Get-LmProp $Config 'codeExecution' 'disabled')
    if ($configuredCodeMode) { $codeMode = $configuredCodeMode }
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('# 智课研伴 LearnMate 本地运行配置（由启动脚本按 runtime\config.json 自动生成，可手改，但重启后会按 config.json 覆盖）')
    $lines.Add('NODE_ENV=production')
    $lines.Add('HOST=127.0.0.1')
    $lines.Add("PORT=$($Config.ports.backend)")
    $lines.Add('DB_HOST=127.0.0.1')
    $lines.Add("DB_PORT=$($Config.ports.mysql)")
    $lines.Add("DB_USER=$($Config.db.user)")
    $lines.Add("DB_PASSWORD=$($Config.db.password)")
    $lines.Add("DB_NAME=$($Config.db.name)")
    $lines.Add("JWT_SECRET=$($Config.jwtSecret)")
    $lines.Add('JWT_EXPIRES_IN=8h')
    $lines.Add("CORS_ALLOWED_ORIGINS=http://127.0.0.1:$student,http://localhost:$student,http://127.0.0.1:$teacher,http://localhost:$teacher,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5174,http://localhost:5174")
    $lines.Add("RESOURCE_STORAGE_DIR=$(Join-Path $p.Storage 'resources')")
    $lines.Add("REPORT_STORAGE_DIR=$(Join-Path $p.Storage 'reports')")
    $lines.Add('DB_INIT_MAX_ATTEMPTS=40')
    $lines.Add('DB_INIT_RETRY_MS=2000')
    $lines.Add("KNOWLEDGE_IMPORT_ON_START=$import")
    $lines.Add("SEED_DEMO_DATA=$seed")
    $lines.Add("DEMO_PASSWORD=$($Config.demoPassword)")
    $lines.Add('TEACHER_REGISTRATION_MODE=open')
    $lines.Add("AI_ENABLED=$aiEnabled")
    $lines.Add("PATH_PLANNER_AI_ENABLED=$aiEnabled")
    $lines.Add("MULTIMODAL_RESOURCE_AI_ENABLED=$aiEnabled")
    $lines.Add("MULTIMODAL_REVIEW_AI_ENABLED=$aiEnabled")
    $lines.Add("CODE_EXECUTION_MODE=$codeMode")
    $bundledCompilerPath = Join-Path $Root 'runtime\cc\bin\gcc.exe'
    if (Test-Path -LiteralPath $bundledCompilerPath) { $lines.Add("CODE_RUNNER_GCC_PATH=$bundledCompilerPath") }
    $lines.Add('TZ=Asia/Shanghai')
    if ($Config.ai -and $Config.ai.enabled) {
        $lines.Add("LLM_API_URL=$($Config.ai.baseUrl)")
        $lines.Add("LLM_MODEL=$($Config.ai.model)")
        $lines.Add("LLM_API_KEY=$($Config.ai.apiKey)")
        $lines.Add("LLM_PROVIDER=$(Get-LmProp $Config.ai 'provider' 'openai-compatible')")
        $lines.Add("LLM_TIMEOUT_MS=$(Get-LmProp $Config.ai 'timeoutMs' '60000')")
        $lines.Add("LLM_MAX_TIMEOUT_MS=$(Get-LmProp $Config.ai 'timeoutMs' '60000')")
        foreach ($modelKey in @('visionModel', 'tutorModel', 'plannerModel', 'quizModel')) {
            $modelValue = [string](Get-LmProp $Config.ai $modelKey '')
            if ($modelValue) {
                $envKey = 'LLM_' + ($modelKey -replace 'Model$', '').ToUpperInvariant() + '_MODEL'
                $lines.Add("$envKey=$modelValue")
            }
        }
        $jsonMode = [string](Get-LmProp $Config.ai 'jsonMode' '')
        if ($jsonMode) { $lines.Add("LLM_JSON_MODE=$jsonMode") }
        $url = [string]$Config.ai.baseUrl
        if ($url -match '127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.') {
            $lines.Add('LLM_LOCAL_ALLOW_PRIVATE=true')
        }
    }
    Write-LmText -Path $p.Env -Text (($lines -join [Environment]::NewLine) + [Environment]::NewLine)
    return $p.Env
}

function Set-LmProcessEnv($Config, [string]$Root) {
    $p = Get-LmPaths $Root
    $student = [int]$Config.ports.student
    $teacher = [int]$Config.ports.teacher
    $env:NODE_ENV = 'production'
    $env:HOST = '127.0.0.1'
    $env:PORT = [string]$Config.ports.backend
    $env:DB_HOST = '127.0.0.1'
    $env:DB_PORT = [string]$Config.ports.mysql
    $env:DB_USER = [string]$Config.db.user
    $env:DB_PASSWORD = [string]$Config.db.password
    $env:DB_NAME = [string]$Config.db.name
    $env:JWT_SECRET = [string]$Config.jwtSecret
    $env:JWT_EXPIRES_IN = '8h'
    $env:CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$student,http://localhost:$student,http://127.0.0.1:$teacher,http://localhost:$teacher,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5174,http://localhost:5174"
    $env:RESOURCE_STORAGE_DIR = (Join-Path $p.Storage 'resources')
    $env:REPORT_STORAGE_DIR = (Join-Path $p.Storage 'reports')
    $env:DB_INIT_MAX_ATTEMPTS = '40'
    $env:DB_INIT_RETRY_MS = '2000'
    $env:DEMO_PASSWORD = [string]$Config.demoPassword
    $env:TEACHER_REGISTRATION_MODE = 'open'
    $resolvedCodeMode = [string](Get-LmProp $Config 'codeExecution' 'disabled')
    if (-not $resolvedCodeMode) { $resolvedCodeMode = 'disabled' }
    $env:CODE_EXECUTION_MODE = $resolvedCodeMode
    $bundledCompiler = Join-Path $Root 'runtime\cc\bin\gcc.exe'
    if (Test-Path -LiteralPath $bundledCompiler) { $env:CODE_RUNNER_GCC_PATH = $bundledCompiler }
    $env:TZ = 'Asia/Shanghai'
    if ($Config.seeded) {
        $env:KNOWLEDGE_IMPORT_ON_START = 'false'
        $env:SEED_DEMO_DATA = 'false'
    } else {
        $env:KNOWLEDGE_IMPORT_ON_START = 'true'
        $env:SEED_DEMO_DATA = 'true'
    }
    if ($Config.ai -and $Config.ai.enabled) {
        $env:AI_ENABLED = 'true'
        $env:PATH_PLANNER_AI_ENABLED = 'true'
        $env:MULTIMODAL_RESOURCE_AI_ENABLED = 'true'
        $env:MULTIMODAL_REVIEW_AI_ENABLED = 'true'
        $env:LLM_API_URL = [string]$Config.ai.baseUrl
        $env:LLM_MODEL = [string]$Config.ai.model
        $env:LLM_API_KEY = [string]$Config.ai.apiKey
        $env:LLM_TIMEOUT_MS = [string](Get-LmProp $Config.ai 'timeoutMs' '60000')
        $env:LLM_MAX_TIMEOUT_MS = $env:LLM_TIMEOUT_MS
        foreach ($modelKey in @('visionModel', 'tutorModel', 'plannerModel', 'quizModel')) {
            $modelValue = [string](Get-LmProp $Config.ai $modelKey '')
            if ($modelValue) {
                $envKey = 'LLM_' + ($modelKey -replace 'Model$', '').ToUpperInvariant() + '_MODEL'
                Set-Item -Path "Env:$envKey" -Value $modelValue
            }
        }
        $jsonMode = [string](Get-LmProp $Config.ai 'jsonMode' '')
        if ($jsonMode) { $env:LLM_JSON_MODE = $jsonMode }
        $url = [string]$Config.ai.baseUrl
        if ($url -match '127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.') { $env:LLM_LOCAL_ALLOW_PRIVATE = 'true' }
    } else {
        $env:AI_ENABLED = 'false'
        $env:PATH_PLANNER_AI_ENABLED = 'false'
        $env:MULTIMODAL_RESOURCE_AI_ENABLED = 'false'
        $env:MULTIMODAL_REVIEW_AI_ENABLED = 'false'
    }
}

function Start-LmHidden([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory, [string]$LogFile) {
    # 必须重定向 stdout/stderr：否则子进程会继承调用者的输出管道，
    # 只要这些常驻服务还活着，调用者（含被别的脚本 & 调用的场景）就永远等不到管道结束。
    if (-not $LogFile) { throw 'Start-LmHidden 需要 LogFile：常驻子进程必须重定向输出。' }
    $errorLog = [System.IO.Path]::Combine(
        [System.IO.Path]::GetDirectoryName($LogFile),
        [System.IO.Path]::GetFileNameWithoutExtension($LogFile) + '.err.log')
    $params = @{
        FilePath               = $FilePath
        ArgumentList           = $Arguments
        WorkingDirectory       = $WorkingDirectory
        WindowStyle            = 'Hidden'
        RedirectStandardOutput = $LogFile
        RedirectStandardError  = $errorLog
        PassThru               = $true
    }
    return (Start-Process @params)
}

function Stop-LmPidFile([string]$PidPath, [string]$Root, [string]$Label) {
    $processId = Read-LmPidFile $PidPath
    if ($processId -le 0) { return $false }
    if (-not (Test-LmOwnProcess -ProcessId $processId -Root $Root)) {
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
        return $false
    }
    & taskkill.exe /PID $processId /T /F *> $null
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-LmProcess $processId)) { break }
        Start-Sleep -Milliseconds 250
    }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    Write-LmInfo "$Label 已停止（PID $processId）"
    return $true
}

function Invoke-LmMySql([string]$Root, [string]$Sql, [string]$User, [string]$Password, [int]$Port, [string]$Database = '') {
    $p = Get-LmPaths $Root
    $exe = Join-Path $p.MySqlBin 'mysql.exe'
    # 用 MYSQL_PWD 传密码：命令行传密码会往 stderr 打警告，PowerShell 会把它当错误
    $previousPassword = $env:MYSQL_PWD
    $previousEap = $ErrorActionPreference
    $env:MYSQL_PWD = $Password
    # 关键：mysql.exe 失败时会往 stderr 写错误（例如探测用的空密码 1045），
    # 在 $ErrorActionPreference='Stop' 下 PowerShell 会把原生命令的 stderr 当成致命错误抛出，
    # 于是"探测失败"会直接把整个启动流程打断。这里临时降级为 Continue，靠退出码判断成败。
    $ErrorActionPreference = 'Continue'
    try {
        $cliArgs = @('--no-defaults', '-h', '127.0.0.1', '-P', "$Port", '-u', $User, '--default-character-set=utf8mb4')
        if ($Database) { $cliArgs += @('-D', $Database) }
        $cliArgs += @('-e', $Sql)
        $output = & $exe @cliArgs 2>&1
        $code = $LASTEXITCODE
        return [pscustomobject]@{ ExitCode = $code; Output = ($output | Out-String) }
    } finally {
        $ErrorActionPreference = $previousEap
        if ($null -eq $previousPassword) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousPassword }
    }
}

function Test-LmRunning([string]$Root) {
    $p = Get-LmPaths $Root
    $backendPid = Read-LmPidFile (Join-Path $p.Pids 'backend.pid')
    $mysqlPid = Read-LmPidFile (Join-Path $p.Pids 'mysql.pid')
    return ([bool](Test-LmOwnProcess -ProcessId $backendPid -Root $Root) -or [bool](Test-LmOwnProcess -ProcessId $mysqlPid -Root $Root))
}

function Get-LmOwnProcess([string]$Name, [string]$Root, [string]$ExtraRoot = '') {
    # 只认可执行文件属于本包的进程，避免误伤用户其它 Node / MySQL
    $found = @()
    foreach ($process in (Get-Process -Name $Name -ErrorAction SilentlyContinue)) {
        try {
            $path = $process.Path
            if (-not $path) { continue }
            if ($path.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) { $found += $process; continue }
            if ($ExtraRoot -and $path.StartsWith($ExtraRoot, [System.StringComparison]::OrdinalIgnoreCase)) { $found += $process }
        } catch { }
    }
    return $found
}

function Stop-LmStragglers([string]$Root, [bool]$IncludeDatabase = $false, [bool]$Quiet = $true) {
    # 上次异常退出可能留下没写进 PID 文件的进程：一并清掉，避免重复实例抢数据库
    $p = Get-LmPaths $Root
    $tracked = @(
        (Read-LmPidFile (Join-Path $p.Pids 'mysql.pid')),
        (Read-LmPidFile (Join-Path $p.Pids 'backend.pid')),
        (Read-LmPidFile (Join-Path $p.Pids 'student.pid')),
        (Read-LmPidFile (Join-Path $p.Pids 'teacher.pid'))
    )
    $names = @('node')
    if ($IncludeDatabase) { $names = @('mysqld', 'node') }
    $stale = @()
    foreach ($name in $names) {
        $extra = ''
        if ($name -eq 'mysqld') { $extra = $p.MySqlHome }
        foreach ($process in (Get-LmOwnProcess -Name $name -Root $Root -ExtraRoot $extra)) {
            if ($tracked -notcontains $process.Id) { $stale += $process }
        }
    }
    foreach ($process in $stale) {
        if (-not $Quiet) { Write-LmWarn "清理遗留进程 $($process.ProcessName) (PID $($process.Id))" }
        & taskkill.exe /PID $process.Id /T /F *> $null
    }
    if ($stale.Count -gt 0) { Start-Sleep -Seconds 2 }
    return $stale.Count
}

function Stop-LmDatabase($Config, [string]$Root, [bool]$Quiet = $true) {
    $p = Get-LmPaths $Root
    $pidPath = Join-Path $p.Pids 'mysql.pid'
    $processId = Read-LmPidFile $pidPath
    $running = $false
    if ($processId -gt 0 -and (Test-LmOwnProcess -ProcessId $processId -Root $Root -ExtraRoot $p.MySqlHome)) { $running = $true }
    if (-not $running) {
        foreach ($process in (Get-LmOwnProcess -Name 'mysqld' -Root $Root -ExtraRoot $p.MySqlHome)) { $processId = $process.Id; $running = $true }
    }
    if (-not $running) {
        if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue }
        return $false
    }

    $mysqladmin = Join-Path $p.MySqlBin 'mysqladmin.exe'
    $port = 3306
    $rootPassword = ''
    if ($Config) {
        $port = [int]$Config.ports.mysql
        $rootPassword = [string]$Config.db.rootPassword
    }
    if ((Test-Path -LiteralPath $mysqladmin) -and $port -gt 0) {
        $previousPassword = $env:MYSQL_PWD
        $env:MYSQL_PWD = $rootPassword
        try {
            & $mysqladmin '--no-defaults' '-h' '127.0.0.1' '-P' "$port" '-u' 'root' 'shutdown' *> $null
        } finally {
            if ($null -eq $previousPassword) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousPassword }
        }
        for ($i = 0; $i -lt 40; $i++) {
            if (-not (Get-LmProcess $processId)) { break }
            Start-Sleep -Milliseconds 500
        }
    }
    if (Get-LmProcess $processId) { & taskkill.exe /PID $processId /T /F *> $null }
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-LmProcess $processId)) { break }
        Start-Sleep -Milliseconds 250
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    if (-not $Quiet) { Write-LmInfo "内置数据库已停止（PID $processId）" }
    return $true
}

# ---------------------------------------------------------------------------
# 云端数据快照：安装包内置 seed\（云端数据库导出 + 存储文件 + 功能配置模板），
# 首次启动直接铺进去，让桌面版的数据和云服务器一模一样（含张湛等真实账号）。
# ---------------------------------------------------------------------------

function Get-LmSeedDir([string]$Root) { return (Join-Path $Root 'seed') }

function Get-LmProfileValue($Profile, [string]$Name, [string]$Default = '') {
    if ($null -eq $Profile) { return $Default }
    if ($Profile -is [System.Collections.IDictionary]) {
        if ($Profile.Contains($Name) -and "$($Profile[$Name])" -ne '') { return [string]$Profile[$Name] }
        return $Default
    }
    return [string](Get-LmProp $Profile $Name $Default)
}

function Read-LmCloudProfile([string]$Root) {
    # 读 seed\cloud.env（从云端 .env 里挑出来的非机密功能配置），返回 键->值 哈希表
    $map = @{}
    $path = Join-Path (Get-LmSeedDir $Root) 'cloud.env'
    if (-not (Test-Path -LiteralPath $path)) { return $map }
    foreach ($line in (Get-Content -LiteralPath $path -Encoding UTF8)) {
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $map[$Matches[1]] = $Matches[2].Trim()
        }
    }
    return $map
}

function Get-LmSeedDatabasePath([string]$Root) {
    $path = Join-Path (Get-LmSeedDir $Root) 'learnmate-cloud-db.sql'
    if (Test-Path -LiteralPath $path) { return $path }
    return ''
}

function Get-LmTableCount([string]$Root, $Config) {
    $probe = Invoke-LmMySql -Root $Root -User 'root' -Password ([string]$Config.db.rootPassword) -Port ([int]$Config.ports.mysql) `
        -Sql "SELECT CONCAT('__LM_TABLES__=', COUNT(*)) FROM information_schema.tables WHERE table_schema='$($Config.db.name)';"
    if ($probe.ExitCode -ne 0) { return -1 }
    $match = [regex]::Match([string]$probe.Output, '__LM_TABLES__=(\d+)')
    if (-not $match.Success) { return -1 }
    return [int]$match.Groups[1].Value
}

function Import-LmSeedDatabase([string]$Root, $Config, [switch]$Force) {
    # 库里已经有表就绝不动它（用户自己产生的数据优先）
    $dump = Get-LmSeedDatabasePath $Root
    if (-not $dump) { return $false }
    if (-not $Force) {
        $existing = Get-LmTableCount -Root $Root -Config $Config
        if ($existing -gt 0) { return $false }
        if ($existing -lt 0) { Write-LmWarn '无法确认数据库状态，跳过内置快照导入'; return $false }
    }

    $p = Get-LmPaths $Root
    $client = Join-Path $p.MySqlBin 'mysql.exe'
    if (-not (Test-Path -LiteralPath $client)) { throw "内置 MySQL 客户端缺失：$client" }
    Write-LmInfo '首次运行：正在导入内置的云端数据快照（约 15MB，需要 1~3 分钟）…'
    # Windows 版 mysql 客户端打不开含中文的路径（报 "Failed to open file ... error: 2"），
    # 安装目录带中文时先把快照拷到纯 ASCII 目录，再从那里 source。
    $sqlPath = $dump -replace '\\', '/'
    if (-not (Test-LmAsciiPath $sqlPath)) {
        $asciiDir = Get-LmAsciiTempDir
        if (-not $asciiDir) { throw "安装路径含中文且找不到可用的纯 ASCII 临时目录，无法导入内置快照。" }
        $asciiCopy = Join-Path $asciiDir 'learnmate-cloud-seed.sql'
        Copy-Item -LiteralPath $dump -Destination $asciiCopy -Force
        $sqlPath = $asciiCopy -replace '\\', '/'
        Write-LmInfo "安装路径含中文，已把快照复制到 $asciiCopy 再导入"
    }
    $previousPassword = $env:MYSQL_PWD
    $previousEap = $ErrorActionPreference
    $env:MYSQL_PWD = [string]$Config.db.rootPassword
    # mysql.exe 会往 stderr 打提示，在 Stop 下会被当致命错误，这里临时降级
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $client '--no-defaults' '-h' '127.0.0.1' '-P' "$($Config.ports.mysql)" '-u' 'root' `
            '--default-character-set=utf8mb4' '--max_allowed_packet=1G' '-e' "source $sqlPath" 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousEap
        if ($null -eq $previousPassword) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previousPassword }
    }
    if ($code -ne 0) {
        $tail = (($output | Out-String).Trim() -split "`n" | Select-Object -Last 3) -join ' / '
        throw "导入内置数据快照失败（mysql 退出码 $code）：$tail"
    }
    $tables = Get-LmTableCount -Root $Root -Config $Config
    Write-LmOk "云端数据快照已导入（$tables 张表）"
    return $true
}

function Initialize-LmSeedStorage([string]$Root, [switch]$Force) {
    # 把快照里的资源/报告文件铺进 data\storage（目标已有内容时不覆盖）
    $seedStorage = Join-Path (Get-LmSeedDir $Root) 'storage'
    if (-not (Test-Path -LiteralPath $seedStorage)) { return $false }
    $p = Get-LmPaths $Root
    $target = $p.Storage
    $existing = 0
    if (Test-Path -LiteralPath $target) {
        $existing = @(Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue).Count
    }
    if ($existing -gt 3 -and -not $Force) { return $false }
    if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
    Write-LmInfo '正在铺开快照里的资源与报告文件…'
    Copy-Item -Path (Join-Path $seedStorage '*') -Destination $target -Recurse -Force
    $copied = @(Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-LmOk "已铺开 $copied 个文件"
    return $true
}

# 找本机 Visual Studio 的 vcvars64.bat（local 执行器要用 cl.exe 编译学生代码）
function Find-LmVisualStudio {
    $roots = @(
        $env:CODE_RUNNER_VISUAL_STUDIO,
        $env:VSINSTALLDIR,
        $env:VCINSTALLDIR,
        'C:\Program Files\Microsoft Visual Studio\2022\Community',
        'C:\Program Files\Microsoft Visual Studio\2022\Professional',
        'C:\Program Files\Microsoft Visual Studio\2022\Enterprise',
        'C:\Program Files\Microsoft Visual Studio\2022\BuildTools',
        'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
    ) | Where-Object { $_ }
    foreach ($root in $roots) {
        foreach ($candidate in @(
                (Join-Path $root 'VC\Auxiliary\Build\vcvars64.bat'),
                (Join-Path $root 'VC\Auxiliary\Build\vcvarsall.bat'),
                (Join-Path $root 'vcvars64.bat')
            )) {
            if (Test-Path -LiteralPath $candidate) { return $candidate }
        }
    }
    return ''
}

# Docker 引擎是否可用（装了 Docker Desktop 且已启动）
function Test-LmDockerEngine {
    $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $docker) { return $false }
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $null = & $docker.Source 'info' '--format' '{{.ServerVersion}}' 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previousEap
    }
}

# 判题用容器镜像是否已经构建好
function Test-LmCodeRunnerImage([string]$ImageTag = 'learnmate/code-runner-c:2.4a') {
    $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (-not $docker) { return $false }
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $images = & $docker.Source 'images' '--format' '{{.Repository}}:{{.Tag}}' 2>$null
        foreach ($line in $images) { if ("$line".Trim() -eq $ImageTag) { return $true } }
        return $false
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previousEap
    }
}

# Docker 引擎 + 判题镜像都就绪，才算 docker 模式可用
function Test-LmDockerReady([string]$ImageTag = 'learnmate/code-runner-c:2.4a') {
    if (-not (Test-LmDockerEngine)) { return $false }
    return (Test-LmCodeRunnerImage -ImageTag $ImageTag)
}

# auto 解析顺序：Docker（与云端一致，且镜像已就绪）→ 本机 Visual Studio 的 cl.exe（local）→ disabled。
# 以前只判断 docker info 成功就用 docker，结果本机装了 Docker Desktop 但没启动、
# 镜像也没构建时，判题直接不可用；而本机明明有 VS 可以走 local。
function Test-LmBundledCompiler([string]$Root) {
    # 安装包自带的便携 gcc（packaging\desktop\compiler → runtime\cc）；有它就不需要 Docker / Visual Studio
    if (-not $Root) { return '' }
    $candidate = Join-Path $Root 'runtime\cc\bin\gcc.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    return ''
}

function Resolve-LmCodeExecutionMode([string]$Configured, [string]$Root = '') {
    # 除了显式 disabled，其它模式都做「尽力而为 + 回退」，保证换台机器也能判题：
    #   docker 优先：Docker 引擎+镜像就绪就用 docker，否则有 VS 就用 local，再否则 disabled
    #   local 优先：有 VS 就用 local，否则 Docker 就绪就用 docker，再否则 disabled
    # 这一步很关键：安装包里带的云端配置写的就是 docker，别人电脑没装 Docker 时，
    # 以前会照搬 docker，结果就是「在线运行暂时不可用」。
    $mode = $Configured
    if (-not $mode) { $mode = 'auto' }
    if ($mode -eq 'disabled') { return 'disabled' }
    $dockerReady = Test-LmDockerReady
    $bundledGcc = Test-LmBundledCompiler $Root
    $visualStudio = Find-LmVisualStudio
    # 随包 gcc 与 Visual Studio 都算 local 模式（后端会自动优先用随包 gcc）
    $localReady = [bool]($bundledGcc -or $visualStudio)
    if ($mode -eq 'docker') {
        if ($dockerReady) { return 'docker' }
        if ($localReady) { return 'local' }
        return 'disabled'
    }
    if ($mode -eq 'local') {
        if ($localReady) { return 'local' }
        if ($dockerReady) { return 'docker' }
        return 'disabled'
    }
    if ($dockerReady) { return 'docker' }
    if ($localReady) { return 'local' }
    return 'disabled'
}

function Start-LmMySqlStandalone([string]$Root, $Config) {
    # 只把内置 MySQL 拉起来（导入数据、修复数据时用），参数与 start-learnmate.ps1 保持一致
    $p = Get-LmPaths $Root
    $mysqld = Join-Path $p.MySqlBin 'mysqld.exe'
    if (-not (Test-Path -LiteralPath $mysqld)) { throw "内置 MySQL 缺失：$mysqld" }
    foreach ($dir in @($p.MySqlData, $p.MySqlLogs, $p.MySqlPids)) {
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    }
    if (Test-LmPortOpen ([int]$Config.ports.mysql)) { return $false }
    $fresh = -not (Test-Path -LiteralPath (Join-Path $p.MySqlData 'mysql'))
    if ($fresh) {
        $initLog = Join-Path $p.MySqlLogs 'mysql-init.log'
        Write-LmInfo '首次运行：正在初始化内置数据库（约 10 秒）…'
        $initProcess = Start-Process -FilePath $mysqld -ArgumentList @(
            '--no-defaults', '--initialize-insecure', "--basedir=$($p.MySqlBase)", "--datadir=$($p.MySqlData)", "--log-error=$initLog"
        ) -WorkingDirectory $p.MySqlBase -WindowStyle Hidden -Wait -PassThru
        if ($initProcess.ExitCode -ne 0) { throw "数据库初始化失败，详见 $initLog" }
    }
    $serverLog = Join-Path $p.MySqlLogs 'mysql.log'
    $arguments = @(
        '--no-defaults',
        "--basedir=$($p.MySqlBase)",
        "--datadir=$($p.MySqlData)",
        "--port=$($Config.ports.mysql)",
        '--bind-address=127.0.0.1',
        '--character-set-server=utf8mb4',
        '--collation-server=utf8mb4_unicode_ci',
        '--mysqlx=0',
        "--log-error=$serverLog",
        "--pid-file=$(Join-Path $p.MySqlPids 'mysql-server.pid')"
    )
    $process = Start-Process -FilePath $mysqld -ArgumentList $arguments -WorkingDirectory $p.MySqlBase -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $p.MySqlLogs 'mysql.out.log') -RedirectStandardError (Join-Path $p.MySqlLogs 'mysql.err.log')
    Write-LmPidFile (Join-Path $p.Pids 'mysql.pid') $process.Id
    if (-not (Wait-LmPort -Port ([int]$Config.ports.mysql) -TimeoutSec 120)) {
        throw "数据库未能在 120 秒内就绪，详见 $serverLog"
    }
    Start-Sleep -Seconds 2
    return $fresh
}

# 找一个纯 ASCII、可写的临时目录（给 mysql 客户端读 .sql 用）
function Get-LmAsciiTempDir {
    foreach ($candidate in @($env:TEMP, $env:PUBLIC, (Join-Path $env:SystemDrive 'Windows\Temp'), (Join-Path $env:SystemDrive 'LearnMateSeed'))) {
        if (-not $candidate) { continue }
        if (-not (Test-LmAsciiPath $candidate)) { continue }
        try {
            if (-not (Test-Path -LiteralPath $candidate)) { New-Item -ItemType Directory -Path $candidate -Force | Out-Null }
            return $candidate
        } catch {
        }
    }
    return ''
}

# 老配置（在加入云端快照之前生成的 config.json）补一次云端功能配置：AI 开关/模型、判题执行器、演示口令。
#   用 profileApplied 标记只补一次：之后用户在「配置AI模型.bat」里的改动不会被覆盖。
function Update-LmConfigFromProfile([string]$Root, $Config) {
    if (-not $Config) { return $false }
    if ((Get-LmProp $Config 'profileApplied' '')) { return $false }
    $profile = Read-LmCloudProfile $Root
    if ($profile.Count -eq 0) { return $false }
    $Config | Add-Member -NotePropertyName ai -NotePropertyValue (New-LmAiConfig $Root) -Force
    $configuredCode = (Get-LmProfileValue $profile 'CODE_EXECUTION_MODE' 'auto')
    if (@('auto', 'docker', 'local', 'disabled') -contains $configuredCode) { $Config | Add-Member -NotePropertyName codeExecution -NotePropertyValue $configuredCode -Force }
    $demoPassword = (Get-LmProfileValue $profile 'DEMO_PASSWORD' '')
    if ($demoPassword) { $Config | Add-Member -NotePropertyName demoPassword -NotePropertyValue $demoPassword -Force }
    $Config | Add-Member -NotePropertyName profileApplied -NotePropertyValue ((Get-Date).ToString('s')) -Force
    Write-LmInfo '已按内置的云端配置补充功能设置（AI 模型 / 判题执行器）'
    return $true
}