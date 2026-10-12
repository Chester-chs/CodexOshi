const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function powershell(script,status=0){const out=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',"[Console]::OutputEncoding=New-Object Text.UTF8Encoding; $VerbosePreference='Continue'; "+script],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(out.status,status,out.stdout+'\n'+out.stderr);return out.stdout;}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-update-worker-'));try{return run(dir);}finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}}
test('start resolution follows a valid installed release using the explicit data directory and rejects an outside release',()=>fixture(dir=>{
  const data=path.join(dir,'custom data'),release=path.join(data,'releases','0.2.0-aaaaaaaaaaaa');fs.mkdirSync(path.join(release,'desktop'),{recursive:true});fs.writeFileSync(path.join(release,'desktop','supervisor.ps1'),'');
  fs.writeFileSync(path.join(data,'installation.json'),JSON.stringify({sourceRoot:root,activeRoot:release}));
  let script=`. ${quote(path.join(root,'scripts','common.ps1'))}; $actual=Get-CodiActiveRoot -DataDirectory ${quote(data)} -FallbackRoot ${quote(root)}; if($actual -ne ${quote(release)}) { throw 'Valid release ignored' };`;
  script+=`Write-JsonAtomic ${quote(path.join(data,'installation.json'))} @{sourceRoot=${quote(root)};activeRoot=${quote(dir)}}; if((Get-CodiActiveRoot -DataDirectory ${quote(data)} -FallbackRoot ${quote(root)}) -ne ${quote(root)}) { throw 'Outside release accepted' }`;
  powershell(script);
}));
function transactionFixture(dir){
  const data=path.join(dir,'codex home','codex-quota-widget'),job=path.join(data,'updates','job-1'),app=path.join(job,'app'),cache=path.join(dir,'codex home','plugins','cache','personal','codex-quota-widget','0.1.0');
  const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
  for(const f of ['desktop/supervisor.ps1','desktop/bridge-cleanup.ps1','desktop/main.cjs','desktop/WidgetLauncher.cs','scripts/common.ps1','scripts/start.ps1','scripts/stop.ps1','scripts/apply-update.ps1','runtime/mcp.cjs'])write(path.join(app,f),'candidate '+f);
  write(path.join(app,'package.json'),JSON.stringify({name:'codex-quota-widget',version:'0.2.0'}));write(path.join(app,'package-lock.json'),'{}');write(path.join(app,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-quota-widget',version:'0.1.0'}));write(path.join(app,'.mcp.json'),'{}');
  write(path.join(data,'installation.json'),JSON.stringify({sourceRoot:root,marketplace:'personal',installedAt:'original'}));write(path.join(data,'characters','art.png'),'keep artwork');write(path.join(data,'panel-preferences.json'),'keep settings');write(path.join(data,'desktop-runtime','node_modules','electron','dist','electron.exe'),'old runtime');write(path.join(job,'runtime','node_modules','electron','dist','electron.exe'),'new runtime');write(path.join(cache,'runtime','mcp.cjs'),'old cached code');write(path.join(cache,'unrelated.txt'),'keep cached extra');
  const plan={version:'0.2.0',previousVersion:'0.1.0',commit:'a'.repeat(40),appRoot:app,runtimeRoot:path.join(job,'runtime'),cacheRoot:cache,oldLauncherPid:0};write(path.join(job,'plan.json'),JSON.stringify(plan));
  return {data,job,app,cache,plan,write};
}
function harness(f,body){return `. ${quote(path.join(root,'scripts','apply-update.ps1'))} -DataDir ${quote(f.data)} -JobDir ${quote(f.job)}; function Get-ScheduledTask { return $null }; function Build-Launcher { return 'fixture-launcher.exe' }; function Start-CodiMonitor { param($Root,$DataDirectory) $script:startedRoot=$Root }; function Wait-UpdateMonitor { param($Root,$NotBefore) }; ${body}`;}
test('transaction installs a release without changing checkout or user data and preserves startup opt-out',()=>fixture(dir=>{
  const f=transactionFixture(dir);powershell(harness(f,`function Set-ScheduledTask { throw 'Startup opt-out changed' }; Invoke-CodiUpdate; if($script:startedRoot -notlike '*releases*') { throw 'Release not started' }`));
  const receipt=JSON.parse(fs.readFileSync(path.join(f.data,'installation.json'))),state=JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json')));assert.equal(receipt.sourceRoot,root);assert.equal(receipt.installedAt,'original');assert.match(receipt.activeRoot,/releases/);assert.equal(state.status,'complete');assert.ok(state.ownerPid>0);assert.equal(fs.readFileSync(path.join(f.cache,'runtime','mcp.cjs'),'utf8'),'candidate runtime/mcp.cjs');assert.equal(fs.readFileSync(path.join(f.cache,'unrelated.txt'),'utf8'),'keep cached extra');assert.equal(fs.readFileSync(path.join(f.data,'desktop-runtime','node_modules','electron','dist','electron.exe'),'utf8'),'new runtime');assert.equal(fs.readFileSync(path.join(f.data,'characters','art.png'),'utf8'),'keep artwork');assert.equal(fs.readFileSync(path.join(f.data,'panel-preferences.json'),'utf8'),'keep settings');assert.equal(fs.existsSync(path.join(f.data,'update-pending.json')),false);
}));
test('release without its pipe recovery helper is rejected before replacing the active installation',()=>fixture(dir=>{
  const f=transactionFixture(dir);
  fs.rmSync(path.join(f.app,'desktop','bridge-cleanup.ps1'));
  powershell(harness(f,'Invoke-CodiUpdate'));
  const state=JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json'),'utf8'));
  assert.equal(state.status,'failed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data,'installation.json'),'utf8')).activeRoot,undefined);
}));
test('Windows PowerShell installs a release whose BOMless UTF-8 manifest contains Chinese text',()=>fixture(dir=>{
  const f=transactionFixture(dir);
  // Use the release's real text: its UTF-8 bytes are invalid JSON under the
  // system ANSI code page used by Windows PowerShell's default Get-Content.
  const manifest=fs.readFileSync(path.join(root,'.codex-plugin','plugin.json'),'utf8').replace(/^\uFEFF/,'');
  assert.match(manifest,/桌面角色/);f.write(path.join(f.app,'.codex-plugin','plugin.json'),manifest);
  powershell(harness(f,'Invoke-CodiUpdate'));
  const state=JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json'),'utf8'));
  assert.equal(state.status,'complete','UTF-8 release metadata must not trigger install_failed');
  assert.equal(fs.readFileSync(path.join(f.cache,'.codex-plugin','plugin.json'),'utf8'),manifest);
}));
test('Windows PowerShell preserves Chinese installation paths through receipt resolution and journal recovery',()=>fixture(dir=>{
  const f=transactionFixture(path.join(dir,'中文 用户'));
  powershell(harness(f,'Invoke-CodiUpdate'));
  const receipt=JSON.parse(fs.readFileSync(path.join(f.data,'installation.json'),'utf8'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json'),'utf8')).status,'complete');
  assert.ok(fs.existsSync(path.join(receipt.activeRoot,'desktop','supervisor.ps1')));
  powershell(`. ${quote(path.join(root,'scripts','common.ps1'))}; if((Get-CodiActiveRoot -DataDirectory ${quote(f.data)} -FallbackRoot ${quote(root)}) -ne ${quote(receipt.activeRoot)}) { throw 'UTF-8 active release path was lost' }`);
  f.write(path.join(f.data,'update-pending.json'),JSON.stringify({jobDir:f.job}));
  powershell(harness(f,`Invoke-CodiUpdate; if($script:startedRoot -ne ${quote(receipt.activeRoot)}) { throw 'UTF-8 recovery path was lost' }`));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json'),'utf8')).status,'complete');
  assert.equal(fs.existsSync(path.join(f.data,'update-pending.json')),false);
}));
test('failed restart restores receipt, runtime and overwritten cache files, and removes newly introduced cache files',()=>fixture(dir=>{
  const f=transactionFixture(dir);powershell(harness(f,`$script:checks=0; function Wait-UpdateMonitor { param($Root,$NotBefore) $script:checks++; if($script:checks -eq 1) { throw 'candidate failed' } }; function Stop-UpdateMonitor {}; Invoke-CodiUpdate`));
  const receipt=JSON.parse(fs.readFileSync(path.join(f.data,'installation.json'))),state=JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json')));assert.equal(receipt.activeRoot,undefined);assert.equal(state.status,'failed');assert.equal(state.error,'install_failed');assert.equal(fs.readFileSync(path.join(f.cache,'runtime','mcp.cjs'),'utf8'),'old cached code');assert.equal(fs.existsSync(path.join(f.cache,'desktop','main.cjs')),false);assert.equal(fs.readFileSync(path.join(f.data,'desktop-runtime','node_modules','electron','dist','electron.exe'),'utf8'),'old runtime');
}));
test('worker rejects a staged path outside its job before copying or replacing files',()=>fixture(dir=>{
  const f=transactionFixture(dir);f.plan.appRoot=root;f.write(path.join(f.job,'plan.json'),JSON.stringify(f.plan));powershell(harness(f,'Invoke-CodiUpdate'));
  const state=JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json')));assert.equal(state.status,'failed');assert.equal(fs.readFileSync(path.join(f.cache,'runtime','mcp.cjs'),'utf8'),'old cached code');assert.equal(fs.existsSync(path.join(f.data,'releases')),false);
}));
test('existing machine-specific MCP configuration remains byte-identical',()=>fixture(dir=>{
  const f=transactionFixture(dir),config='{"local":"different user and cache path"}\r\n';f.write(path.join(f.cache,'.mcp.json'),config);powershell(harness(f,'Invoke-CodiUpdate'));assert.equal(fs.readFileSync(path.join(f.cache,'.mcp.json'),'utf8'),config);
}));
test('an interrupted transaction restores backups on its next invocation',()=>fixture(dir=>{
  const f=transactionFixture(dir);powershell(harness(f,`$script:save=\${function:Save-UpdateJournal}; function Save-UpdateJournal($Journal) { & $script:save $Journal; if($Journal.phase -eq 'restarting') { exit 77 } }; Invoke-CodiUpdate`),77);
  assert.equal(fs.readFileSync(path.join(f.cache,'runtime','mcp.cjs'),'utf8'),'candidate runtime/mcp.cjs');
  powershell(harness(f,'function Stop-UpdateMonitor {}; Invoke-CodiUpdate'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.data,'update-state.json'))).error,'install_failed');assert.equal(fs.readFileSync(path.join(f.cache,'runtime','mcp.cjs'),'utf8'),'old cached code');assert.equal(JSON.parse(fs.readFileSync(path.join(f.data,'installation.json'))).activeRoot,undefined);assert.equal(fs.existsSync(path.join(f.data,'releases','0.2.0-aaaaaaaaaaaa')),false);
}));
test('terminal journal recovery starts its monitor instead of leaving Codi stopped',()=>fixture(dir=>{
  const f=transactionFixture(dir);powershell(harness(f,'Invoke-CodiUpdate'));f.write(path.join(f.data,'update-pending.json'),JSON.stringify({jobDir:f.job}));
  powershell(harness(f,`Invoke-CodiUpdate; if($script:startedRoot -notlike '*releases*') { throw 'Completed recovery failed to start monitor' }`));assert.equal(fs.existsSync(path.join(f.data,'update-pending.json')),false);
}));
test('restart health requires current Electron version and fresh live process when Codex is running',()=>fixture(dir=>{
  const f=transactionFixture(dir);powershell(harness(f,`
    $before=[DateTime]::UtcNow.AddSeconds(-1)
    Write-JsonAtomic (Join-Path $DataDir 'launcher-state.json') @{pid=$PID;supervisorPid=$PID;script=(Join-Path ${quote(f.app)} 'desktop\\supervisor.ps1');startedAt=[DateTime]::UtcNow.ToString('o');updateHandoff=1}
    function Get-UpdateHostAlive { return $false }
    if(-not (Get-UpdateHealth ${quote(f.app)} $before)) { throw 'Healthy supervisor rejected while host absent' }
    function Get-UpdateHostAlive { return $true }
    if(Get-UpdateHealth ${quote(f.app)} $before) { throw 'Missing Electron accepted' }
    Write-JsonAtomic (Join-Path $DataDir 'window-state.json') @{pid=$PID;version='0.1.0';updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
    if(Get-UpdateHealth ${quote(f.app)} $before) { throw 'Wrong Electron version accepted' }
    Write-JsonAtomic (Join-Path $DataDir 'window-state.json') @{pid=$PID;version='0.2.0';updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
    if(-not (Get-UpdateHealth ${quote(f.app)} $before)) { throw 'Fresh current Electron rejected' }
    Write-JsonAtomic (Join-Path $DataDir 'window-state.json') @{pid=$PID;version='0.2.0';updatedAt=1}
    if(Get-UpdateHealth ${quote(f.app)} $before) { throw 'Stale Electron accepted' }
  `));
}));
