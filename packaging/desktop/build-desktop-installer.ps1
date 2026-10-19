# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 智课研伴 LearnMate — 一键打出 Windows 桌面版安装包（Inno Setup）
#
# 产物：<仓库>\dist\智课研伴-LearnMate-Setup-<版本>.exe
# 组成：Electron 桌面外壳 + 内置 Node 运行时 + 内置 MySQL 运行时 + 后端 + 学生端/教师端网页产物
#
# 用法（在 PowerShell 里）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\build-desktop-installer.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\build-desktop-installer.ps1 -Version 1.0.1 -RemovePayload
#
# 常用参数：
#   -Version <x.y.z>        安装包版本号（默认 1.0.0）
#   -RepoRoot <路径>        项目根目录（默认自动取 packaging 的上一级）
#   -RuntimeSource <路径>   已装好的运行环境来源（默认 %LOCALAPPDATA%\Programs\LearnMate）
#   -SkipFrontendBuild      跳过前端重新构建（直接用 frontend-*/dist 里现有产物）
#   -SkipElectronInstall    跳过 Electron 下载（要求 build\node_modules\electron\dist 已存在）
#   -RemovePayload          打完包后删掉 dist\_payload 暂存目录（省 ~600MB 磁盘）

param(
    [string]$Version = '1.0.0',
    [string]$RepoRoot = '',
    [string]$RuntimeSource = '',
    [switch]$SkipFrontendBuild,
    [switch]$SkipElectronInstall,
    [switch]$RemovePayload
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) { Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Write-Note([string]$Message) { Write-Host "  $Message" -ForegroundColor DarkGray }
function Write-Warn2([string]$Message) { Write-Host "  [!] $Message" -ForegroundColor Yellow }

function Format-Size([double]$Bytes) {
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    return ('{0:N1} MB' -f ($Bytes / 1MB))
}

function Get-DirSize([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    return (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
}

function Invoke-Robocopy([string]$Source, [string]$Destination, [string[]]$Extra = @()) {
    # robocopy 退出码 0~7 都算成功
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $arguments = @($Source, $Destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1') + $Extra
        & robocopy.exe @arguments | Out-Null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
        $global:LASTEXITCODE = 0
    }
    if ($code -ge 8) { throw "robocopy 失败（$code）：$Source -> $Destination" }
}

function Invoke-Native([scriptblock]$Block) {
    # 外置程序往 stderr 写东西时，PS 5.1 在 ErrorActionPreference=Stop 下会把它当致命错误
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Block } finally { $ErrorActionPreference = $previous }
}

$packagingDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $packagingDir '..\..')).Path }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not $RuntimeSource) { $RuntimeSource = Join-Path $env:LOCALAPPDATA 'Programs\LearnMate' }
if (-not (Test-Path -LiteralPath $RuntimeSource)) {
    throw "找不到运行环境来源 $RuntimeSource（需要里面有 runtime\node、runtime\mysql、backend\node_modules、scripts）"
}
$RuntimeSource = (Resolve-Path -LiteralPath $RuntimeSource).Path

$appTemplateDir = Join-Path $packagingDir 'app-template'
$scriptsSource = Join-Path $appTemplateDir 'scripts'
$iconSource = Join-Path $appTemplateDir 'LearnMate.ico'
# 仓库内的 app-template 是运行脚本的"事实源"（可打补丁、可入版本库）；缺失时退回已装环境
if (-not (Test-Path -LiteralPath $scriptsSource)) { $scriptsSource = Join-Path $RuntimeSource 'scripts' }
if (-not (Test-Path -LiteralPath $iconSource)) { $iconSource = Join-Path $RuntimeSource 'LearnMate.ico' }

$distRoot = Join-Path $RepoRoot 'dist'
$payloadDir = Join-Path $distRoot '_payload'
$buildDir = Join-Path $distRoot '_build'
$electronDist = Join-Path $packagingDir 'build\node_modules\electron\dist'
$shellDir = Join-Path $packagingDir 'shell'
$assetsDir = Join-Path $packagingDir 'assets'
$issSource = Join-Path $packagingDir 'installer.iss'
$outputBase = "智课研伴-LearnMate-Setup-$Version"
$outputExe = Join-Path $distRoot "$outputBase.exe"

Write-Host "智课研伴 LearnMate 桌面版打包" -ForegroundColor White
Write-Note "版本：$Version"
Write-Note "项目根目录：$RepoRoot"
Write-Note "运行环境来源：$RuntimeSource"
Write-Note "安装包输出：$outputExe"

