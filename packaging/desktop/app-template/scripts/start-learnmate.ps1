# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 寻笺 LearnMate — 一键启动（包内主入口）
#
# 做四件事：拉起内置 MySQL → 首启建库建账号 → 拉起后端（建表 / 灌知识库 / 灌演示数据）→
# 拉起学生端与教师端静态服务，最后自动打开浏览器。
# 全程只监听 127.0.0.1，不会触发 Windows 防火墙弹窗。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-learnmate.ps1
#   -NoBrowser   不自动开浏览器（脚本化验证用）
#   -Quiet       少打印（安装器调用）
#   -Restart     先把正在运行的实例停掉再启动
param(
    [switch]$NoBrowser,
    [switch]$Quiet,
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$Root = Get-LmRoot
$Config = Get-LmConfig $Root -Create
Initialize-LmMySqlHome -Root $Root | Out-Null
$P = Get-LmPaths $Root

function Ensure-Dir([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}
foreach ($dir in @($P.Logs, $P.Pids, $P.MySqlData, $P.MySqlLogs, $P.MySqlPids, (Join-Path $P.Storage 'resources'), (Join-Path $P.Storage 'reports'))) { Ensure-Dir $dir }

function Start-LmMySql {
    $mysqld = Join-Path $P.MySqlBin 'mysqld.exe'
    if (-not (Test-Path -LiteralPath $mysqld)) { throw "内置 MySQL 缺失：$mysqld" }
    $dataDir = $P.MySqlData
    $fresh = -not (Test-Path -LiteralPath (Join-Path $dataDir 'mysql'))
    if ($fresh) {
        Write-LmInfo "首次运行：正在初始化内置数据库（约 10 秒）…"
        Ensure-Dir $dataDir
        $initLog = Join-Path $P.MySqlLogs 'mysql-init.log'
        $process = Start-Process -FilePath $mysqld -ArgumentList @(
            '--no-defaults', '--initialize-insecure', "--basedir=$($P.MySqlBase)", "--datadir=$dataDir", "--log-error=$initLog"
        ) -WorkingDirectory $P.MySqlBase -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $P.MySqlLogs 'mysql-init.out.log') -RedirectStandardError (Join-Path $P.MySqlLogs 'mysql-init.err.log')
        if ($process.ExitCode -ne 0) { throw "数据库初始化失败，详见 $initLog" }
    }

    Write-LmInfo "启动内置数据库（端口 $($Config.ports.mysql)）…"
    $serverLog = Join-Path $P.MySqlLogs 'mysql.log'
    $arguments = @(
        '--no-defaults',
        "--basedir=$($P.MySqlBase)",
        "--datadir=$dataDir",
        "--port=$($Config.ports.mysql)",
        '--bind-address=127.0.0.1',
        '--character-set-server=utf8mb4',
        '--collation-server=utf8mb4_unicode_ci',
        '--mysqlx=0',
        "--log-error=$serverLog",
        "--pid-file=$(Join-Path $P.MySqlPids 'mysql-server.pid')"
    )
    $process = Start-Process -FilePath $mysqld -ArgumentList $arguments -WorkingDirectory $P.MySqlBase -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $P.MySqlLogs 'mysql.out.log') -RedirectStandardError (Join-Path $P.MySqlLogs 'mysql.err.log')
    Write-LmPidFile (Join-Path $P.Pids 'mysql.pid') $process.Id
    if (-not (Wait-LmPort -Port ([int]$Config.ports.mysql) -TimeoutSec 120)) {
        throw "数据库未能在 120 秒内就绪，详见 $serverLog"
    }
    Start-Sleep -Seconds 2
    return $fresh
}

