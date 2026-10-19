# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 截取桌面端主窗口（验证"装出来的是真正的应用程序窗口"）
#
# 优先用 PrintWindow（窗口被挡住也能截），失败退回 CopyFromScreen（要求窗口在最前面）。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\capture-app-window.ps1 `
#       -Output "D:\tmp\app-window.png" -WaitSeconds 30

param(
    [string]$ProcessName = 'LearnMate',
    [string]$Output = (Join-Path $env:TEMP 'learnmate-app-window.png'),
    [int]$WaitSeconds = 30
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@

# 必须先声明 DPI 感知：否则在高缩放屏（如 150%）上 GetWindowRect/PrintWindow
# 拿到的是虚拟化坐标，截出来只有窗口左上角一块，右边的登录面板会被裁掉。
[void][WinApi]::SetProcessDPIAware()

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$handle = [IntPtr]::Zero
while ((Get-Date) -lt $deadline) {
    $process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($process) { $handle = $process.MainWindowHandle; break }
    Start-Sleep -Seconds 2
}
if ($handle -eq [IntPtr]::Zero) { throw "没有找到 $ProcessName 的主窗口（程序没起来或还没显示窗口）" }

$rect = New-Object WinApi+RECT
[void][WinApi]::GetWindowRect($handle, [ref]$rect)
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "窗口尺寸异常：${width}x${height}" }

[void][WinApi]::ShowWindow($handle, 9)      # SW_RESTORE
[void][WinApi]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 1200

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $hdc = $graphics.GetHdc()
    $ok = $false
    try { $ok = [WinApi]::PrintWindow($handle, $hdc, 2) } finally { $graphics.ReleaseHdc($hdc) }
    if (-not $ok) {
        $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
    }
} finally {
    $graphics.Dispose()
}

$dir = Split-Path -Parent $Output
if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bitmap.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Host "已截图：$Output  (${width}x${height})" -ForegroundColor Green