# ---------------------------------------------------------------- 1. 前置检查
Write-Step '1/7 检查打包素材'
$required = @(
    @{ Path = (Join-Path $RuntimeSource 'runtime\node\node.exe'); Label = '内置 Node 运行时' },
    @{ Path = (Join-Path $RuntimeSource 'runtime\mysql\bin\mysqld.exe'); Label = '内置 MySQL 运行时' },
    @{ Path = (Join-Path $RuntimeSource 'backend\node_modules'); Label = '后端依赖 node_modules' },
    @{ Path = (Join-Path $scriptsSource 'start-learnmate.ps1'); Label = '启动脚本' },
    @{ Path = (Join-Path $scriptsSource 'stop-learnmate.ps1'); Label = '停止脚本' },
    @{ Path = (Join-Path $scriptsSource 'static-server.cjs'); Label = '本地静态服务' },
    @{ Path = $iconSource; Label = '程序图标' },
    @{ Path = (Join-Path $RepoRoot 'backend\src'); Label = '后端源码' },
    @{ Path = (Join-Path $RepoRoot 'frontend-new'); Label = '学生端源码' },
    @{ Path = (Join-Path $RepoRoot 'frontend-teacher'); Label = '教师端源码' }
)
foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath $item.Path)) { throw "缺少$($item.Label)：$($item.Path)" }
    Write-Ok "$($item.Label) ✓"
}

# ------------------------------------------------------------ 2. 前端构建产物
Write-Step '2/7 准备学生端 / 教师端网页产物'
$studentDist = Join-Path $RepoRoot 'frontend-new\dist'
$teacherDist = Join-Path $RepoRoot 'frontend-teacher\dist'

if (-not $SkipFrontendBuild) {
    Write-Note '重新构建学生端（npm run build）…'
    $studentBuild = Invoke-Native { & npm.cmd --prefix (Join-Path $RepoRoot 'frontend-new') run build 2>&1 }
    $studentCode = $LASTEXITCODE
    $studentBuild | Select-Object -Last 6 | ForEach-Object { Write-Note $_ }
    if ($studentCode -ne 0) { throw "学生端构建失败（退出码 $studentCode）" }
    Write-Note '重新构建教师端（npm run build）…'
    $teacherBuild = Invoke-Native { & npm.cmd --prefix (Join-Path $RepoRoot 'frontend-teacher') run build 2>&1 }
    $teacherCode = $LASTEXITCODE
    $teacherBuild | Select-Object -Last 6 | ForEach-Object { Write-Note $_ }
    if ($teacherCode -ne 0) { throw "教师端构建失败（退出码 $teacherCode）" }
    $global:LASTEXITCODE = 0
} else {
    Write-Warn2 '已跳过前端构建，直接使用现有 dist 产物'
}
foreach ($pair in @(@{ Path = $studentDist; Label = '学生端' }, @{ Path = $teacherDist; Label = '教师端' })) {
    if (-not (Test-Path -LiteralPath (Join-Path $pair.Path 'index.html'))) {
        throw "$($pair.Label) 缺少构建产物：$($pair.Path)\index.html（去掉 -SkipFrontendBuild 重新构建）"
    }
    Write-Ok "$($pair.Label) 产物 $(Format-Size (Get-DirSize $pair.Path))"
}

# --------------------------------------------------------------- 3. Electron
Write-Step '3/7 准备 Electron 桌面外壳运行时'
$electronExe = Join-Path $electronDist 'electron.exe'
if (-not (Test-Path -LiteralPath $electronExe)) {
    if ($SkipElectronInstall) { throw "Electron 运行时不存在：$electronExe" }
    Write-Note '下载 Electron（国内镜像 npmmirror）…'
    $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
    $env:npm_config_registry = 'https://registry.npmmirror.com'
    Push-Location (Join-Path $packagingDir 'build')
    try {
        Invoke-Native { & npm.cmd install --no-audit --no-fund 2>&1 } | Select-Object -Last 8 | ForEach-Object { Write-Note $_ }
        if (-not (Test-Path -LiteralPath $electronExe)) { throw 'Electron 下载后仍找不到 electron.exe' }
    } finally { Pop-Location }
    $global:LASTEXITCODE = 0
}
Write-Ok ("Electron 运行时 " + (Format-Size (Get-DirSize $electronDist)))

