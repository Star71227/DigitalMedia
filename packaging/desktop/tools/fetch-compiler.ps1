# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 下载并裁剪一套便携 C 编译器（w64devkit 里的 gcc），放进 packaging\desktop\compiler\
# 目的：安装包内置编译器后，别人电脑上即使没有 Docker / Visual Studio，也能做代码判题。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\fetch-compiler.ps1
#   powershell ... -Force        # 强制重新下载与裁剪
#
# 裁剪原则（保留能编译/链接/运行基本 C 程序所需的一切，其余全删）：
#   bin\        gcc 驱动、as、ld、cpp + 依赖的 dll
#   libexec\    cc1.exe（C 编译器本体）、collect2.exe
#   lib\        crt*.o、libmingw32/libmingwex/libmsvcrt/libm/libpthread/libgcc + 常用 Win32 导入库
#   include\    C 标准头 + mingw-w64 头（丢掉 mshtml.h/d3d12.h 这类与教学无关的大块 COM/DirectX 头）
#   lib\gcc\... gcc 自带头（stdbool.h 等）与 libgcc.a

param(
    [string]$OutputDir = '',
    [string]$CacheDir = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$packagingDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDir) { $OutputDir = Join-Path $packagingDir 'compiler' }
if (-not $CacheDir) { $CacheDir = Join-Path $packagingDir '.compiler-cache' }

$version = '2.10.0'
$url = "https://github.com/skeeto/w64devkit/releases/download/v$version/w64devkit-x64-$version.7z.exe"
$sfx = Join-Path $CacheDir "w64devkit-x64-$version.7z.exe"
$extractDir = Join-Path $CacheDir 'w64devkit'

function Write-Step2([string]$m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok2([string]$m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Note2([string]$m) { Write-Host "  $m" -ForegroundColor DarkGray }

# ---------------------------------------------------------------- 1. 下载
Write-Step2 '1/4 准备 w64devkit'
if (-not (Test-Path -LiteralPath $CacheDir)) { New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null }
if ($Force -or -not (Test-Path -LiteralPath $sfx) -or (Get-Item $sfx).Length -lt 50MB) {
    Write-Note2 "下载 $url"
    Invoke-WebRequest -Uri $url -OutFile $sfx -TimeoutSec 1800 -UseBasicParsing
}
Write-Ok2 ("安装包 " + ('{0:N1} MB' -f ((Get-Item $sfx).Length / 1MB)))

$toolRoot = Join-Path $extractDir 'w64devkit'
if ($Force -or -not (Test-Path -LiteralPath (Join-Path $toolRoot 'bin\gcc.exe'))) {
    if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    Write-Note2 '解包（7z 自解压）…'
    $process = Start-Process -FilePath $sfx -ArgumentList @('-y', "-o$extractDir") -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $toolRoot 'bin\gcc.exe'))) {
        throw "解包 w64devkit 失败（退出码 $($process.ExitCode)）"
    }
}
Write-Ok2 "工具链就位：$toolRoot"

# ---------------------------------------------------------------- 2. 裁剪
Write-Step2 '2/4 裁剪出最小可用子集'
if (Test-Path -LiteralPath $OutputDir) { Remove-Item -LiteralPath $OutputDir -Recurse -Force }
foreach ($dir in @('bin', 'include', 'lib', 'libexec')) {
    New-Item -ItemType Directory -Path (Join-Path $OutputDir $dir) -Force | Out-Null
}

# bin：gcc 驱动 + 汇编/链接/预处理器 + 依赖 dll
$binKeep = @(
    'gcc.exe', 'x86_64-w64-mingw32-gcc-16.2.0.exe', 'x86_64-w64-mingw32-gcc.exe',
    'as.exe', 'ld.exe', 'cpp.exe', 'nm.exe', 'strip.exe', 'objcopy.exe',
    'libgcc_s_seh-1.dll', 'libwinpthread-1.dll', 'libstdc++-6.dll', 'libssp-0.dll', 'zlib1.dll'
)
foreach ($name in $binKeep) {
    $source = Join-Path $toolRoot "bin\$name"
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $OutputDir "bin\$name") -Force }
}
# 其余 dll 一并带上（体积小、避免漏依赖）
Get-ChildItem (Join-Path $toolRoot 'bin') -Filter '*.dll' | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $OutputDir 'bin') -Force
}

# libexec：cc1.exe（C 编译器本体）+ collect2.exe
$gccVerDir = Get-ChildItem (Join-Path $toolRoot 'libexec\gcc\x86_64-w64-mingw32') -Directory | Select-Object -First 1
$libexecOut = Join-Path $OutputDir "libexec\gcc\x86_64-w64-mingw32\$($gccVerDir.Name)"
New-Item -ItemType Directory -Path $libexecOut -Force | Out-Null
foreach ($name in @('cc1.exe', 'collect2.exe')) {
    $source = Join-Path $gccVerDir.FullName $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $libexecOut $name) -Force }
}