function Initialize-LmDatabase([bool]$Fresh) {
    $rootPassword = [string]$Config.db.rootPassword
    # 刚初始化的库 root 是空密码；已有数据的库用 config 里记的随机密码。
    # 先试对的那个，避免每次都先打一条 1045 到日志里。
    $order = @()
    if ($Fresh) { $order = @('', $rootPassword) } else { $order = @($rootPassword, '') }
    $rootUsable = $false
    $probeOutput = ''
    foreach ($candidate in $order) {
        $probe = Invoke-LmMySql -Root $Root -Sql 'SELECT 1;' -User 'root' -Password $candidate -Port ([int]$Config.ports.mysql)
        if ($probe.ExitCode -eq 0) { $rootUsable = $true; break }
        $probeOutput = $probe.Output
    }
    if (-not $rootUsable) { throw "无法连接内置数据库（$(([string]$probeOutput).Trim())），详见 $(Join-Path $P.MySqlLogs 'mysql.log')" }

    if ($Fresh) {
        $quoted = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';"
        Invoke-LmMySql -Root $Root -Sql $quoted -User 'root' -Password '' -Port ([int]$Config.ports.mysql) | Out-Null
    }
    $password = [string]$Config.db.password
    $name = [string]$Config.db.name
    $user = [string]$Config.db.user
    $sql = @(
        "CREATE DATABASE IF NOT EXISTS ``$name`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        "CREATE USER IF NOT EXISTS '$user'@'127.0.0.1' IDENTIFIED BY '$password';"
        "ALTER USER '$user'@'127.0.0.1' IDENTIFIED BY '$password';"
        "GRANT ALL PRIVILEGES ON ``$name``.* TO '$user'@'127.0.0.1';"
        'FLUSH PRIVILEGES;'
    ) -join ' '
    $result = Invoke-LmMySql -Root $Root -Sql $sql -User 'root' -Password $rootPassword -Port ([int]$Config.ports.mysql)
    if ($result.ExitCode -ne 0) { throw "创建数据库 / 应用账号失败：$($result.Output)" }
}

function Start-LmBackend {
    $env:PORT = [string]$Config.ports.backend
    $script = Join-Path $P.Backend 'src\index.js'
    if (-not (Test-Path -LiteralPath $script)) { throw "后端入口缺失：$script" }
    $log = Join-Path $P.Logs 'backend.log'
    $process = Start-LmHidden -FilePath $P.Node -Arguments @($script) -WorkingDirectory $Root -LogFile $log
    Write-LmPidFile (Join-Path $P.Pids 'backend.pid') $process.Id
    Write-LmInfo "后端已启动（端口 $($Config.ports.backend)，PID $($process.Id)）"
}

function Start-LmWeb([string]$Client, [string]$DistDir, [int]$Port, [string]$PidName) {
    $log = Join-Path $P.Logs "$Client-web.log"
    $arguments = @($P.Server, $Client, $DistDir, "$Port", "$($Config.ports.backend)")
    $process = Start-LmHidden -FilePath $P.Node -Arguments $arguments -WorkingDirectory $Root -LogFile $log
    Write-LmPidFile (Join-Path $P.Pids "$PidName.pid") $process.Id
    Write-LmInfo "$Client 前端已启动（端口 $Port，PID $($process.Id)）"
}