# ------------------------------------------------------------ 4. 组装 payload
Write-Step '4/7 组装安装包内容（payload）'
if (Test-Path -LiteralPath $payloadDir) { Remove-Item -LiteralPath $payloadDir -Recurse -Force }
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
if (Test-Path -LiteralPath $buildDir) { Remove-Item -LiteralPath $buildDir -Recurse -Force }
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

Write-Note 'Electron 运行时 → 根目录'
Invoke-Robocopy $electronDist $payloadDir

# 语言包只留中英文，省掉 50 多个用不到的 pak
$localesDir = Join-Path $payloadDir 'locales'
if (Test-Path -LiteralPath $localesDir) {
    Get-ChildItem -LiteralPath $localesDir -File | Where-Object { $_.Name -notin @('zh-CN.pak', 'en-US.pak') } |
        Remove-Item -Force -ErrorAction SilentlyContinue
}
# electron.exe 改名成 LearnMate.exe（Electron 允许改主程序名）
Move-Item -LiteralPath (Join-Path $payloadDir 'electron.exe') -Destination (Join-Path $payloadDir 'LearnMate.exe') -Force

Write-Note '桌面外壳源码 → resources\app'
$appDir = Join-Path $payloadDir 'resources\app'
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Invoke-Robocopy $shellDir $appDir @('/XD', (Join-Path $shellDir 'node_modules'))

Write-Note '内置 Node 运行时 → runtime\node'
Invoke-Robocopy (Join-Path $RuntimeSource 'runtime\node') (Join-Path $payloadDir 'runtime\node')

Write-Note '内置 MySQL 运行时 → runtime\mysql（约 98MB，需要一点时间）'
Invoke-Robocopy (Join-Path $RuntimeSource 'runtime\mysql') (Join-Path $payloadDir 'runtime\mysql')

Write-Note '随包 C 编译器（代码判题用，任何电脑都不依赖 Docker/VS）→ runtime\cc'
$compilerDir = Join-Path $packagingDir 'compiler'
if (-not (Test-Path -LiteralPath (Join-Path $compilerDir 'bin\gcc.exe'))) {
    Write-Note '本地还没有裁剪好的编译器，先运行 tools\fetch-compiler.ps1 获取（首次约 1~3 分钟）…'
    & (Join-Path $packagingDir 'tools\fetch-compiler.ps1')
}
if (-not (Test-Path -LiteralPath (Join-Path $compilerDir 'bin\gcc.exe'))) { throw "随包编译器不可用：$compilerDir" }
Invoke-Robocopy $compilerDir (Join-Path $payloadDir 'runtime\cc')
Write-Ok ("随包编译器 " + (Format-Size (Get-DirSize (Join-Path $payloadDir 'runtime\cc'))))

Write-Note '后端：依赖用已装好的生产依赖，源码/数据用仓库最新版本覆盖'
$backendTarget = Join-Path $payloadDir 'backend'
Invoke-Robocopy (Join-Path $RuntimeSource 'backend') $backendTarget
foreach ($sub in @('src', 'scripts', 'data', 'docker')) {   # docker\ = 判题镜像构建上下文
    $source = Join-Path $RepoRoot "backend\$sub"
    if (Test-Path -LiteralPath $source) { Invoke-Robocopy $source (Join-Path $backendTarget $sub) }
}
Copy-Item -LiteralPath (Join-Path $RepoRoot 'backend\package.json') -Destination (Join-Path $backendTarget 'package.json') -Force
Copy-Item -LiteralPath (Join-Path $RepoRoot 'backend\package-lock.json') -Destination (Join-Path $backendTarget 'package-lock.json') -Force

Write-Note '网页产物 → web\student、web\teacher'
Invoke-Robocopy $studentDist (Join-Path $payloadDir 'web\student')
Invoke-Robocopy $teacherDist (Join-Path $payloadDir 'web\teacher')

Write-Note '运行脚本 → scripts'
Invoke-Robocopy $scriptsSource (Join-Path $payloadDir 'scripts')

