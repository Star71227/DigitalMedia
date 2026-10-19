# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 生成桌面端封面素材（品牌 logo 圆角块 + 名称），全部用无头 Edge 渲染 HTML 得到，
# 而不是画图：改设计只要改 assets\cover.html / logo-tile.html。
#
# 产物：
#   shell\pages\cover.jpg        启动画面背景（1120x737）
#   assets\app-cover.png         下载页 / 文档用封面
#   assets\logo-tile.png         品牌 logo 圆角块（440x440）
#   assets\wizard-small.bmp      安装向导右上角小图（110x110）
#   app-template\LearnMate.ico   程序图标（16~256 多尺寸，含 PNG 压缩条目）
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\make-cover-assets.ps1

param(
    [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$packagingDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path -LiteralPath (Join-Path $packagingDir '..\..')).Path }
$assetsDir = Join-Path $packagingDir 'assets'
$shellPages = Join-Path $packagingDir 'shell\pages'
$appTemplateDir = Join-Path $packagingDir 'app-template'
$workDir = Join-Path $packagingDir '.cover-work'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

foreach ($dir in @($shellPages, $assetsDir, $appTemplateDir, $workDir)) {
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}
if (-not (Test-Path -LiteralPath $edge)) { throw "没有找到 Edge：$edge（渲染封面需要它）" }

# 封面 HTML 用的 logo 从学生端 public 目录同步过来，保证和产品里是同一份
$logoSource = Join-Path $RepoRoot 'frontend-new\public\logo.png'
if (-not (Test-Path -LiteralPath $logoSource)) { throw "找不到 logo：$logoSource" }
Copy-Item -LiteralPath $logoSource -Destination (Join-Path $assetsDir 'logo.png') -Force

function Invoke-EdgeScreenshot([string]$HtmlPath, [int]$Width, [int]$Height, [string]$Output) {
    if (Test-Path -LiteralPath $Output) { Remove-Item -LiteralPath $Output -Force }
    $uri = 'file:///' + ($HtmlPath -replace '\\', '/')
    $arguments = @(
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--hide-scrollbars', '--force-device-scale-factor=1',
        "--window-size=$Width,$Height",
        "--screenshot=$Output",
        $uri
    )
    Start-Process -FilePath $edge -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden | Out-Null
    if (-not (Test-Path -LiteralPath $Output)) { throw "Edge 渲染失败：$HtmlPath" }
    return $Output
}

function Save-Jpeg([System.Drawing.Image]$Image, [string]$Path, [int]$Quality = 92) {
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)
    $Image.Save($Path, $codec, $parameters)
}

function Resize-Image([System.Drawing.Image]$Source, [int]$Width, [int]$Height) {
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($Source, (New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)))
    } finally { $graphics.Dispose() }
    return $bitmap
}

function Write-IcoFile([string]$Path, [System.Drawing.Bitmap[]]$Images) {
    # 手写 ICO 容器：每个尺寸一段 PNG（Vista 起支持，图标清晰、体积小）
    $pngs = @()
    foreach ($image in $Images) {
        $stream = New-Object System.IO.MemoryStream
        $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngs += , $stream.ToArray()
        $stream.Dispose()
    }
    $memory = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($memory)
    try {
        $writer.Write([UInt16]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]$Images.Count)
        $offset = 6 + 16 * $Images.Count
        for ($i = 0; $i -lt $Images.Count; $i++) {
            $size = $Images[$i].Width
            $dimension = 0
            if ($size -lt 256) { $dimension = [byte]$size }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)      # 调色板数
            $writer.Write([byte]0)      # 保留
            $writer.Write([UInt16]1)    # 色彩平面
            $writer.Write([UInt16]32)   # 位深
            $writer.Write([UInt32]$pngs[$i].Length)
            $writer.Write([UInt32]$offset)
            $offset += $pngs[$i].Length
        }
        foreach ($png in $pngs) { $writer.Write($png) }
        $writer.Flush()
        [System.IO.File]::WriteAllBytes($Path, $memory.ToArray())
    } finally {
        $writer.Dispose()
        $memory.Dispose()
    }
}

Write-Host '渲染应用封面…' -ForegroundColor Cyan
$coverRender = Join-Path $workDir 'cover.png'
Invoke-EdgeScreenshot -HtmlPath (Join-Path $assetsDir 'cover.html') -Width 1120 -Height 737 -Output $coverRender | Out-Null
$cover = [System.Drawing.Image]::FromFile($coverRender)
try {
    Save-Jpeg -Image $cover -Path (Join-Path $shellPages 'cover.jpg')
    $cover.Save((Join-Path $assetsDir 'app-cover.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host '  cover.jpg 1120x737 / app-cover.png 1120x737' -ForegroundColor Green
} finally { $cover.Dispose() }

Write-Host '渲染 logo 圆角块…' -ForegroundColor Cyan
$tileRender = Join-Path $workDir 'logo-tile.png'
Invoke-EdgeScreenshot -HtmlPath (Join-Path $assetsDir 'logo-tile.html') -Width 440 -Height 440 -Output $tileRender | Out-Null
$tile = [System.Drawing.Image]::FromFile($tileRender)
try {
    $tile.Save((Join-Path $assetsDir 'logo-tile.png'), [System.Drawing.Imaging.ImageFormat]::Png)

    # 安装向导右上角小图（Inno 会按 DPI 缩放）
    $wizard = Resize-Image -Source $tile -Width 110 -Height 110
    try { $wizard.Save((Join-Path $assetsDir 'wizard-small.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp) } finally { $wizard.Dispose() }

    # 程序图标：多尺寸 ICO
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $frames = @()
    foreach ($size in $sizes) { $frames += (Resize-Image -Source $tile -Width $size -Height $size) }
    try {
        Write-IcoFile -Path (Join-Path $appTemplateDir 'LearnMate.ico') -Images $frames
        Write-Host "  logo-tile.png / wizard-small.bmp / LearnMate.ico（$($sizes -join '/')）" -ForegroundColor Green
    } finally { foreach ($frame in $frames) { $frame.Dispose() } }
} finally { $tile.Dispose() }

$meta = @(
    "source      : frontend-new\public\logo.png（和产品里同一份 logo）",
    "templates   : packaging\desktop\assets\cover.html / logo-tile.html",
    "renderer    : 无头 Edge --screenshot（改设计改 HTML 重跑本脚本即可）",
    "generated at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText((Join-Path $assetsDir 'cover-source.txt'), $meta, (New-Object System.Text.UTF8Encoding($false)))

Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '封面素材生成完成 ✅' -ForegroundColor Green