# lib\gcc\<triple>\<ver>：gcc 私有目录 —— libgcc.a、crtbegin/crtend，以及 gcc 自带头
# （stdbool.h / stddef.h / stdarg.h / mm_malloc.h 都在 include 里；少了它 stdlib.h 就编不过）
$libGccDir = Join-Path $toolRoot "lib\gcc\x86_64-w64-mingw32\$($gccVerDir.Name)"
$libGccOut = Join-Path $OutputDir "lib\gcc\x86_64-w64-mingw32\$($gccVerDir.Name)"
New-Item -ItemType Directory -Path $libGccOut -Force | Out-Null
foreach ($name in @('libgcc.a', 'libgcc_eh.a', 'libgcc_s.a', 'libssp.a', 'libssp_nonshared.a',
        'crtbegin.o', 'crtend.o', 'crtbeginS.o', 'crtendS.o', 'crtfastmath.o', 'libatomic.a')) {
    $source = Join-Path $libGccDir $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $libGccOut $name) -Force }
}
foreach ($sub in @('include', 'include-fixed')) {
    $source = Join-Path $libGccDir $sub
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $libGccOut $sub) -Recurse -Force }
}

# lib：crt 对象 + 必需导入库
$libKeep = @(
    'crt1.o', 'crt2.o', 'dllcrt1.o', 'dllcrt2.o', 'crtbegin.o', 'crtend.o',
    'libmingw32.a', 'libmingwex.a', 'libmsvcrt.a', 'libmsvcrt-os.a', 'libm.a', 'libmoldname.a',
    'libpthread.a', 'libgcc.a', 'libgcc_s.a', 'libgcc_eh.a',
    'libkernel32.a', 'libuser32.a', 'libadvapi32.a', 'libshell32.a', 'libgdi32.a',
    'libcomdlg32.a', 'libole32.a', 'liboleaut32.a', 'libuuid.a', 'libws2_32.a',
    'libshlwapi.a', 'libversion.a', 'libwinmm.a', 'libimm32.a', 'libntdll.a',
    'libmingwthrd.a', 'libscrnsave.a', 'libscrnsavw.a'
)
foreach ($name in $libKeep) {
    $source = Join-Path $toolRoot "lib\$name"
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $OutputDir "lib\$name") -Force }
}

# include：保留全部小文件（C 标准头 + mingw-w64 常用头），丢掉与教学无关的大块 COM/DirectX/WinRT 头
$includeOut = Join-Path $OutputDir 'include'
$bigSkipped = 0
foreach ($file in (Get-ChildItem (Join-Path $toolRoot 'include') -File)) {
    if ($file.Length -ge 200KB) { $bigSkipped++; continue }
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $includeOut $file.Name) -Force
}
foreach ($dir in (Get-ChildItem (Join-Path $toolRoot 'include') -Directory)) {
    Copy-Item -LiteralPath $dir.FullName -Destination (Join-Path $includeOut $dir.Name) -Recurse -Force
}
Write-Note2 "跳过了 $bigSkipped 个大头文件（mshtml.h / d3d12.h 这类）"

$size = (Get-ChildItem -LiteralPath $OutputDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Ok2 ("裁剪后体积 " + ('{0:N1} MB' -f ($size / 1MB)))

# ---------------------------------------------------------------- 3. 自检
Write-Step2 '3/4 用裁剪后的编译器自检（编译 + 运行）'
$work = Join-Path $env:TEMP ('lm-cc-verify-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$sourcePath = Join-Path $work 'main.c'
$exePath = Join-Path $work 'main.exe'
@'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
int main(void) {
    int x = 3, y = 8;
    char buf[64];
    snprintf(buf, sizeof(buf), "%d %d %.2f", y, x, sqrt(2.0));
    printf("%s\n", buf);
    return 0;
}
'@ | Set-Content -LiteralPath $sourcePath -Encoding ASCII

$gcc = Join-Path $OutputDir 'bin\gcc.exe'
$previousPath = $env:PATH
$env:PATH = (Join-Path $OutputDir 'bin') + ';' + $previousPath
try {
    $compile = & $gcc '-std=c11' '-O2' '-o' $exePath $sourcePath 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exePath)) {
        throw "裁剪后的编译器编译失败：`n$($compile | Out-String)"
    }
    $run = & $exePath 2>&1
    if ($LASTEXITCODE -ne 0 -or "$run".Trim() -ne '8 3 1.41') {
        throw "运行结果不对：期望 '8 3 1.41'，实际 '$("$run".Trim())'"
    }
    Write-Ok2 "编译运行通过：$("$run".Trim())"
} finally {
    $env:PATH = $previousPath
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- 4. 记录
Write-Step2 '4/4 记录来源'
$versionText = (& $gcc --version | Select-Object -First 1)
$info = @(
    "compiler  : w64devkit $version (x86_64, gcc)",
    "version   : $versionText",
    "source    : $url",
    "trimmedTo : bin/ + libexec/(cc1,collect2) + lib/(crt + 常用导入库) + include/(C 标准头 + mingw-w64 头)",
    "size      : $('{0:N1} MB' -f ($size / 1MB))",
    "builtAt   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText((Join-Path $OutputDir 'compiler-info.txt'), $info, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "编译器已就绪：$OutputDir" -ForegroundColor Green
Write-Host "  $versionText" -ForegroundColor Green