Write-Note '图标 / 说明 / 快捷脚本'
Copy-Item -LiteralPath $iconSource -Destination (Join-Path $payloadDir 'LearnMate.ico') -Force
Copy-Item -LiteralPath (Join-Path $assetsDir '使用说明.txt') -Destination (Join-Path $payloadDir '使用说明.txt') -Force
Copy-Item -LiteralPath (Join-Path $assetsDir '停止智课研伴.bat') -Destination (Join-Path $payloadDir '停止智课研伴.bat') -Force
$judgeBat = Join-Path $appTemplateDir '启用代码判题.bat'
if (Test-Path -LiteralPath $judgeBat) {
    Copy-Item -LiteralPath $judgeBat -Destination (Join-Path $payloadDir '启用代码判题.bat') -Force
}
$importBat = Join-Path $appTemplateDir '导入云端数据.bat'
if (Test-Path -LiteralPath $importBat) {
    Copy-Item -LiteralPath $importBat -Destination (Join-Path $payloadDir '导入云端数据.bat') -Force
}
$configureBat = Join-Path $appTemplateDir '配置AI模型.bat'
if (Test-Path -LiteralPath $configureBat) {
    Copy-Item -LiteralPath $configureBat -Destination (Join-Path $payloadDir '配置AI模型.bat') -Force
}

$gitCommit = ''
try { $gitCommit = (& git -C $RepoRoot rev-parse --short HEAD) 2>$null } catch { }
if (-not $gitCommit) { $gitCommit = 'unknown' }
$buildInfo = @(
    "package   : 智课研伴 LearnMate $Version（桌面版）",
    "builtAt   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
    "gitCommit : $gitCommit",
    "machine   : $env:COMPUTERNAME",
    "components: electron $(Get-Content (Join-Path $electronDist 'version') -Raw -ErrorAction SilentlyContinue | ForEach-Object { $_.Trim() }) / bundled node / bundled mysql / backend / web(student+teacher)"
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText((Join-Path $payloadDir 'build-info.txt'), $buildInfo, (New-Object System.Text.UTF8Encoding($false)))

# 云端数据快照 → seed\（数据库 + 存储文件 + 功能配置），让桌面版的内容与云服务器一致
$snapshotDir = Join-Path $packagingDir 'cloud-snapshot'
$seedDir = Join-Path $payloadDir 'seed'
if (Test-Path -LiteralPath (Join-Path $snapshotDir 'learnmate-cloud-db.sql.gz')) {
    Write-Note '云端数据快照 → seed（数据库 + 存储 + 功能配置）'
    if (Test-Path -LiteralPath $seedDir) { Remove-Item -LiteralPath $seedDir -Recurse -Force }
    New-Item -ItemType Directory -Path $seedDir -Force | Out-Null

    # 1) 数据库：解压成 .sql，首启导入时就不需要任何解压工具
    $dumpGz = Join-Path $snapshotDir 'learnmate-cloud-db.sql.gz'
    $dumpSql = Join-Path $seedDir 'learnmate-cloud-db.sql'
    $inStream = [System.IO.File]::OpenRead($dumpGz)
    try {
        $outStream = [System.IO.File]::Create($dumpSql)
        try {
            $gzip = New-Object System.IO.Compression.GzipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
            try { $gzip.CopyTo($outStream) } finally { $gzip.Dispose() }
        } finally { $outStream.Dispose() }
    } finally { $inStream.Dispose() }
    Write-Ok "数据库快照 seed\learnmate-cloud-db.sql $(Format-Size (Get-Item $dumpSql).Length)"

    # 2) 存储文件（资源 / 报告）
    $storageTar = Join-Path $snapshotDir 'learnmate-cloud-storage.tar.gz'
    if (Test-Path -LiteralPath $storageTar) {
        $storageTarget = Join-Path $seedDir 'storage'
        New-Item -ItemType Directory -Path $storageTarget -Force | Out-Null
        Invoke-Native { & tar.exe -xzf $storageTar -C $storageTarget }
        if ($LASTEXITCODE -ne 0) { throw "解包存储快照失败（tar 退出码 $LASTEXITCODE）" }
        $global:LASTEXITCODE = 0
        Write-Ok "存储快照 seed\storage $(Format-Size (Get-DirSize $storageTarget))"
    }

    # 3) 功能配置模板：从云端 .env 里挑出与功能有关、且不含本机机密（数据库口令/端口/JWT）的键
    $cloudEnv = Join-Path $snapshotDir 'learnmate-cloud.env'
    if (Test-Path -LiteralPath $cloudEnv) {
        $keep = '^(AI_ENABLED|PATH_PLANNER_AI_ENABLED|MULTIMODAL_[A-Z_]+|LLM_[A-Z_]+|SPARK_[A-Z_]+|WEB_SEARCH_[A-Z_]+|TEACHER_REGISTRATION_MODE|DEMO_PASSWORD|CODE_EXECUTION_MODE)='
        $picked = @(Get-Content -LiteralPath $cloudEnv -Encoding UTF8 | Where-Object { $_ -match $keep })
        $header = '# 云端功能配置（打包时从云端 .env 摘出，用于让桌面版功能与云端一致；不含数据库口令/端口等本机机密）'
        $profileText = (($header, ($picked -join [Environment]::NewLine)) -join [Environment]::NewLine) + [Environment]::NewLine
        [System.IO.File]::WriteAllText((Join-Path $seedDir 'cloud.env'), $profileText, (New-Object System.Text.UTF8Encoding($false)))
        Write-Ok "功能配置 seed\cloud.env（$($picked.Count) 项）"
    } else {
        Write-Warn2 '没有 cloud-snapshot\learnmate-cloud.env，桌面版将沿用默认（AI 关闭）配置'
    }

    $info = @(
        "source    : 云服务器 111.230.111.94:9080（打包时导出）",
        "exportedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "database  : learnmate-cloud-db.sql（完整库结构与数据，含全部真实账号）",
        "storage   : storage\（资源文件与报告文件）",
        "profile   : cloud.env（云端功能开关与大模型配置）"
    ) -join [Environment]::NewLine
    [System.IO.File]::WriteAllText((Join-Path $seedDir 'snapshot-info.txt'), $info, (New-Object System.Text.UTF8Encoding($false)))
} else {
    Write-Warn2 '没有 cloud-snapshot\learnmate-cloud-db.sql.gz：安装包将退回“首启灌演示数据”模式（不含真实账号）'
}

$payloadSize = Get-DirSize $payloadDir
Write-Ok "payload 组装完成：$(Format-Size $payloadSize)"

# ------------------------------------------------------------------ 5. ISCC
Write-Step '5/7 定位 Inno Setup 编译器'
$iscc = $null
foreach ($candidate in @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
)) { if (Test-Path -LiteralPath $candidate) { $iscc = $candidate; break } }
if (-not $iscc) {
    $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($cmd) { $iscc = $cmd.Source }
}
if (-not $iscc) {
    Write-Warn2 '未找到 ISCC.exe，尝试自动安装 Inno Setup…'
    & (Join-Path $packagingDir 'tools\get-innosetup.ps1')
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
    )) { if (Test-Path -LiteralPath $candidate) { $iscc = $candidate; break } }
}
if (-not $iscc) { throw '没有 Inno Setup 编译器（ISCC.exe），请先运行 packaging\desktop\tools\get-innosetup.ps1' }
Write-Ok "ISCC：$iscc"

