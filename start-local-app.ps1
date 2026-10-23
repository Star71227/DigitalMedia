# 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。
# One-click local launcher. Uses existing credentials and database data.
param([switch]$Open,[switch]$Stop,[switch]$Restart,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskRuntime=Join-Path $taskRoot '.local-runtime'
$taskLogs=Join-Path $taskRuntime 'logs'
function Find-Existing([string[]]$Paths){foreach($p in $Paths){if($p -and (Test-Path -LiteralPath $p)){return (Resolve-Path -LiteralPath $p).Path}};return $null}
function Test-Port([int]$Port){$c=New-Object Net.Sockets.TcpClient;try{$a=$c.BeginConnect('127.0.0.1',$Port,$null,$null);if(!$a.AsyncWaitHandle.WaitOne(500)){return $false};$c.EndConnect($a);return $true}catch{return $false}finally{$c.Close()}}
function Test-Web([string]$Url,[switch]$Backend){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3;if($r.StatusCode -ne 200){return $false};if($Backend){$json=$r.Content|ConvertFrom-Json;return ($json.status -eq 'ok' -and $json.database -eq 'ok')};return $true}catch{return $false}}
function Wait-Ready([scriptblock]$Probe,[int]$Seconds=45){$end=(Get-Date).AddSeconds($Seconds);do{if((& $Probe)){return $true};Start-Sleep -Milliseconds 600}while((Get-Date)-lt $end);return $false}
function Quote-Argument([string]$Value){return '"'+$Value+'"'}
function Start-Worker([string]$Name,[string]$Executable,[string[]]$Arguments,[string]$Directory){
 $process=Start-Process -FilePath $Executable -ArgumentList ($Arguments -join ' ') -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs ($Name+'.out.log')) -RedirectStandardError (Join-Path $taskLogs ($Name+'.err.log')) -PassThru
 [IO.File]::WriteAllText((Join-Path $taskRuntime ($Name+'.pid')),[string]$process.Id)
 $record=@{Pid=$process.Id;Executable=$Executable;StartedUtcTicks=$process.StartTime.ToUniversalTime().Ticks;Root=$taskRoot}
 [IO.File]::WriteAllText((Join-Path $taskRuntime ($Name+'.process.json')),($record|ConvertTo-Json -Compress))
 Write-Host "  Started $Name in background" -ForegroundColor Cyan
 return $process
}
function Stop-Worker([string]$Name){
 $recordFile=Join-Path $taskRuntime ($Name+'.process.json')
 if(Test-Path -LiteralPath $recordFile){
   $record=[IO.File]::ReadAllText($recordFile)|ConvertFrom-Json
   $running=Get-Process -Id $record.Pid -ErrorAction SilentlyContinue
   if($running -and $record.Root -eq $taskRoot -and $running.Path -eq $record.Executable -and $running.StartTime.ToUniversalTime().Ticks -eq $record.StartedUtcTicks){Stop-Process -Id $running.Id -Force;Write-Host "  Stopped $Name"}
   Remove-Item -LiteralPath $recordFile -Force
   $pidFile=Join-Path $taskRuntime ($Name+'.pid');if(Test-Path -LiteralPath $pidFile){Remove-Item -LiteralPath $pidFile -Force}
   return
 }
 $file=Join-Path $taskRuntime ($Name+'.pid');if(!(Test-Path -LiteralPath $file)){return}
 $workerId=0;if(![int]::TryParse([IO.File]::ReadAllText($file).Trim(),[ref]$workerId)){return}
 $p=Get-CimInstance Win32_Process -Filter "ProcessId=$workerId" -ErrorAction SilentlyContinue
 # Stale PID files must never terminate unrelated processes.
 if($p -and $p.CommandLine -and $p.CommandLine.Contains($taskRoot)){Stop-Process -Id $workerId -Force;Write-Host "  Stopped $Name"}
 Remove-Item -LiteralPath $file -Force
}
try{
 Write-Host "`nLearnMate - Database + Backend + Student + Teacher" -ForegroundColor Cyan
 Write-Host "Project: $taskRoot"
 if($Stop -or $Restart){foreach($name in @('student','teacher','backend')){Stop-Worker $name};if($Stop -and !$Restart){Write-Host 'Web services stopped. MySQL remains running.';exit 0}}
 $nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
 $taskNode=Find-Existing @($env:LEARNMATE_NODE, $(if($nodeCommand){$nodeCommand.Source}), (Join-Path $taskRoot 'learnmate-local-runtime\node\node.exe'), 'C:\Program Files\nodejs\node.exe',(Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
 $taskMysqlHome=Find-Existing @($env:LEARNMATE_MYSQL_HOME,(Join-Path $taskRoot 'learnmate-local-runtime\mysql-server'),(Join-Path $env:USERPROFILE 'mysql84'),(Join-Path $env:USERPROFILE 'Documents\Codex\2026-09-14\ba\work\mysql-runtime\mysql-8.4.11-winx64'))
 $taskMysqlCfg=Find-Existing @($env:LEARNMATE_MYSQL_CFG,(Join-Path $taskRoot 'learnmate-local-runtime\mysql\my.ini'),(Join-Path $env:USERPROFILE 'mysql84\my.ini'),(Join-Path $env:USERPROFILE 'Documents\Codex\2026-09-14\ba\work\learnmate-local-runtime\mysql\my.ini'))
 $taskMysqlData=$null;if($taskMysqlCfg){$taskMysqlData=Join-Path (Split-Path $taskMysqlCfg -Parent) 'data'}
 if(!$taskNode){throw 'Node.js 24 missing. Install it or set LEARNMATE_NODE.'}
 if(!(Test-Path -LiteralPath (Join-Path $taskRoot '.env')) -and !(Test-Path -LiteralPath (Join-Path $taskRoot 'backend\.env'))){throw 'Project .env missing. Restore existing configuration.'}
  # 每个端优先使用前端源码的最新构建产物 frontend-*/dist（与云端、桌面版一致）；
  # 仅在构建产物缺失时才回退到随仓库分发的 scripts/local-web 预构建副本。
  foreach($client in @('student','teacher')){
    if($client -eq 'student'){$distDir=Join-Path $taskRoot 'frontend-new\dist'}else{$distDir=Join-Path $taskRoot 'frontend-teacher\dist'}
    $hasDist=Test-Path -LiteralPath (Join-Path $distDir 'index.html')
    if($hasDist){
      if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'scripts\dist-server.cjs'))){throw "Missing scripts/dist-server.cjs"}
    }else{
      foreach($asset in @('index.html','main.js','main.css')){if(!(Test-Path -LiteralPath (Join-Path $taskRoot "scripts\local-web\$client\$asset"))){throw "Missing web build for $client (frontend dist or scripts/local-web)"}}
    }
  }
 if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'backend\node_modules\express\package.json'))){throw 'Missing backend dependencies. Restore backend/node_modules.'}
 if(!(Test-Port 3306)){
   if(!$taskMysqlHome -or !$taskMysqlCfg -or !(Test-Path -LiteralPath (Join-Path $taskMysqlHome 'bin\mysqld.exe')) -or !(Test-Path -LiteralPath (Join-Path $taskMysqlData 'mysql'))){throw 'Initialized MySQL missing. Set LEARNMATE_MYSQL_HOME / LEARNMATE_MYSQL_CFG. Existing data will not be reset.'}
 }
 if($CheckOnly){Write-Host 'Check passed: Node, MySQL runtime, dependencies and both web builds are available.' -ForegroundColor Green;exit 0}
 New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
 $pathEntries=@([Environment]::GetEnvironmentVariables('Process').GetEnumerator()|Where-Object {$_.Key -ieq 'Path'})
 if($pathEntries.Count -gt 1){$segments=@();foreach($entry in $pathEntries){$segments+=([string]$entry.Value -split ';')};foreach($entry in $pathEntries){Remove-Item -LiteralPath ('Env:'+ $entry.Key)};$env:Path=($segments|Select-Object -Unique)-join ';'}
 Write-Host "`n[1/3] MySQL"
 if(!(Test-Port 3306)){
   $mysqlArgs=@((Quote-Argument "--defaults-file=$taskMysqlCfg"),(Quote-Argument "--basedir=$taskMysqlHome"),(Quote-Argument "--datadir=$taskMysqlData"),'--bind-address=127.0.0.1')
   $worker=Start-Worker 'mysql' (Join-Path $taskMysqlHome 'bin\mysqld.exe') $mysqlArgs (Split-Path $taskMysqlCfg -Parent)
   if(!(Wait-Ready {Test-Port 3306} 45)){throw 'MySQL failed to start. See database logs.'}
 }
 Write-Host '  MySQL ready' -ForegroundColor Green
 Write-Host "`n[2/3] Backend"
 $backendUrl='http://127.0.0.1:5800/api/health'
 if(!(Test-Web $backendUrl -Backend)){
   if(Test-Port 5800){throw 'Port 5800 occupied but backend health check failed. Close the old backend first.'}
   $env:HOST='127.0.0.1';$env:PORT='5800'
   $worker=Start-Worker 'backend' $taskNode @((Quote-Argument (Join-Path $taskRoot 'backend\src\index.js'))) $taskRoot
   if(!(Wait-Ready {Test-Web $backendUrl -Backend} 60)){throw 'Backend/database check failed. See .local-runtime/logs/backend.err.log.'}
 }
 Write-Host '  Backend and database health check passed' -ForegroundColor Green
 Write-Host "`n[3/3] Student and teacher web"
 foreach($client in @('student','teacher')){
   $port=if($client -eq 'student'){5173}else{5174};$url="http://127.0.0.1:$port/"
   if(!(Test-Web $url)){
     if(Test-Port $port){throw "Port $port occupied by another application."}
      if($client -eq 'student'){$distDir=Join-Path $taskRoot 'frontend-new\dist'}else{$distDir=Join-Path $taskRoot 'frontend-teacher\dist'}
      if(Test-Path -LiteralPath (Join-Path $distDir 'index.html')){
        $worker=Start-Worker $client $taskNode @((Quote-Argument (Join-Path $taskRoot 'scripts\dist-server.cjs')),(Quote-Argument $client),(Quote-Argument $distDir),(Quote-Argument ([string]$port)),(Quote-Argument '5800')) $taskRoot
      }else{
        $worker=Start-Worker $client $taskNode @((Quote-Argument (Join-Path $taskRoot 'scripts\local-web-server.cjs')),$client) $taskRoot
      }
     if(!(Wait-Ready {Test-Web $url} 15)){throw "$client failed to start."}
   }
 }
 foreach($port in @(5173,5174)){if(!(Test-Web "http://127.0.0.1:$port/api/health" -Backend)){throw "Web API proxy check failed on port $port."}}
 Write-Host "`nAll services ready. Login is available." -ForegroundColor Green
 Write-Host 'Student: http://127.0.0.1:5173/student'
 Write-Host 'Teacher: http://127.0.0.1:5174/dashboard'
 Write-Host 'Closing this window keeps services running. Use the Stop script to stop them.'
 if($Open){Start-Process 'http://127.0.0.1:5173/student';Start-Process 'http://127.0.0.1:5174/dashboard'}
 exit 0
}catch{Write-Host "`nStart failed: $($_.Exception.Message)" -ForegroundColor Red;Write-Host "Logs: $taskLogs";exit 1}
