# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 智课研伴 LearnMate — 已安装实例自检（端口 + 页面内容）
#
# 为什么单独有这个脚本：两个静态服务对任何路径都会回退到 index.html，
# 所以"教师端 URL 返回 200"并不代表教师端真的起来了（可能只是学生端在应答）。
# 这里按 runtime\config.json 的端口逐个探测，并校验页面内容特征。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\check-app-ports.ps1 `
#       -InstallDir "D:\demo-deepseeek_harness\.tmp\lm-desktop-test"

param(
    [Parameter(Mandatory = $true)][string]$InstallDir
)

$ErrorActionPreference = 'Continue'
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$configPath = Join-Path $InstallDir 'runtime\config.json'
if (-not (Test-Path -LiteralPath $configPath)) { Write-Host "缺少 $configPath" -ForegroundColor Red; exit 1 }

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$ports = @{
    mysql   = [int]$config.ports.mysql
    backend = [int]$config.ports.backend
    student = [int]$config.ports.student
    teacher = [int]$config.ports.teacher
}
Write-Host "端口配置：mysql $($ports.mysql) / backend $($ports.backend) / student $($ports.student) / teacher $($ports.teacher)"

$failures = New-Object System.Collections.Generic.List[string]

# 1) 四个端口必须互不相同（否则后起的服务会 EADDRINUSE 静默退出）
$unique = ($ports.Values | Select-Object -Unique).Count
if ($unique -ne 4) {
    Write-Host '  [X] 四个端口出现重复：学生端/教师端会互相抢占，其中一个必然起不来' -ForegroundColor Red
    $failures.Add('端口重复')
} else {
    Write-Host '  [OK] 四个端口互不重复' -ForegroundColor Green
}

# 2) 每个端口都要真的在监听
foreach ($name in @('mysql', 'backend', 'student', 'teacher')) {
    $listening = $false
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect('127.0.0.1', $ports[$name], $null, $null)
        if ($async.AsyncWaitHandle.WaitOne(1500)) { $client.EndConnect($async); $listening = $true }
        $client.Close()
    } catch { $listening = $false }
    if ($listening) { Write-Host "  [OK] $name 端口 $($ports[$name]) 正在监听" -ForegroundColor Green }
    else { Write-Host "  [X] $name 端口 $($ports[$name]) 没有监听" -ForegroundColor Red; $failures.Add("$name 端口未监听") }
}

# 3) 页面内容特征（学生端 index.html 标题含「智课研伴」，教师端含「教师端」）
$probes = @(
    @{ Label = '学生端'; Url = "http://127.0.0.1:$($ports.student)/student"; Expect = '智课研伴' },
    @{ Label = '教师端'; Url = "http://127.0.0.1:$($ports.teacher)/"; Expect = '教师端' },
    @{ Label = '后端健康检查'; Url = "http://127.0.0.1:$($ports.backend)/api/health"; Expect = '' }
)
foreach ($probe in $probes) {
    try {
        $response = Invoke-WebRequest -Uri $probe.Url -UseBasicParsing -TimeoutSec 20
        if ($response.StatusCode -ne 200) {
            Write-Host "  [X] $($probe.Label) 返回 $($response.StatusCode)" -ForegroundColor Red
            $failures.Add("$($probe.Label) 返回 $($response.StatusCode)")
            continue
        }
        if ($probe.Expect -and ($response.Content -notmatch [regex]::Escape($probe.Expect))) {
            Write-Host "  [X] $($probe.Label) 响应里没有「$($probe.Expect)」特征，可能被别的服务应答了" -ForegroundColor Red
            $failures.Add("$($probe.Label) 内容特征不匹配")
            continue
        }
        Write-Host "  [OK] $($probe.Label) 200 $($probe.Url)" -ForegroundColor Green
    } catch {
        Write-Host "  [X] $($probe.Label) 请求失败：$($_.Exception.Message)" -ForegroundColor Red
        $failures.Add("$($probe.Label) 请求失败")
    }
}

if ($failures.Count -eq 0) { Write-Host "`n实例自检通过 ✅" -ForegroundColor Green; exit 0 }
Write-Host "`n实例自检失败：$($failures.Count) 项" -ForegroundColor Red
$failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
exit 1
