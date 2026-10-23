# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# 从云服务器拉取「与云端一致」的数据快照（数据库 + 存储文件 + 功能配置），
# 供打包时内置进安装包（build-desktop-installer.ps1 会把 cloud-snapshot\ 组装成 payload\seed\）。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\desktop\tools\fetch-cloud-snapshot.ps1
#
# 需要：本机有 ssh/scp，并且 ~\.ssh\learnmate_deploy_ed25519 能登录云服务器。

param(
    [string]$Server = 'ubuntu@111.230.111.94',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\learnmate_deploy_ed25519'),
    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

$packagingDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $OutDir) { $OutDir = Join-Path $packagingDir 'cloud-snapshot' }
if (-not (Test-Path -LiteralPath $KeyPath)) { throw "找不到 SSH 私钥：$KeyPath" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$remoteScript = @'
#!/usr/bin/env bash
# 在云服务器上导出「与云端一致」的快照：数据库 + 存储卷（资源/报告）+ 云端 .env
set -euo pipefail
OUT=/tmp/lm-snapshot
rm -rf "$OUT"; mkdir -p "$OUT"

echo "[1/4] dump cloud database"
docker exec learnmate-mysql-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --default-character-set=utf8mb4 --databases learnmate' 2>/dev/null | gzip > "$OUT/learnmate-cloud-db.sql.gz"

echo "[2/4] package storage volumes"
for image in learnmate-backend:local node:24.17.0-bookworm-slim alpine:3; do
  if docker run --rm -v learnmate_backend_resources:/data/resources:ro -v learnmate_backend_reports:/data/reports:ro -v "$OUT":/out "$image" sh -c 'cd /data && tar czf /out/learnmate-cloud-storage.tar.gz resources reports' 2>/dev/null; then
    echo "   packaged with $image"; break
  fi
done

echo "[3/4] grab cloud .env"
if docker cp learnmate-backend-1:/app/.env "$OUT/learnmate-cloud.env" 2>/dev/null; then echo "   from container";
elif [ -r /opt/learnmate/.env ]; then cp /opt/learnmate/.env "$OUT/learnmate-cloud.env"; echo "   from /opt/learnmate/.env";
else echo "   !! no .env"; fi

echo "[4/4] stats"
{
  echo "users=$(docker exec learnmate-mysql-1 sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B -e "SELECT COUNT(*) FROM learnmate.users"')"
  echo "resources=$(docker exec learnmate-mysql-1 sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B -e "SELECT COUNT(*) FROM learnmate.learning_resources"')"
  echo "reports=$(docker exec learnmate-mysql-1 sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B -e "SELECT COUNT(*) FROM learnmate.learning_assessment_reports"')"
} > "$OUT/cloud-stats.txt" 2>/dev/null || echo "(stats 采集失败)" > "$OUT/cloud-stats.txt"
cat "$OUT/cloud-stats.txt"
ls -l "$OUT"
'@

# 远端脚本必须是 LF：PowerShell 管道喂 ssh 会加 CRLF，远端 bash 会报 $'\r'
$tempScript = Join-Path $env:TEMP 'lm-cloud-export.sh'
[System.IO.File]::WriteAllText($tempScript, ($remoteScript -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "上传导出脚本到 $Server …" -ForegroundColor Cyan
& scp -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=no $tempScript "${Server}:/tmp/lm-cloud-export.sh"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败（退出码 $LASTEXITCODE）" }

Write-Host '在云服务器上导出快照…' -ForegroundColor Cyan
& ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=no $Server 'bash /tmp/lm-cloud-export.sh'
if ($LASTEXITCODE -ne 0) { throw "远端导出失败（退出码 $LASTEXITCODE）" }

Write-Host '下载快照…' -ForegroundColor Cyan
foreach ($file in @('learnmate-cloud-db.sql.gz', 'learnmate-cloud-storage.tar.gz', 'learnmate-cloud.env', 'cloud-stats.txt')) {
    & scp -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=no "${Server}:/tmp/lm-snapshot/$file" (Join-Path $OutDir $file) | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "下载 $file 失败" }
    $size = (Get-Item (Join-Path $OutDir $file)).Length
    Write-Host ("  {0,-34} {1,10:N2} MB" -f $file, ($size / 1MB))
}

$statsPath = Join-Path $OutDir 'cloud-stats.txt'
if (Test-Path -LiteralPath $statsPath) {
    Write-Host ''
    Get-Content -LiteralPath $statsPath | ForEach-Object { Write-Host "  云端：$_" -ForegroundColor Green }
}
Write-Host "`n快照已更新：$OutDir" -ForegroundColor Green
Write-Host '下次运行 build-desktop-installer.ps1 时会自动把它打进安装包（payload\seed\）'
