# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 「启用代码判题」助手：探测本机可用的执行器并写进配置
#   · Docker 引擎在跑：用 docker 模式（缺镜像时自动构建，和云端一致）
#   · 否则本机有 Visual Studio：用 local 模式（本机 cl.exe 编译运行）
#   · 都没有：明确告诉用户缺什么
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-code-judge.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-code-judge.ps1 -Restart
param(
    [switch]$Restart,
    [switch]$Quiet,
    [ValidateSet('auto', 'docker', 'local', 'disabled')][string]$Mode = 'auto'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$Root = Get-LmRoot
$Config = Get-LmConfig $Root -Create
$P = Get-LmPaths $Root
$imageTag = 'learnmate/code-runner-c:2.4a'
$contextDir = Join-Path $P.Backend 'docker\code-runner-c'

function Write-Line([string]$Text) { if (-not $Quiet) { Write-Host $Text } }

Write-Line '代码判题环境探测：'
$dockerEngine = Test-LmDockerEngine
$dockerImage = Test-LmCodeRunnerImage -ImageTag $imageTag
$vs = Find-LmVisualStudio
$bundled = Test-LmBundledCompiler $Root
Write-Line ("  随包 gcc              : " + $(if ($bundled) { $bundled } else { '缺失（安装包应带 runtime\cc）' }))
Write-Line ("  Docker 引擎           : " + $(if ($dockerEngine) { '可用' } else { '不可用（Docker Desktop 没装或没启动）' }))
Write-Line ("  判题镜像 $imageTag : " + $(if ($dockerImage) { '已就绪' } else { '未构建' }))
Write-Line ("  本机 Visual Studio    : " + $(if ($vs) { $vs } else { '未找到（local 模式需要 VS 的 cl.exe）' }))

$chosen = $Mode
if ($Mode -eq 'auto') {
    if ($dockerEngine -and $dockerImage) {
        $chosen = 'docker'
    } elseif ($dockerEngine -and (Test-Path -LiteralPath (Join-Path $contextDir 'Dockerfile'))) {
        Write-Line ''
        Write-Line 'Docker 在运行但判题镜像还没构建，开始构建（首次约 2~5 分钟，需要联网拉基础镜像）…'
        $previousEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & docker.exe build -t $imageTag $contextDir 2>&1 | Where-Object { -not $Quiet } | ForEach-Object { Write-Host "    $_" }
            $buildCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousEap
        }
        if ($buildCode -eq 0 -and (Test-LmCodeRunnerImage -ImageTag $imageTag)) {
            $chosen = 'docker'
            Write-Line '  镜像构建完成，使用 docker 执行器。'
        } else {
            Write-LmWarn "镜像构建失败（退出码 $buildCode），退回本机执行器。"
            $chosen = if ($vs) { 'local' } else { 'disabled' }
        }
    } elseif ($bundled -or $vs) {
        $chosen = 'local'
    } else {
        $chosen = 'disabled'
    }
}

switch ($chosen) {
    'docker' { Write-LmOk '判题执行器：docker（与云端一致）' }
    'local' { Write-LmOk '判题执行器：local（用本机 Visual Studio 编译运行学生代码）' }
    'disabled' {
        Write-LmWarn '暂时没有可用的判题执行器。安装其一即可：'
        Write-Host '  · 启动 Docker Desktop（并保留判题镜像 learnmate/code-runner-c:2.4a），或'
        Write-Host '  · 安装 Visual Studio 2022（勾选「使用 C++ 的桌面开发」）'
        Write-Host '然后重新运行本脚本（或菜单「服务 → 启用代码判题」）。'
    }
}

$Config | Add-Member -NotePropertyName codeExecution -NotePropertyValue $chosen -Force
Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config
Write-Line ''
Write-Line "已写入 runtime\config.json：codeExecution = $chosen"

if ($Restart) {
    Write-LmInfo '重启后台服务让设置生效…'
    & (Join-Path $PSScriptRoot 'start-learnmate.ps1') -NoBrowser -Quiet -Restart
}

if ($chosen -eq 'disabled') { exit 1 }
exit 0
