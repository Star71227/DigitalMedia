# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 校验「桌面版 = 云服务器」：数据条数、真实账号、AI/执行器配置、两端页面
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\check-cloud-parity.ps1 `
#       -InstallDir "D:\tmp\lm-test" [-Expected "<cloud-snapshot>\cloud-stats.txt"]

param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [string]$Expected = ''
)

$ErrorActionPreference = 'Continue'
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$failures = New-Object System.Collections.Generic.List[string]
function Ok([string]$m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Bad([string]$m) { Write-Host "  [X] $m" -ForegroundColor Red; $failures.Add($m) }
function Note([string]$m) { Write-Host "  $m" -ForegroundColor DarkGray }

$configPath = Join-Path $InstallDir 'runtime\config.json'
$envPath = Join-Path $InstallDir '\.env'
$mysql = Join-Path $InstallDir 'runtime\mysql\bin\mysql.exe'
if (-not (Test-Path -LiteralPath $configPath)) { Bad "缺少 $configPath"; exit 1 }
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Query([string]$sql) {
    $previous = $env:MYSQL_PWD
    $env:MYSQL_PWD = [string]$config.db.rootPassword
    try {
        return (& $mysql '--no-defaults' '-h' '127.0.0.1' '-P' "$($config.ports.mysql)" '-u' 'root' '-N' '-B' '-e' $sql 2>$null) -join "`n"
    } finally {
        if ($null -eq $previous) { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $previous }
    }
}

Write-Host "`n=== 1/4 数据库内容（应与云端一致）===" -ForegroundColor Cyan
$users = (Query 'SELECT COUNT(*) FROM learnmate.users').Trim()
$resources = (Query 'SELECT COUNT(*) FROM learnmate.learning_resources').Trim()
$reports = (Query 'SELECT COUNT(*) FROM learnmate.learning_assessment_reports').Trim()
Note "本机：users=$users resources=$resources reports=$reports"

$expectedFile = $Expected
if (-not $expectedFile) {
    $candidate = Join-Path (Join-Path $PSScriptRoot '..\cloud-snapshot') 'cloud-stats.txt'
    if (Test-Path -LiteralPath $candidate) { $expectedFile = $candidate }
}
if ($expectedFile -and (Test-Path -LiteralPath $expectedFile)) {
    $expectedMap = @{}
    foreach ($line in (Get-Content -LiteralPath $expectedFile -Encoding UTF8)) {
        if ($line -match '^\s*([a-z_]+)\s*=\s*(\d+)\s*$') { $expectedMap[$Matches[1]] = [int]$Matches[2] }
    }
    Note "云端：$((Get-Content -LiteralPath $expectedFile -Encoding UTF8) -join ' ')"
    foreach ($pair in @(@{ k = 'users'; v = $users }, @{ k = 'resources'; v = $resources }, @{ k = 'reports'; v = $reports })) {
        if (-not $expectedMap.ContainsKey($pair.k)) { continue }
        if ([int]$pair.v -eq $expectedMap[$pair.k]) { Ok "$($pair.k) 与云端一致（$($pair.v)）" }
        else { Bad "$($pair.k) 与云端不一致：本机 $($pair.v) / 云端 $($expectedMap[$pair.k])" }
    }
} else {
    Note '（没有云端统计文件，跳过条数比对）'
}
if ([int]$users -lt 10) { Bad "用户数只有 $users，快照可能没导入" }

Write-Host "`n=== 2/4 真实账号是否都在 ===" -ForegroundColor Cyan
foreach ($account in @(
        @{ user = 'zhangsan'; label = '演示学生 zhangsan' },
        @{ user = 'lisi'; label = '演示学生 lisi' },
        @{ user = 'teacher_demo'; label = '演示教师 teacher_demo' },
        @{ user = '2511310430'; label = '张湛（2511310430）' },
        @{ user = 'Zhangruizhan'; label = '张泮（Zhangruizhan）' }
    )) {
    $hit = (Query "SELECT CONCAT(username, ' | ', display_name, ' | ', role) FROM learnmate.users WHERE username='$($account.user)'").Trim()
    if ($hit) { Ok "$($account.label)：$hit" } else { Bad "$($account.label) 不在库里" }
}

Write-Host "`n=== 3/4 功能配置（AI / 判题执行器）===" -ForegroundColor Cyan
$envText = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath -Raw -Encoding UTF8 } else { '' }
foreach ($key in @('AI_ENABLED', 'LLM_MODEL', 'CODE_EXECUTION_MODE', 'TEACHER_REGISTRATION_MODE')) {
    $match = [regex]::Match($envText, "(?m)^$key=(.*)$")
    if ($match.Success) {
        $value = $match.Groups[1].Value.Trim()
        if ($key -eq 'AI_ENABLED' -and $value -ne 'true') { Bad "AI_ENABLED=$value（云端为 true）" }
        else { Ok "$key=$value" }
    } else {
        Bad ".env 缺少 $key"
    }
}
if ($envText -match '(?m)^LLM_API_KEY=\S+') { Ok 'LLM_API_KEY 已配置（与云端同一把）' } else { Bad '.env 没有 LLM_API_KEY' }

Write-Host "`n=== 4/4 两端页面 ===" -ForegroundColor Cyan
foreach ($probe in @(
        @{ Label = '学生端'; Url = "http://127.0.0.1:$($config.ports.student)/student"; Expect = '智课研伴' },
        @{ Label = '教师端'; Url = "http://127.0.0.1:$($config.ports.teacher)/"; Expect = '教师端' }
    )) {
    try {
        $response = Invoke-WebRequest -Uri $probe.Url -UseBasicParsing -TimeoutSec 20
        if ($response.Content -match [regex]::Escape($probe.Expect)) { Ok "$($probe.Label) 200 且内容正确（$($probe.Url)）" }
        else { Bad "$($probe.Label) 内容特征不匹配" }
    } catch { Bad "$($probe.Label) 请求失败：$($_.Exception.Message)" }
}

Write-Host "`n=== 存储文件 ===" -ForegroundColor Cyan
$storage = Join-Path $InstallDir 'data\storage'
$fileCount = 0
if (Test-Path -LiteralPath $storage) { $fileCount = @(Get-ChildItem -LiteralPath $storage -Recurse -File -ErrorAction SilentlyContinue).Count }
if ($fileCount -gt 0) { Ok "data\storage 内有 $fileCount 个文件（资源/报告）" } else { Bad 'data\storage 是空的，快照里的资源文件没铺开' }

Write-Host ''
if ($failures.Count -eq 0) { Write-Host '桌面版与云端一致性校验通过 ✅' -ForegroundColor Green; exit 0 }
Write-Host "校验失败：$($failures.Count) 项" -ForegroundColor Red
$failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
exit 1
