# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 智课研伴 LearnMate — 停止后台服务
#
# 依次停掉学生端 / 教师端静态服务、后端进程，最后优雅关闭内置 MySQL。
# 数据库文件（data\mysql）与会话数据都会保留，下次启动直接续用。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-learnmate.ps1 [-Quiet]
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$Root = Get-LmRoot
$Config = Get-LmConfig $Root
$P = Get-LmPaths $Root
$quiet = [bool]$Quiet

if (-not $quiet) { Write-LmInfo '正在停止智课研伴…' }

$stopped = 0
foreach ($item in @(
    @{ Name = 'teacher'; Label = '教师端' },
    @{ Name = 'student'; Label = '学生端' },
    @{ Name = 'backend'; Label = '后端服务' }
)) {
    if (Stop-LmPidFile -PidPath (Join-Path $P.Pids "$($item.Name).pid") -Root $Root -Label $item.Label) { $stopped++ }
}

if (Stop-LmDatabase -Config $Config -Root $Root -Quiet $quiet) { $stopped++ }

# 兜底：清掉不在 PID 记录里的遗留进程
$extra = Stop-LmStragglers -Root $Root -IncludeDatabase $true -Quiet $quiet
if ($extra -gt 0) { $stopped += $extra }

# 确认端口已释放
$busy = @()
if ($Config) {
    foreach ($port in @([int]$Config.ports.student, [int]$Config.ports.teacher, [int]$Config.ports.backend, [int]$Config.ports.mysql)) {
        if (Test-LmPortOpen $port) { $busy += $port }
    }
}
if ($busy.Count -gt 0) {
    Write-LmWarn "以下端口仍被占用：$($busy -join ', ')（可能是别的程序，请自行确认）"
} elseif ($stopped -gt 0) {
    if (-not $quiet) { Write-LmOk '智课研伴已全部停止，数据库数据已保留。' }
} else {
    if (-not $quiet) { Write-LmInfo '当前没有正在运行的智课研伴服务。' }
}

if (-not $Quiet) {
    Write-Host ''
    Write-Host '（本窗口可以关闭）' -ForegroundColor DarkGray
}
exit 0