# 中文语言包（官方仓库里的非官方翻译，失败就退回英文向导）
$langFile = Join-Path $packagingDir 'tools\ChineseSimplified.isl'
if (-not (Test-Path -LiteralPath $langFile)) {
    try {
        Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/kira-96/Inno-Setup-Chinese-Simplified-Translation/master/ChineseSimplified.isl' `
            -OutFile $langFile -TimeoutSec 60 -UseBasicParsing
        Write-Ok '已下载中文安装向导语言包'
    } catch {
        Write-Warn2 "中文语言包下载失败，安装向导将使用英文：$($_.Exception.Message)"
    }
}

# .iss 以 UTF-8 BOM 写入 build 目录（Inno 需要 BOM 才能正确识别中文）
$issText = Get-Content -LiteralPath $issSource -Raw -Encoding UTF8
$issPath = Join-Path $buildDir 'installer.iss'
[System.IO.File]::WriteAllText($issPath, $issText, (New-Object System.Text.UTF8Encoding($true)))
Copy-Item -LiteralPath $iconSource -Destination (Join-Path $buildDir 'LearnMate.ico') -Force
Copy-Item -LiteralPath (Join-Path $assetsDir 'wizard-small.bmp') -Destination (Join-Path $buildDir 'wizard-small.bmp') -Force
$langForCompile = ''
if (Test-Path -LiteralPath $langFile) {
    Copy-Item -LiteralPath $langFile -Destination (Join-Path $buildDir 'ChineseSimplified.isl') -Force
    $langForCompile = 'ChineseSimplified.isl'
}

# ------------------------------------------------------------------ 6. 编译
Write-Step '6/7 编译安装包（LZMA2 极限压缩，约 2~6 分钟）'
if (Test-Path -LiteralPath $outputExe) { Remove-Item -LiteralPath $outputExe -Force }

