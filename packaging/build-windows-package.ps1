# 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
$ErrorActionPreference = "Stop"

$packagingDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $packagingDir ".." )).Path
$distRoot = Join-Path $projectRoot "dist"
$stagingRoot = Join-Path $distRoot "LearnMate-Rescue-Windows"
$iexpressRoot = Join-Path $distRoot "LearnMate-IExpress"
$payloadZip = Join-Path $iexpressRoot "LearnMate-Payload.zip"
$outputExe = Join-Path $distRoot "LearnMate-Rescue.exe"
$sedPath = Join-Path $distRoot "LearnMate-Rescue.sed"

if (-not (Test-Path -LiteralPath $distRoot)) {
    New-Item -ItemType Directory -Path $distRoot | Out-Null
}

foreach ($path in @($stagingRoot, $iexpressRoot, $outputExe, $sedPath)) {
    if (Test-Path -LiteralPath $path) {
        $full = [System.IO.Path]::GetFullPath($path)
        $distFull = [System.IO.Path]::GetFullPath($distRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($distFull, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a path outside the dist directory: $full"
        }
        Remove-Item -LiteralPath $path -Recurse -Force
    }
}
New-Item -ItemType Directory -Path $stagingRoot | Out-Null

$excludedDirectoryNames = @(".git", ".agents", ".github", ".impeccable", "node_modules", "dist", "build", "storage")
$excludedFileNames = @(".env")
$rootPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

Get-ChildItem -LiteralPath $projectRoot -Force -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($rootPrefix.Length)
    $parts = $relative -split "[\\/]"
    if ($_.PSIsContainer) { return }
    if ($excludedFileNames -contains $_.Name) { return }
    if ($parts | Where-Object { $excludedDirectoryNames -contains $_ }) { return }

    $target = Join-Path $stagingRoot $relative
    $targetDir = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
}

$readmePath = Join-Path $stagingRoot "README-WINDOWS.txt"
Copy-Item -LiteralPath (Join-Path $packagingDir "README-WINDOWS.txt") -Destination $readmePath -Force

New-Item -ItemType Directory -Path $iexpressRoot | Out-Null
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $payloadZip -CompressionLevel Optimal
Copy-Item -LiteralPath (Join-Path $packagingDir "launch-learnmate.ps1") -Destination (Join-Path $iexpressRoot "launch-learnmate.ps1") -Force

$sourceFiles = Get-ChildItem -LiteralPath $iexpressRoot -File | Sort-Object Name
$sed = [System.Collections.Generic.List[string]]::new()
$sed.Add("[Version]")
$sed.Add("Class=IEXPRESS")
$sed.Add("SEDVersion=3")
$sed.Add("[Options]")
$sed.Add("PackagePurpose=InstallApp")
$sed.Add("ShowInstallProgramWindow=1")
$sed.Add("HideExtractAnimation=1")
$sed.Add("UseLongFileName=1")
$sed.Add("InsideCompressed=1")
$sed.Add("TargetName=$outputExe")
$sed.Add("FriendlyName=LearnMate Rescue")
$sed.Add("AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\launch-learnmate.ps1")
$sed.Add("PostInstallCmd=<None>")
$sed.Add("AdminQuietInstCmd=")
$sed.Add("UserQuietInstCmd=")
$sed.Add("SourceFiles=SourceFiles")
$sed.Add("[SourceFiles]")
$sed.Add("SourceFiles0=$iexpressRoot")
$sed.Add("[SourceFiles0]")

$stringLines = [System.Collections.Generic.List[string]]::new()
$index = 0
foreach ($file in $sourceFiles) {
    $relative = $file.Name
    $key = "FILE$index"
    $sed.Add("%$key%=$($file.FullName)")
    $stringLines.Add("$key=$relative")
    $index++
}
$sed.Add("[Strings]")
$stringLines | ForEach-Object { $sed.Add($_) }

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($sedPath, ($sed -join [Environment]::NewLine), $utf8)

Write-Host "Building $outputExe ..." -ForegroundColor Cyan
$iexpress = Join-Path $env:WINDIR "System32\iexpress.exe"
Start-Process -FilePath $iexpress -ArgumentList @('/N', $sedPath) -Wait -PassThru | Out-Null
Start-Sleep -Milliseconds 500
if (-not (Test-Path -LiteralPath $outputExe)) {
    throw "IExpress failed to create $outputExe"
}

$zipPath = Join-Path $distRoot "LearnMate-Rescue-Windows.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Created:" -ForegroundColor Green
Write-Host "  $outputExe"
Write-Host "  $zipPath"
