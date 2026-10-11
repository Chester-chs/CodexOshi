const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const source=path.resolve(__dirname,'../desktop/WidgetLauncher.cs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function until(fn,why,ms=16000){const deadline=Date.now()+ms;while(Date.now()<deadline){const result=fn();if(result)return result;await delay(50);}throw Error('Timed out: '+why);}
async function removeFixture(dir){
  const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.match(path.basename(resolved),/^codi-update-native-[A-Za-z0-9]+$/);
  // Windows can retain image or working-directory handles briefly after all PIDs
  // disappear. Yield between bounded retries so child close events also drain.
  const deadline=Date.now()+10000;
  while(true){try{await fs.promises.rm(resolved,{recursive:true,force:true});return;}catch(error){if(!['EPERM','EACCES','EBUSY','ENOTEMPTY'].includes(error.code)||Date.now()>=deadline)throw error;await delay(150);}}
}
async function nativeFixture(recovery){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-update-native-')),data=path.join(dir,'data space'),job=path.join(data,'updates','job-1'),app=path.join(dir,'trusted app'),supervisor=path.join(app,'desktop','supervisor.ps1'),worker=path.join(app,'scripts','apply-update.ps1'),exe=path.join(dir,'QuotaLauncher.exe');
  let child,childClosed=false;const ownedPids=new Set();
  const remember=record=>{for(const key of ['pid','workerPid','launcherPid','supervisorPid'])if(Number.isInteger(record?.[key])&&record[key]>0)ownedPids.add(record[key]);};
  try {
    fs.mkdirSync(job,{recursive:true});fs.mkdirSync(path.dirname(supervisor),{recursive:true});fs.mkdirSync(path.dirname(worker),{recursive:true});
    const compile=spawnSync(path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:winexe','/platform:x64','/reference:System.Web.Extensions.dll','/out:'+exe,source],{encoding:'utf8',timeout:20000,windowsHide:true});assert.equal(compile.status,0,compile.stdout+compile.stderr);
    fs.writeFileSync(supervisor,`param([string]$DataDir)
$ErrorActionPreference='Stop'
$stop=Join-Path $DataDir 'stop.request'
if(Test-Path -LiteralPath $stop) { Remove-Item -LiteralPath $stop }
[IO.File]::WriteAllText((Join-Path $DataDir 'supervisor-ready.json'),('{"pid":'+$PID+'}'))
while(-not(Test-Path -LiteralPath $stop)) { Start-Sleep -Milliseconds 50 }
`);
    fs.writeFileSync(worker,String.raw`param([string]$DataDir,[string]$JobDir)
$ErrorActionPreference='Stop'
$utf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $DataDir 'fixture-worker.json'),('{"pid":'+$PID+'}'),$utf8)
$lock=[IO.File]::Open((Join-Path $DataDir 'update.lock'),'OpenOrCreate','ReadWrite','None')
try {
  $plan=Get-Content -LiteralPath (Join-Path $JobDir 'plan.json') -Raw | ConvertFrom-Json
  if($plan.oldLauncherPid -gt 0) { $old=Get-Process -Id $plan.oldLauncherPid -ErrorAction SilentlyContinue;if($old -and -not $old.WaitForExit(8000)) { throw 'old launcher survived' } }
  Start-Sleep -Milliseconds 500
  $sha=[Security.Cryptography.SHA256]::Create();$identity=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($DataDir.ToLowerInvariant()))).Replace('-','').Substring(0,24);$sha.Dispose()
  $fresh=$false;$mutex=New-Object Threading.Mutex($true,('Local\CodexQuotaLauncher-'+$identity),[ref]$fresh)
  if(-not $fresh) { throw 'launcher mutex retained' };$mutex.ReleaseMutex();$mutex.Dispose()
  $script=Join-Path (Split-Path -Parent $PSScriptRoot) 'desktop\supervisor.ps1'
  $next=Start-Process -FilePath $env:CODI_TEST_LAUNCHER -ArgumentList ('--script "'+$script+'" --data "'+$DataDir+'"') -WindowStyle Hidden -PassThru
  $deadline=[DateTime]::UtcNow.AddSeconds(8)
  do { Start-Sleep -Milliseconds 50;$state=$null;try {$state=Get-Content -LiteralPath (Join-Path $DataDir 'launcher-state.json') -Raw | ConvertFrom-Json;$ready=Get-Content -LiteralPath (Join-Path $DataDir 'supervisor-ready.json') -Raw | ConvertFrom-Json} catch {} } while(([DateTime]::UtcNow -lt $deadline) -and (-not $state -or $state.pid -ne $next.Id -or $ready.pid -ne $state.supervisorPid))
  if(-not $state -or $state.pid -ne $next.Id -or $ready.pid -ne $state.supervisorPid) { throw 'replacement launcher did not run' }
  [IO.File]::Delete((Join-Path $DataDir 'update-pending.json'))
  [IO.File]::WriteAllText((Join-Path $DataDir 'handoff-result.json'),(@{workerPid=$PID;launcherPid=$next.Id;supervisorPid=$state.supervisorPid;mutexReleased=$fresh;survived=$true}|ConvertTo-Json -Compress),$utf8)
} catch { [IO.File]::WriteAllText((Join-Path $DataDir 'handoff-error.txt'),($_.Exception.Message+' '+$_.ScriptStackTrace),$utf8) }
finally { $lock.Dispose() }
`);
    fs.writeFileSync(path.join(job,'plan.json'),JSON.stringify({version:'0.2.0',commit:'a'.repeat(40),oldLauncherPid:0}));
    if(recovery)fs.writeFileSync(path.join(data,'update-pending.json'),JSON.stringify({jobDir:job}));
    child=spawn(exe,['--script',supervisor,'--data',data],{windowsHide:true,stdio:'ignore',env:{...process.env,CODI_TEST_LAUNCHER:exe}});child.on('error',()=>{});child.on('close',()=>{childClosed=true;});remember(child);
    if(!recovery){
      const state=await until(()=>{const s=read(path.join(data,'launcher-state.json')),ready=read(path.join(data,'supervisor-ready.json'));return s&&ready?.pid===s.supervisorPid?s:null;},'initial supervisor');
      remember(state);
      assert.equal(state.updateHandoff,1);assert.equal(state.consoleAttached,false);
      fs.writeFileSync(path.join(job,'plan.json'),JSON.stringify({version:'0.2.0',commit:'a'.repeat(40),oldLauncherPid:state.pid}));
      fs.writeFileSync(path.join(data,'update-state.json'),JSON.stringify({status:'installing',version:'0.2.0'}));
      fs.writeFileSync(path.join(data,'update-request.json'),JSON.stringify({jobDir:job,command:'must never execute'}));
      fs.writeFileSync(path.join(data,'stop.request'),'stop');
    }
    const result=await until(()=>{const failure=path.join(data,'handoff-error.txt');if(fs.existsSync(failure))throw Error(fs.readFileSync(failure,'utf8'));return read(path.join(data,'handoff-result.json'));},'worker outside child job');
    remember(result);
    assert.equal(result.mutexReleased,true);assert.equal(result.survived,true);assert.notEqual(result.launcherPid,child.pid);assert.equal(alive(child.pid),false);assert.equal(alive(result.launcherPid),true);assert.equal(fs.existsSync(path.join(data,'update-request.json')),false);
    fs.writeFileSync(path.join(data,'stop.request'),'stop');await until(()=>[...ownedPids].every(pid=>!alive(pid)),'all fixture processes shutdown');
  } finally {
    for(const file of ['launcher-state.json','supervisor-ready.json','fixture-worker.json','handoff-result.json'])remember(read(path.join(data,file)));
    if([...ownedPids].some(alive)){
      fs.writeFileSync(path.join(data,'stop.request'),'stop');
      await until(()=>[...ownedPids].every(pid=>!alive(pid)),'cleanup fixture processes',5000).catch(async()=>{
        // These PIDs came only from this fixture's children and its own markers.
        for(const pid of ownedPids)if(alive(pid)){try{process.kill(pid);}catch{}}
        await until(()=>[...ownedPids].every(pid=>!alive(pid)),'terminate remaining fixture processes',5000);
      });
    }
    if(child)await until(()=>childClosed,'native child process handle close',5000);
    await removeFixture(dir);
  }
}
test('compiled Windows launcher starts updater outside its killed child job and released singleton mutex',()=>nativeFixture(false));
test('compiled Windows launcher recovers a pending worker after interruption without a new UI request',()=>nativeFixture(true));
