# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 寻笺 LearnMate — 卸载
#
# 停止全部服务 → 删除桌面与开始菜单快捷方式 → 删除注册表卸载项 → 删除安装目录。
# 默认连数据库文件一起删除；加 -KeepData 可保留 data\ 目录（想留着账号数据时用）。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall.ps1 [-KeepData] [-Quiet]
param(
    [switch]$KeepData,
    [switch]$Quiet,
    [string]$InstallDir = '',
    [switch]$Detached
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $InstallDir) { $InstallDir = Get-LmRoot }
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path
$quiet = [bool]$Quiet
$keepData = [bool]$KeepData

function Remove-LmShortcuts {
    $targets = @(
        (Join-Path ([Environment]::GetFolderPath('Desktop')) '寻笺 LearnMate.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Desktop')) '停止寻笺.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Desktop')) '寻笺 使用说明.lnk')
    )
    foreach ($target in $targets) {
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
        }
    }
    $programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $folder = Join-Path $programs '寻笺 LearnMate'
    if (Test-Path -LiteralPath $folder) { Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath (Join-Path $programs '寻笺 LearnMate.lnk') -Force -ErrorAction SilentlyContinue
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LearnMate'
    if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue }
}

if (-not $Detached) {
    # 把「自己 + 公共函数」一起复制到临时目录再执行：
    # 1) 避免删除自己所在目录时脚本文件被占用；
    # 2) 脱离运行的那份也要能 dot-source 到 _common.ps1（它的 $PSScriptRoot 会变成临时目录）。
    $tempDir = Join-Path $env:TEMP ('learnmate-uninstall-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $temp = Join-Path $tempDir 'uninstall.ps1'
    Copy-Item -LiteralPath $PSCommandPath -Destination $temp -Force
    $commonSource = Join-Path $PSScriptRoot '_common.ps1'
    if (-not (Test-Path -LiteralPath $commonSource)) { throw "缺少公共函数文件：$commonSource" }
    Copy-Item -LiteralPath $commonSource -Destination (Join-Path $tempDir '_common.ps1') -Force
    $env:LEARNMATE_UNINSTALL_TEMP = $tempDir
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $temp, '-InstallDir', $InstallDir, '-Detached')
    if ($quiet) { $arguments += '-Quiet' }
    if ($keepData) { $arguments += '-KeepData' }
    $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Wait -PassThru
    if ($child.ExitCode -ne 0) { exit $child.ExitCode }
    exit 0
}

try {
    if (-not $quiet) { Write-LmInfo "正在卸载寻笺（$InstallDir）…" }
    $Config = Get-LmConfig $InstallDir
    $P = Get-LmPaths $InstallDir

    foreach ($item in @(
        @{ Name = 'teacher'; Label = '教师端' },
        @{ Name = 'student'; Label = '学生端' },
        @{ Name = 'backend'; Label = '后端服务' }
    )) {
        Stop-LmPidFile -PidPath (Join-Path $P.Pids "$($item.Name).pid") -Root $InstallDir -Label $item.Label | Out-Null
    }
    Stop-LmDatabase -Config $Config -Root $InstallDir -Quiet $quiet | Out-Null
    Stop-LmStragglers -Root $InstallDir -IncludeDatabase $true -Quiet $quiet | Out-Null

    Remove-LmShortcuts
    if (-not $quiet) { Write-LmInfo '快捷方式与卸载项已移除。' }

    if ($keepData) {
        $dataKeep = Join-Path $env:TEMP ('learnmate-data-' + (Get-Date).ToString('yyyyMMdd-HHmmss'))
        if (Test-Path -LiteralPath (Join-Path $InstallDir 'data')) {
            Write-LmInfo "保留数据目录到 $dataKeep"
            Move-Item -LiteralPath (Join-Path $InstallDir 'data') -Destination $dataKeep -Force
        }
    }

    # 路径含中文时，MySQL 运行时与数据目录被搬到了 %PUBLIC%\LearnMateRuntime\<hash>，一并清掉
    $mySqlHome = Get-LmMySqlHome $InstallDir
    if ($mySqlHome -and (Test-Path -LiteralPath $mySqlHome)) {
        Remove-Item -LiteralPath $mySqlHome -Recurse -Force -ErrorAction SilentlyContinue
        if (-not $quiet) { Write-LmInfo "已清理外置的数据库运行时：$mySqlHome" }
    }

    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try {
            Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction Stop
            break
        } catch {
            if ($attempt -eq 6) { throw }
            # 进程刚退出时文件偶尔还被占用，稍等重试
            Start-Sleep -Seconds 2
        }
    }
    if (Test-Path -LiteralPath $InstallDir) { throw "安装目录未能完全删除：$InstallDir" }
    if (-not $quiet) { Write-LmOk '寻笺已卸载完成。' }
} catch {
    Write-LmError $_.Exception.Message
    if (-not $quiet) { Write-Host '按回车键关闭…' -ForegroundColor Yellow; [Console]::ReadLine() | Out-Null }
    exit 1
}

if ($env:LEARNMATE_UNINSTALL_TEMP -and (Test-Path -LiteralPath $env:LEARNMATE_UNINSTALL_TEMP)) {
    Remove-Item -LiteralPath $env:LEARNMATE_UNINSTALL_TEMP -Recurse -Force -ErrorAction SilentlyContinue
}
exit 0