try {
    if ((Test-LmRunning $Root) -and -not $Restart) {
        $studentUrl = "http://127.0.0.1:$($Config.ports.student)/student"
        Write-LmOk "寻笺已经在运行。"
        Write-Host "  学生端：$studentUrl"
        Write-Host "  教师端：http://127.0.0.1:$($Config.ports.teacher)/"
        if (-not $NoBrowser) { Start-Process $studentUrl | Out-Null }
        exit 0
    }
    if ($Restart) {
        Write-LmInfo "正在停止已运行的实例…"
        & (Join-Path $PSScriptRoot 'stop-learnmate.ps1') -Quiet
    }

    Stop-LmStragglers -Root $Root -IncludeDatabase $true -Quiet $true | Out-Null

    # 端口占用自动避让：config 里记的端口若被别人占了，就换一个空闲端口并写回配置
    $originalPorts = @($Config.ports.mysql, $Config.ports.backend, $Config.ports.student, $Config.ports.teacher)
    # 端口避让必须记住本轮已经分出去的端口：否则学生端避让到 8082 之后，教师端避让又可能挑中 8082，
    # 教师端静态服务会 EADDRINUSE 静默退出（现象是教师端页面打不开，还不容易看出原因）。
    $reservedPorts = New-Object System.Collections.Generic.List[int]
    foreach ($portName in @('mysql', 'backend', 'student', 'teacher')) {
        $preferred = [int]$Config.ports.$portName
        if (Test-LmPortOpen $preferred) {
            $picked = 0
            for ($i = 1; $i -le 200; $i++) {
                $probe = $preferred + $i
                if ($probe -gt 65535) { break }
                if ($reservedPorts -contains $probe) { continue }
                if (-not (Test-LmPortOpen $probe)) { $picked = $probe; break }
            }
            if ($picked -eq 0) { throw "端口 $preferred 起连续 200 个端口都被占用，请先释放端口或关闭占用程序。" }
            $Config.ports.$portName = $picked
        }
        $reservedPorts.Add([int]$Config.ports.$portName)
    }
    $nowPorts = @($Config.ports.mysql, $Config.ports.backend, $Config.ports.student, $Config.ports.teacher)
    if (($originalPorts -join ',') -ne ($nowPorts -join ',')) {
        Write-LmWarn "有端口被占用，已自动改用：数据库 $($Config.ports.mysql)、后端 $($Config.ports.backend)、学生端 $($Config.ports.student)、教师端 $($Config.ports.teacher)"
    }
    Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config

    # 老配置补一次云端功能配置（AI/判题），并在有必要时写回 config.json
    if (Update-LmConfigFromProfile -Root $Root -Config $Config) {
        Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config
    }

    $fresh = Start-LmMySql
    Initialize-LmDatabase -Fresh $fresh

    # 首次运行优先铺「与云端一致」的数据快照（数据库 + 存储文件）：
    # 有快照就不再走「建表 + 灌演示数据」流程，桌面版内容因此和云服务器一模一样
    $importedSnapshot = Import-LmSeedDatabase -Root $Root -Config $Config
    if ($importedSnapshot) {
        Initialize-LmSeedStorage -Root $Root | Out-Null
        $Config.seeded = $true
    }

    # 代码判题执行器：auto = 本机有 Docker 就用 docker，否则退回 disabled
    # 老 config.json（旧包生成的）里没有 codeExecution 字段，直接赋值会抛「找不到属性」，必须 Add-Member
    $resolvedCodeMode = Resolve-LmCodeExecutionMode ([string](Get-LmProp $Config 'codeExecution' 'auto')) $Root
    $Config | Add-Member -NotePropertyName codeExecution -NotePropertyValue $resolvedCodeMode -Force
    Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config

    Set-LmProcessEnv -Config $Config -Root $Root
    Write-LmEnvFile -Config $Config -Root $Root | Out-Null
    Start-LmBackend
    Start-LmWeb -Client 'student' -DistDir $P.WebStudent -Port ([int]$Config.ports.student) -PidName 'student'
    Start-LmWeb -Client 'teacher' -DistDir $P.WebTeacher -Port ([int]$Config.ports.teacher) -PidName 'teacher'

    # 两个静态服务都确认在监听：起不来时给出明确警告，避免"页面能开但其实只有一半"的假成功
    foreach ($web in @(
        @{ Name = '学生端'; Port = [int]$Config.ports.student; Log = (Join-Path $P.Logs 'student-web.log') },
        @{ Name = '教师端'; Port = [int]$Config.ports.teacher; Log = (Join-Path $P.Logs 'teacher-web.log') }
    )) {
        if (-not (Wait-LmPort -Port $web.Port -TimeoutSec 30)) {
            Write-LmWarn "$($web.Name)前端未在 30 秒内监听 $($web.Port)，详见 $($web.Log)"
        }
    }

    if (-not $Config.seeded) {
        Write-LmInfo "首次启动：正在建表并导入知识库与演示数据，通常需要 1~3 分钟，请勿关闭本窗口…"
    }
    $healthUrl = "http://127.0.0.1:$($Config.ports.backend)/api/health"
    if (-not (Wait-LmHttp -Url $healthUrl -TimeoutSec 420)) {
        throw "后端未在 7 分钟内就绪，请把 $(Join-Path $P.Logs 'backend.log') 发给开发者。"
    }
    if (-not $Config.seeded) {
        $Config.seeded = $true
        Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config
        Write-LmEnvFile -Config $Config -Root $Root | Out-Null
    }

    $studentUrl = "http://127.0.0.1:$($Config.ports.student)/student"
    $teacherUrl = "http://127.0.0.1:$($Config.ports.teacher)/"
    Write-Host ''
    Write-LmOk '寻笺 LearnMate 已就绪'
    Write-Host "  学生端：$studentUrl"
    Write-Host "  教师端：$teacherUrl"
    Write-Host "  演示账号：学生 zhangsan / 教师 teacher_demo   密码 $($Config.demoPassword)"
    Write-Host "  停止服务：双击「停止寻笺.bat」；日志目录：$($P.Logs)"
    Write-Host ''
    if (-not $NoBrowser) { Start-Process $studentUrl | Out-Null }
    if (-not $Quiet) {
        Write-Host '（本窗口可以关闭，后台服务会继续运行）' -ForegroundColor DarkGray
    }
    exit 0
} catch {
    Write-LmError $_.Exception.Message
    Write-Host ''
    Write-Host "启动失败。日志：$(Join-Path $P.Logs 'backend.log') / $(Join-Path $P.MySqlLogs 'mysql.log')" -ForegroundColor Yellow
    if (-not $Quiet) { Write-Host '按回车键关闭本窗口…' -ForegroundColor Yellow; [Console]::ReadLine() | Out-Null }
    exit 1
}
