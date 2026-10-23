# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 寻笺 LearnMate 桌面版 — 安装包端到端验证
#
# 做四件事：静默安装到指定目录 → 检查文件齐全 → 启动桌面端并等后台服务就绪 → （可选）静默卸载
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\verify-installer.ps1 `
#       -InstallerPath "dist\寻笺-LearnMate-Setup-1.0.0.exe" -InstallDir "D:\tmp\lm-test" -Uninstall

param(
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [string]$InstallDir = (Join-Path $env:TEMP 'LearnMate-Desktop-Test'),
    [int]$StartupTimeoutSec = 480,
    [switch]$Uninstall,
    [switch]$KeepRunning
)

$ErrorActionPreference = 'Continue'  # 外置程序（taskkill 等）往 stderr 写东西时不至于中断脚本
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) { Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Write-Bad([string]$Message) { Write-Host "  [X] $Message" -ForegroundColor Red }
function Write-Note([string]$Message) { Write-Host "  $Message" -ForegroundColor DarkGray }

if (-not (Test-Path -LiteralPath $InstallerPath)) { throw "安装包不存在：$InstallerPath" }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$appExe = Join-Path $InstallDir 'LearnMate.exe'
$failures = New-Object System.Collections.Generic.List[string]

Write-Host "安装包：$InstallerPath" -ForegroundColor White
Write-Host "测试安装目录：$InstallDir" -ForegroundColor White

# ------------------------------------------------------------------ 干净起点
Write-Step '0/4 清理旧测试环境'
& taskkill.exe /IM LearnMate.exe /F /T *> $null
Start-Sleep -Milliseconds 500
if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Write-Ok '干净目录已就绪'

# ------------------------------------------------------------------ 静默安装
Write-Step '1/4 静默安装（/VERYSILENT）'
$installLog = Join-Path $env:TEMP 'learnmate-install.log'
$arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$InstallDir", "/LOG=$installLog")
$process = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -Wait -PassThru
Write-Note "安装程序退出码：$($process.ExitCode)"
if ($process.ExitCode -ne 0) { $failures.Add("安装退出码 $($process.ExitCode)") }

if (-not (Test-Path -LiteralPath $appExe)) {
    $failures.Add("没有装出主程序 $appExe")
    Write-Bad "缺少 $appExe"
} else {
    Write-Ok '主程序 LearnMate.exe 已就位'
}

$expected = @(
    'resources\app\main.js',
    'resources\app\pages\splash.html',
    'runtime\node\node.exe',
    'runtime\mysql\bin\mysqld.exe',
    'backend\src\index.js',
    'backend\node_modules\express\package.json',
    'web\student\index.html',
    'web\teacher\index.html',
    'scripts\start-learnmate.ps1',
    'scripts\stop-learnmate.ps1',
    'scripts\_common.ps1',
    'scripts\static-server.cjs',
    'LearnMate.ico',
    '使用说明.txt',
    'build-info.txt',
    'unins000.exe'
)
foreach ($relative in $expected) {
    $path = Join-Path $InstallDir $relative
    if (Test-Path -LiteralPath $path) { Write-Ok $relative }
    else { Write-Bad "缺少 $relative"; $failures.Add("缺少 $relative") }
}
$size = (Get-ChildItem -LiteralPath $InstallDir -Recurse -Force -File | Measure-Object Length -Sum).Sum
Write-Note ("安装后占用：" + ('{0:N0} MB' -f ($size / 1MB)))

# ------------------------------------------------------------------ 启动
Write-Step '2/4 启动桌面端并等待后台服务就绪'
$shellLog = Join-Path $InstallDir 'logs\desktop-shell.log'
$appProcess = Start-Process -FilePath $appExe -PassThru
Write-Note "LearnMate.exe PID $($appProcess.Id)"
$deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if (Test-Path -LiteralPath $shellLog) {
        $content = Get-Content -LiteralPath $shellLog -Raw -Encoding UTF8
        if ($content -match 'services ready') { $ready = $true; break }
    }
    if ($appProcess.HasExited) { break }
}
if ($ready) { Write-Ok '桌面外壳已连上后台服务（日志出现 services ready）' }
else { $failures.Add('等待后台服务就绪超时'); Write-Bad '等待超时，看 logs\desktop-shell.log' }

$configPath = Join-Path $InstallDir 'runtime\config.json'
if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Note "端口：mysql $($config.ports.mysql) / backend $($config.ports.backend) / student $($config.ports.student) / teacher $($config.ports.teacher)"
    Write-Note "已灌演示数据：$($config.seeded)"
    $studentUrl = "http://127.0.0.1:$($config.ports.student)/student"
    $teacherUrl = "http://127.0.0.1:$($config.ports.teacher)/"
    $healthUrl = "http://127.0.0.1:$($config.ports.backend)/api/health"

    Write-Step '3/4 接口自检'
    foreach ($probe in @(
            @{ Url = $healthUrl; Label = '后端 /api/health' },
            @{ Url = $studentUrl; Label = '学生端页面' },
            @{ Url = $teacherUrl; Label = '教师端页面' }
        )) {
        try {
            $response = Invoke-WebRequest -Uri $probe.Url -UseBasicParsing -TimeoutSec 20
            if ($response.StatusCode -eq 200) { Write-Ok "$($probe.Label) 200（$($probe.Url)）" }
            else { Write-Bad "$($probe.Label) $($response.StatusCode)"; $failures.Add("$($probe.Label) 返回 $($response.StatusCode)") }
        } catch {
            Write-Bad "$($probe.Label) 请求失败：$($_.Exception.Message)"
            $failures.Add("$($probe.Label) 请求失败")
        }
    }
} else {
    $failures.Add('没有生成 runtime\config.json')
    Write-Bad '缺少 runtime\config.json'
}

# ------------------------------------------------------------------ 收尾
if (-not $KeepRunning) {
    Write-Step '4/4 关闭桌面端（验证退出时是否停掉后台服务）'
    & taskkill.exe /IM LearnMate.exe /F /T *> $null
    Start-Sleep -Seconds 12
    $leftover = @()
    foreach ($name in @('mysqld', 'node')) {
        foreach ($p in (Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            try { if ($p.Path -and $p.Path.StartsWith($InstallDir, [System.StringComparison]::OrdinalIgnoreCase)) { $leftover += $p } } catch { }
        }
    }
    if ($leftover.Count -eq 0) { Write-Ok '后台服务已随程序退出而停止' }
    else { Write-Bad "仍有 $($leftover.Count) 个残留进程"; $leftover | ForEach-Object { Write-Note "$($_.ProcessName) PID $($_.Id)" } }
}

if ($Uninstall) {
    Write-Step '卸载测试'
    $uninstaller = Join-Path $InstallDir 'unins000.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $p = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
        Start-Sleep -Seconds 6
        if (Test-Path -LiteralPath $appExe) { Write-Bad '卸载后主程序仍然存在'; $failures.Add('卸载不干净') }
        else { Write-Ok '卸载完成，主程序已删除' }
        $rest = @()
        if (Test-Path -LiteralPath $InstallDir) { $rest = Get-ChildItem -LiteralPath $InstallDir -Force -Recurse -ErrorAction SilentlyContinue }
        if ($rest.Count -eq 0) { Write-Ok '安装目录已清空' } else { Write-Note "安装目录残留 $($rest.Count) 项" }
    } else {
        Write-Bad '找不到 unins000.exe'; $failures.Add('缺少卸载程序')
    }
}

Write-Host ''
if ($failures.Count -eq 0) {
    Write-Host '验证通过 ✅' -ForegroundColor Green
    exit 0
}
Write-Host "验证发现问题：$($failures.Count) 项" -ForegroundColor Red
$failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
exit 1