function Invoke-Iscc([string]$LanguageFile) {
    $arguments = @(
        "/DAppVersion=$Version",
        '/DPayloadDir=..\_payload',
        '/DOutputDir=..',
        "/DOutputBase=$outputBase",
        '/DIconFile=LearnMate.ico',
        '/DWizardSmall=wizard-small.bmp'
    )
    if ($LanguageFile) { $arguments += "/DLangFile=$LanguageFile" }
    $arguments += 'installer.iss'
    Push-Location $buildDir
    try {
        $output = Invoke-Native { & $iscc @arguments 2>&1 }
        $code = $LASTEXITCODE
    } finally { Pop-Location }
    $global:LASTEXITCODE = 0
    return [pscustomobject]@{ Code = $code; Output = ($output | Out-String) }
}

$compile = Invoke-Iscc $langForCompile
if ($compile.Code -ne 0 -and $langForCompile) {
    Write-Warn2 '带中文语言包编译失败，改用默认（英文）向导重试…'
    Write-Note ($compile.Output.Trim() -split "`n" | Select-Object -Last 12 | Out-String)
    $compile = Invoke-Iscc ''
}
if ($compile.Code -ne 0) {
    Write-Host $compile.Output -ForegroundColor DarkGray
    throw "ISCC 编译失败（退出码 $($compile.Code)）"
}
$compile.Output.Trim() -split "`n" | Select-Object -Last 4 | ForEach-Object { Write-Note $_ }

if (-not (Test-Path -LiteralPath $outputExe)) { throw "编译结束但没有生成 $outputExe" }

# ------------------------------------------------------------------ 7. 收尾
Write-Step '7/7 生成校验信息'
$hash = (Get-FileHash -LiteralPath $outputExe -Algorithm SHA256).Hash
$exeSize = (Get-Item -LiteralPath $outputExe).Length
$shaPath = Join-Path $distRoot "$outputBase.sha256.txt"
[System.IO.File]::WriteAllText($shaPath, "$hash  $outputBase.exe`r`n", (New-Object System.Text.UTF8Encoding($true)))

$summary = @(
    "智课研伴 LearnMate 桌面版安装包",
    "文件：$outputBase.exe",
    "大小：$(Format-Size $exeSize)",
    "SHA256：$hash",
    "版本：$Version   构建时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "内含：Electron 桌面外壳 + 内置 Node + 内置 MySQL + 后端 + 学生端/教师端网页产物",
    "数据：内置云服务器数据快照（账号 / 班级 / 作业 / 题库 / 资源 / 报告与云端一致，含真实账号）",
    "安装：双击安装包 → 选择「仅为我安装」→ 完成（默认装到 %LOCALAPPDATA%\Programs\LearnMate，无需管理员）",
    "卸载：设置 → 应用 → 已安装的应用 → 智课研伴 LearnMate（或安装目录里的 unins000.exe）"
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText((Join-Path $distRoot '安装包说明.txt'), $summary, (New-Object System.Text.UTF8Encoding($true)))

# 下载页：可以直接双击打开，也可以连同 exe 一起发给同学/评委
$templatePath = Join-Path $assetsDir 'download-page.template.html'
if (Test-Path -LiteralPath $templatePath) {
    $page = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8
    $page = $page.Replace('{{VERSION}}', $Version)
    $page = $page.Replace('{{FILE}}', "$outputBase.exe")
    $page = $page.Replace('{{SIZE}}', (Format-Size $exeSize))
    $page = $page.Replace('{{SHA256}}', $hash)
    $page = $page.Replace('{{BUILD_DATE}}', (Get-Date -Format 'yyyy-MM-dd HH:mm'))
    [System.IO.File]::WriteAllText((Join-Path $distRoot '下载页.html'), $page, (New-Object System.Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath (Join-Path $assetsDir 'app-cover.png') -Destination (Join-Path $distRoot '封面.png') -Force
    Write-Note "下载页：$(Join-Path $distRoot '下载页.html')"
}

if ($RemovePayload) {
    Remove-Item -LiteralPath $payloadDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $buildDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Note '已删除 payload / build 暂存目录'
}

Write-Host ''
Write-Host '打包完成 ✅' -ForegroundColor Green
Write-Host "  安装包：$outputExe  ($(Format-Size $exeSize))" -ForegroundColor Green
Write-Host "  SHA256：$hash" -ForegroundColor Green
Write-Host "  说明文件：$(Join-Path $distRoot '安装包说明.txt')" -ForegroundColor Green
