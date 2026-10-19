# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 把本机数据库替换成安装包内置的「云端数据快照」（用于：装在已有数据的目录、或数据被灌成了演示数据时）
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\import-cloud-seed.ps1            # 交互确认
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\import-cloud-seed.ps1 -Force     # 桌面端菜单调用
param(
    [switch]$Force,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$Root = Get-LmRoot
$Config = Get-LmConfig $Root
if (-not $Config) { throw '还没有 runtime\config.json：请先启动一次「智课研伴」，再执行本脚本。' }

$dump = Get-LmSeedDatabasePath $Root
if (-not $dump) { throw '安装包里没有云端数据快照（seed\learnmate-cloud-db.sql）。' }

if (-not $Force) {
    Write-Host ''
    Write-LmWarn '这一步会把本机数据库整个替换成安装包内置的「云端数据快照」：'
    Write-Host '  · 本机现有的账号/班级/作业/资源/报告都会被云端那份替换掉'
    Write-Host '  · data\storage 里的资源与报告文件也会被快照覆盖'
    Write-Host '  · 想保留本机数据就先备份整个安装目录的 data 文件夹'
    Write-Host ''
    $answer = Read-Host '确认继续请输入 yes'
    if ($answer -ne 'yes') { Write-LmWarn '已取消，未做任何改动'; exit 1 }
}

Write-LmInfo '准备导入（先停掉正在运行的服务）…'
if (Test-LmRunning $Root) { & (Join-Path $PSScriptRoot 'stop-learnmate.ps1') -Quiet }
Stop-LmStragglers -Root $Root -IncludeDatabase $true -Quiet $true | Out-Null

Initialize-LmMySqlHome -Root $Root | Out-Null
$fresh = Start-LmMySqlStandalone -Root $Root -Config $Config
if ($fresh) { throw '本机数据库还是全新的：直接启动「智课研伴」，首启会自动导入快照。' }

$p = Get-LmPaths $Root
$name = [string]$Config.db.name
Write-LmInfo "清空并重建数据库 $name …"
$reset = Invoke-LmMySql -Root $Root -User 'root' -Password ([string]$Config.db.rootPassword) -Port ([int]$Config.ports.mysql) `
    -Sql "DROP DATABASE IF EXISTS ``$name``; CREATE DATABASE ``$name`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($reset.ExitCode -ne 0) { throw "重建数据库失败：$($reset.Output)" }

Import-LmSeedDatabase -Root $Root -Config $Config -Force | Out-Null
Initialize-LmSeedStorage -Root $Root -Force | Out-Null

$Config.seeded = $true
$Config | Add-Member -NotePropertyName snapshotImportedAt -NotePropertyValue ((Get-Date).ToString('s')) -Force
Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config

Write-LmInfo '收尾：停掉内置数据库（下次启动程序会重新拉起）…'
Stop-LmDatabase -Config $Config -Root $Root -Quiet $true | Out-Null
Stop-LmStragglers -Root $Root -IncludeDatabase $true -Quiet $true | Out-Null

$users = 0
Write-LmOk '云端数据已导入完成，重新打开「智课研伴」即可用云端账号登录。'
exit 0
