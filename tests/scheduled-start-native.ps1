$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$id=[guid]::NewGuid().ToString('N')
$directory=Join-Path ([IO.Path]::GetTempPath()) ('oshi-scheduled-native-'+$id)
$taskName='CodexOshi Startup Test '+$id
$data=Join-Path $directory 'data'
$app=Join-Path $directory 'app'
$launcher=Join-Path $data 'native\QuotaLauncher-AAAAAAAAAAAAAAAA.exe'
$utf8=New-Object Text.UTF8Encoding($false)
$productionBefore=@((Get-ScheduledTask -TaskName 'Codex Quota Widget' -ErrorAction SilentlyContinue).Actions | Select-Object Execute,Arguments)|ConvertTo-Json -Compress
function Write-Fixture($relative,$text) {
    $file=Join-Path $directory $relative
    [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
    [IO.File]::WriteAllText($file,$text,$utf8)
}
function Wait-Fixture($file,$predicate) {
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    do {
        try { $value=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json;if (& $predicate $value) { return $value } } catch { }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw ('Fixture deadline: '+$file)
}
try {
    Write-Fixture 'data/desktop-runtime/node_modules/electron/dist/electron.exe' 'fixture'
    Write-Fixture 'data/native/.keep' ''
    Write-Fixture 'fixture.json' (@{common=(Join-Path $repo 'scripts/common.ps1');app=$app;data=$data;launcher=$launcher;task=$taskName}|ConvertTo-Json -Compress)
    Write-Fixture 'start.ps1' @'
$ErrorActionPreference='Stop'
$fixture=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fixture.json') -Raw | ConvertFrom-Json
. $fixture.common
function Build-Launcher { return $fixture.launcher }
Start-CodiMonitor -Root $fixture.app -DataDirectory $fixture.data -TaskName $fixture.task
'@
    Write-Fixture 'app/desktop/supervisor.ps1' @'
param([string]$DataDir)
$ErrorActionPreference='Stop'
$stop=Join-Path $DataDir 'stop.request'
if(Test-Path -LiteralPath $stop){Remove-Item -LiteralPath $stop}
[IO.File]::WriteAllText((Join-Path $DataDir 'supervisor-ready.json'),('{"pid":'+$PID+'}'))
while(-not(Test-Path -LiteralPath $stop)){Start-Sleep -Milliseconds 100}
'@
    Write-Fixture 'app/scripts/apply-update.ps1' @'
param([string]$DataDir,[string]$JobDir)
$ErrorActionPreference='Stop'
$lock=[IO.File]::Open((Join-Path $DataDir 'update.lock'),'OpenOrCreate','ReadWrite','None')
try {
    $plan=Get-Content -LiteralPath (Join-Path $JobDir 'plan.json') -Raw | ConvertFrom-Json
    $old=Get-Process -Id $plan.oldLauncherPid -ErrorAction SilentlyContinue
    if($old -and -not $old.WaitForExit(8000)){throw 'Old launcher did not exit'}
    $starter=Join-Path (Split-Path -Parent $DataDir) 'start.ps1'
    & $starter
    $deadline=[DateTime]::UtcNow.AddSeconds(12)
    do {
        Start-Sleep -Milliseconds 100
        $state=$null;$ready=$null
        try {$state=Get-Content -LiteralPath (Join-Path $DataDir 'launcher-state.json') -Raw|ConvertFrom-Json;$ready=Get-Content -LiteralPath (Join-Path $DataDir 'supervisor-ready.json') -Raw|ConvertFrom-Json}catch{}
    } while([DateTime]::UtcNow -lt $deadline -and (-not $state -or $state.pid -eq $plan.oldLauncherPid -or $ready.pid -ne $state.supervisorPid))
    if(-not $state -or $state.pid -eq $plan.oldLauncherPid -or $ready.pid -ne $state.supervisorPid){throw 'Scheduled update replacement did not start'}
    [IO.File]::Delete((Join-Path $DataDir 'update-pending.json'))
    [IO.File]::WriteAllText((Join-Path $DataDir 'handoff-result.json'),(@{workerPid=$PID;launcherPid=$state.pid;supervisorPid=$state.supervisorPid}|ConvertTo-Json -Compress))
} catch {[IO.File]::WriteAllText((Join-Path $DataDir 'handoff-error.txt'),($_.Exception.Message+' '+$_.ScriptStackTrace));exit 1}
finally {$lock.Dispose()}
'@
    $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    & $compiler /nologo /target:winexe /platform:x64 /reference:System.Web.Extensions.dll "/out:$launcher" (Join-Path $repo 'desktop/WidgetLauncher.cs')
    if($LASTEXITCODE){throw 'Fixture launcher compilation failed'}
    $action=New-ScheduledTaskAction -Execute $launcher -Argument ('--script "'+(Join-Path $app 'desktop/supervisor.ps1')+'" --data "'+$data+'"')
    $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null
    $ps=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $starter=Start-Process -FilePath $ps -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $directory 'start.ps1')+'"') -WindowStyle Hidden -PassThru -Wait
    if($starter.ExitCode){throw 'Fixture start failed'}
    $initial=Wait-Fixture (Join-Path $data 'launcher-state.json') {param($s) (Get-Process -Id $s.supervisorPid -ErrorAction SilentlyContinue)}
    if(-not (Get-Process -Id $initial.pid -ErrorAction SilentlyContinue)){throw 'Monitor died with caller'}
    $task=Get-ScheduledTask -TaskName $taskName
    if([int]$task.Settings.MultipleInstances -ne 0){throw 'Replacement launch remains blocked by old task instance'}
    Write-Fixture 'data/updates/job/plan.json' (@{version='0.3.11';commit=('a'*40);oldLauncherPid=$initial.pid}|ConvertTo-Json -Compress)
    Write-Fixture 'data/update-state.json' '{"status":"ready"}'
    Write-Fixture 'data/update-request.json' (@{jobDir=(Join-Path $data 'updates/job')}|ConvertTo-Json -Compress)
    Write-Fixture 'data/stop.request' 'stop'
    $replacement=Wait-Fixture (Join-Path $data 'handoff-result.json') {param($s) $s.launcherPid -ne $initial.pid}
    $worker=Get-Process -Id $replacement.workerPid -ErrorAction SilentlyContinue
    if($worker -and -not $worker.WaitForExit(8000)){throw 'Update worker did not finish'}
    Start-Sleep -Milliseconds 1200
    if(-not (Get-Process -Id $replacement.launcherPid -ErrorAction SilentlyContinue) -or -not (Get-Process -Id $replacement.supervisorPid -ErrorAction SilentlyContinue)){throw 'Replacement died with update worker'}
    [pscustomobject]@{passed=$true;callerExited=$starter.HasExited;monitorSurvivedCaller=$true;replacementSurvivedUpdater=$true;task=$taskName}|ConvertTo-Json
} catch {
    Write-Output ('Native startup fixture failed: '+$_.Exception.Message+' '+$_.ScriptStackTrace)
    throw
} finally {
    if(Test-Path -LiteralPath $data){[IO.File]::WriteAllText((Join-Path $data 'stop.request'),'stop')}
    $deadline=[DateTime]::UtcNow.AddSeconds(8)
    do {
        $owned=@(Get-CimInstance Win32_Process -Filter "Name='QuotaLauncher-AAAAAAAAAAAAAAAA.exe'" | Where-Object {$_.ExecutablePath -eq $launcher})
        if($owned.Count){Start-Sleep -Milliseconds 200}
    }while($owned.Count -and [DateTime]::UtcNow -lt $deadline)
    if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){Stop-ScheduledTask -TaskName $taskName;Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
    if($owned.Count){throw ('Fixture still running; retained '+$directory)}
    $full=[IO.Path]::GetFullPath($directory)
    if((Split-Path -Parent $full) -ne ([IO.Path]::GetTempPath().TrimEnd('\','/')) -or (Split-Path -Leaf $full) -ne ('oshi-scheduled-native-'+$id)){throw 'Unexpected fixture cleanup target'}
    for($attempt=0;$attempt -lt 20 -and (Test-Path -LiteralPath $full);$attempt++){
        try{Remove-Item -LiteralPath $full -Recurse -Force}catch{if($attempt -eq 19){throw};Start-Sleep -Milliseconds 250}
    }
    $productionAfter=@((Get-ScheduledTask -TaskName 'Codex Quota Widget' -ErrorAction SilentlyContinue).Actions | Select-Object Execute,Arguments)|ConvertTo-Json -Compress
    if($productionAfter -cne $productionBefore){throw 'Production task configuration changed during isolated fixture'}
}
