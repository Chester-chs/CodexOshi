const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),quote=s=>"'"+s.replaceAll("'","''")+"'";
function run(body){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-scheduled-start-'));
 try{
  const data=path.join(dir,'data'),app=path.join(dir,'app'),exe=path.join(data,'native','QuotaLauncher-AAAAAAAAAAAAAAAA.exe');
  fs.mkdirSync(path.join(data,'desktop-runtime','node_modules','electron','dist'),{recursive:true});fs.writeFileSync(path.join(data,'desktop-runtime','node_modules','electron','dist','electron.exe'),'fixture');
  const script=`$ErrorActionPreference='Stop';. ${quote(path.join(root,'scripts','common.ps1'))};
  $data=${quote(data)};$app=${quote(app)};$launcher=${quote(exe)};$script:scheduled=0;$script:direct=0;$script:settings=$null;$script:action=$null;
  function Build-Launcher { return $launcher }
  function New-ScheduledTaskSettingsSet { param($MultipleInstances,$ExecutionTimeLimit,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,[switch]$StartWhenAvailable,$RestartCount,$RestartInterval); return @{MultipleInstances=$MultipleInstances;RestartCount=$RestartCount} }
  function New-ScheduledTaskAction { param($Execute,$Argument);return @{Execute=$Execute;Arguments=$Argument} }
  function Get-ScheduledTask { [pscustomobject]@{State='Ready';Actions=@([pscustomobject]@{Execute=$launcher;Arguments=('--script "old\\desktop\\supervisor.ps1" --data "'+$data+'"')})} }
  function Set-ScheduledTask { param($TaskName,$Action,$Settings);$script:settings=$Settings;$script:action=$Action }
  function Start-ScheduledTask { param($TaskName);if($TaskName -ne 'Codex Quota Widget'){throw 'Wrong task'};$script:scheduled++ }
  function Start-Process { param($FilePath,$ArgumentList,$WindowStyle);$script:direct++ }
  ${body}`;
  const out=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(out.status,0,out.stdout+'\n'+out.stderr);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
}
test('an existing startup task owns the monitor instead of the calling Codex process',()=>run(`
 Start-CodiMonitor -Root $app -DataDirectory $data;
 if($script:scheduled -ne 1 -or $script:direct -ne 0){throw 'Monitor was launched as a caller child instead of through Task Scheduler'}
 if($script:action.Execute -ne $launcher -or $script:action.Arguments -ne ('--script "'+(Join-Path $app 'desktop\\supervisor.ps1')+'" --data "'+$data+'"')){throw 'Task did not use requested release'}
 if($script:settings.MultipleInstances -ne 'Parallel'){throw 'Updating task cannot hand off to a replacement instance'}
`));
test('scheduled start failures remain visible rather than falling back to an app-owned child',()=>run(`
 function Start-ScheduledTask {throw 'fixture scheduler unavailable'}
 $failed=$false;try{Start-CodiMonitor -Root $app -DataDirectory $data}catch{$failed=$_.Exception.Message -like '*fixture scheduler unavailable*'}
 if(-not $failed -or $script:direct -ne 0){throw 'Scheduler failure was silently bypassed'}
`));
test('a scheduler entry pointing at another data directory is not overwritten',()=>run(`
 function Get-ScheduledTask {[pscustomobject]@{State='Ready';Actions=@([pscustomobject]@{Execute='C:\\unrelated.exe';Arguments='--data "other"'})}}
 $failed=$false;try{Start-CodiMonitor -Root $app -DataDirectory $data}catch{$failed=$true}
 if(-not $failed -or $script:action -or $script:scheduled -or $script:direct){throw 'Unrelated task was overwritten or bypassed'}
`));
test('manual startup preserves an explicit startup opt-out',()=>run(`
 function Get-ScheduledTask {return $null};Start-CodiMonitor -Root $app -DataDirectory $data;
 if($script:direct -ne 1 -or $script:scheduled -ne 0 -or $script:action){throw 'Startup opt-out changed'}
`));
test('manual startup does not re-enable a disabled startup task',()=>run(`
 function Get-ScheduledTask {[pscustomobject]@{State='Disabled'}};Start-CodiMonitor -Root $app -DataDirectory $data;
 if($script:direct -ne 1 -or $script:scheduled -ne 0 -or $script:action){throw 'Disabled startup task changed'}
`));
test('an explicitly isolated task name is used for every scheduler operation',()=>run(`
 function Get-ScheduledTask {param($TaskName);if($TaskName -ne 'fixture-only'){throw 'Wrong lookup task'};[pscustomobject]@{State='Ready';Actions=@([pscustomobject]@{Execute=$launcher;Arguments=('--data "'+$data+'"')})}}
 function Set-ScheduledTask {param($TaskName,$Action,$Settings);if($TaskName -ne 'fixture-only'){throw 'Wrong update task'}}
 function Start-ScheduledTask {param($TaskName);if($TaskName -ne 'fixture-only'){throw 'Wrong start task'}}
 Start-CodiMonitor -Root $app -DataDirectory $data -TaskName 'fixture-only';
`));
