# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 智课研伴 LearnMate — 配置 AI 助手（可选）
#
# 安装包里默认关闭 AI（界面会提示「模型未配置」，其余功能都能正常用）。
# 想让 AI 助手 / 个性化组卷 / 资源生成走真实大模型时，运行本脚本填入
# 任意「OpenAI 兼容」接口即可，例如：
#   讯飞星火  https://spark-api-open.xf-yun.com/v1/chat/completions   模型 lite / generalv3.5
#   DeepSeek  https://api.deepseek.com/v1/chat/completions           模型 deepseek-chat
#   本地 Ollama  http://127.0.0.1:11434/v1/chat/completions          模型 qwen2.5:7b
#
# 用法（交互式）：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\configure-ai.ps1
# 用法（命令行）：... -File scripts\configure-ai.ps1 -Enable -BaseUrl <url> -Model <name> -ApiKey <key>
#                （-Disable 关闭 AI）
param(
    [switch]$Enable,
    [switch]$Disable,
    [string]$BaseUrl = '',
    [string]$Model = '',
    [string]$ApiKey = '',
    [switch]$Restart,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$Root = Get-LmRoot
$Config = Get-LmConfig $Root -Create
$interactive = -not ($Enable -or $Disable)

if ($interactive) {
    Write-Host ''
    Write-LmInfo '配置 AI 助手（直接回车表示保持当前值）'
    $current = '关闭'
    if ($Config.ai -and $Config.ai.enabled) { $current = '开启' }
    Write-Host "  当前状态：$current"
    $answer = Read-Host '  是否启用 AI 助手？(y/N)'
    if ($answer -match '^(y|Y|yes|YES|是)$') {
        $Enable = $true
    } else {
        $Disable = $true
    }
    if ($Enable) {
        $default = Get-LmProp $Config.ai 'baseUrl' 'https://spark-api-open.xf-yun.com/v1/chat/completions'
        $input1 = Read-Host "  API 地址 [$default]"
        if ($input1) { $BaseUrl = $input1 } else { $BaseUrl = $default }
        $defaultModel = Get-LmProp $Config.ai 'model' 'lite'
        $input2 = Read-Host "  模型名 [$defaultModel]"
        if ($input2) { $Model = $input2 } else { $Model = $defaultModel }
        $secure = Read-Host '  API Key（输入时不显示）' -AsSecureString
        $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        if ($plain) { $ApiKey = $plain }
        if (-not $ApiKey) { $ApiKey = [string](Get-LmProp $Config.ai 'apiKey' '') }
        if (-not $ApiKey) { Write-LmWarn '没有填写 API Key，AI 仍然不可用。' }
    }
}

if ($Disable) {
    $config.ai.enabled = $false
    $config.ai.baseUrl = ''
    $config.ai.model = ''
    $config.ai.apiKey = ''
    Write-LmOk '已关闭 AI 助手（其余功能不受影响）。'
} else {
    $Config.ai.enabled = $true
    $Config.ai.baseUrl = $BaseUrl
    $Config.ai.model = $Model
    $Config.ai.apiKey = $ApiKey
    if (-not $Config.ai.baseUrl) { throw 'API 地址不能为空。' }
    Write-LmOk "已配置 AI 助手：$($Config.ai.baseUrl)（模型 $($Config.ai.model)）"
}
Write-LmJson -Path (Get-LmConfigPath $Root) -Object $Config
Write-LmEnvFile -Config $Config -Root $Root | Out-Null

$running = Test-LmRunning $Root
$shouldRestart = $false
if ($running) {
    if ($Restart) {
        $shouldRestart = $true
    } elseif ($interactive) {
        $answer = Read-Host '  服务正在运行，是否立即重启使其生效？(Y/n)'
        if (-not ($answer -match '^(n|N|no|NO|否)$')) { $shouldRestart = $true }
    } else {
        Write-LmWarn '服务正在运行，重启后生效：先双击「停止智课研伴.bat」，再双击「一键启动智课研伴.bat」。'
    }
}
if ($shouldRestart) {
    & (Join-Path $PSScriptRoot 'stop-learnmate.ps1') -Quiet
    & (Join-Path $PSScriptRoot 'start-learnmate.ps1') -NoBrowser -Quiet
}
if (-not $Quiet -and $interactive) {
    Write-Host ''
    Write-Host '按回车键关闭本窗口…' -ForegroundColor DarkGray
    [Console]::ReadLine() | Out-Null
}
exit 0
