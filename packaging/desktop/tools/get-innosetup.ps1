# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 安装 Inno Setup 6（优先 winget；失败则直接下载官方安装器并静默安装到当前用户）
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

function Test-Iscc {
    foreach ($p in @(
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe',
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )) { if (Test-Path $p) { return $p } }
    $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$found = Test-Iscc
if ($found) { Write-Host "ISCC already present: $found"; exit 0 }

Write-Host '--- trying winget ---'
try {
    winget install --id JRSoftware.InnoSetup -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | ForEach-Object { $_ }
} catch { Write-Host "winget failed: $($_.Exception.Message)" }

$found = Test-Iscc
if ($found) { Write-Host "ISCC after winget: $found"; exit 0 }

Write-Host '--- downloading official installer ---'
$out = Join-Path $env:TEMP 'innosetup-installer.exe'
$urls = @(
    'https://files.jrsoftware.org/is/6/innosetup-6.4.3.exe',
    'https://jrsoftware.org/download.php/is.exe'
)
$ok = $false
foreach ($u in $urls) {
    try {
        Invoke-WebRequest -Uri $u -OutFile $out -TimeoutSec 300 -UseBasicParsing
        if ((Get-Item $out).Length -gt 1MB) { Write-Host "downloaded $u"; $ok = $true; break }
    } catch { Write-Host "download failed ($u): $($_.Exception.Message)" }
}
if (-not $ok) { Write-Host 'DOWNLOAD_FAILED'; exit 2 }

Write-Host '--- silent install (current user) ---'
$args = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', '/SP-')
$p = Start-Process -FilePath $out -ArgumentList $args -Wait -PassThru
Write-Host "installer exit code: $($p.ExitCode)"

$found = Test-Iscc
if ($found) { Write-Host "ISCC: $found"; exit 0 }
Write-Host 'ISCC_NOT_FOUND'
exit 3
