const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const serviceModule=()=>require('../runtime/update-service.cjs');
async function fixture(t,options={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'Codi update 中文 ')),data=path.join(root,'codex-quota-widget'),appRoot=path.join(root,'source');
  await fs.mkdir(data);await fs.mkdir(appRoot);t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(data,'installation.json'),JSON.stringify({sourceRoot:appRoot,marketplace:'personal'}));
  await fs.writeFile(path.join(data,'launcher-state.json'),JSON.stringify({pid:process.pid,updateHandoff:1,script:path.join(appRoot,'desktop','supervisor.ps1')}));
  const calls=[],states=[];
  const service=new (serviceModule().UpdateService)({data,appRoot,currentVersion:'0.2.0',platform:'win32',onChange:s=>states.push(s),prepareRelease:async({jobDir})=>{calls.push('download');await fs.mkdir(path.join(jobDir,'app'),{recursive:true});return {version:'0.3.0',commit:'a'.repeat(40),appRoot:path.join(jobDir,'app')};},prepareRuntime:async()=>{calls.push('runtime');return null;},...options});
  return {root,data,appRoot,calls,states,service};
}
test('stages before requesting shutdown, coalesces clicks, and writes pinned plan without changing preferences',async t=>{
  let release;const gate=new Promise(r=>release=r);
  const f=await fixture(t,{prepareRuntime:async()=>{await gate;return null;}});
  const prefs=path.join(f.data,'panel-preferences.json');await fs.writeFile(prefs,'{"widgetEnabled":true,"width":499}');
  assert.equal(f.service.start().ok,true);assert.equal(f.service.start().error,'update_in_progress');
  await new Promise(r=>setTimeout(r,40));assert.equal(await fs.access(path.join(f.data,'stop.request')).then(()=>true,()=>false),false);
  release();await f.service.task;
  const request=JSON.parse(await fs.readFile(path.join(f.data,'update-request.json'),'utf8'));
  const plan=JSON.parse(await fs.readFile(path.join(request.jobDir,'plan.json'),'utf8'));
  assert.equal(plan.commit,'a'.repeat(40));assert.equal(plan.version,'0.3.0');assert.equal(plan.previousVersion,'0.2.0');assert.equal(plan.oldLauncherPid,process.pid);
  assert.equal(await fs.readFile(prefs,'utf8'),'{"widgetEnabled":true,"width":499}');
  assert.equal(await fs.readFile(path.join(f.data,'stop.request'),'utf8'),'update');
  assert.equal(f.service.snapshot().status,'installing');
});
test('download and dependency failure leave running installation alone and allow retry',async t=>{
  const f=await fixture(t,{prepareRuntime:async()=>{throw Object.assign(Error('contains credentials / private diagnostics'),{code:'prepare_failed'});}});
  f.service.start();await f.service.task;
  assert.equal(f.service.snapshot().status,'failed');assert.equal(f.service.snapshot().error,'prepare_failed');
  assert.equal(await fs.access(path.join(f.data,'stop.request')).then(()=>true,()=>false),false);
  assert.equal(await fs.access(path.join(f.data,'update-request.json')).then(()=>true,()=>false),false);
  assert.equal(JSON.stringify(f.service.snapshot()).includes('credentials'),false);
  assert.equal(f.service.start().ok,true);await f.service.task;
});
test('unsupported old launcher cannot shut down a working installation',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.data,'launcher-state.json'),JSON.stringify({pid:process.pid}));
  f.service.start();await f.service.task;
  assert.equal(f.service.snapshot().error,'unsupported_installation');assert.deepEqual(f.calls,[]);
  assert.equal(await fs.access(path.join(f.data,'stop.request')).then(()=>true,()=>false),false);
});
test('interrupted prepare is reported while an active worker remains busy',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.data,'update-state.json'),JSON.stringify({status:'downloading',ownerPid:99999999,updatedAt:1}));
  const stale=new (serviceModule().UpdateService)({data:f.data,appRoot:f.appRoot,currentVersion:'0.2.0'});
  assert.equal(stale.snapshot().status,'failed');assert.equal(stale.snapshot().error,'prepare_failed');
  await fs.writeFile(path.join(f.data,'update-state.json'),JSON.stringify({status:'restarting',ownerPid:process.pid,version:'0.3.0',updatedAt:2}));
  const live=new (serviceModule().UpdateService)({data:f.data,appRoot:f.appRoot,currentVersion:'0.2.0'});
  assert.equal(live.snapshot().status,'restarting');assert.equal(live.start().error,'update_in_progress');
});
test('identical dependencies reuse runtime despite application version change',()=>{
  const a={version:'0.2.0',lockfileVersion:3,packages:{'':{version:'0.2.0',devDependencies:{electron:'44.3.0'}},'node_modules/electron':{version:'44.3.0',integrity:'abc'}}};
  const b=structuredClone(a);b.version='0.3.0';b.packages[''].version='0.3.0';
  assert.equal(serviceModule().sameDependencies(a,b),true);b.packages['node_modules/electron'].integrity='def';assert.equal(serviceModule().sameDependencies(a,b),false);
});
test('closing during staging never hands off or shuts down, even if preparation ignores abort',async t=>{
  let release;const gate=new Promise(r=>release=r);
  const f=await fixture(t,{prepareRuntime:async()=>{await gate;return null;}});
  f.service.start();await new Promise(r=>setTimeout(r,30));f.service.close();release();await f.service.task;
  assert.equal(f.service.snapshot().status,'failed');
  assert.equal(await fs.access(path.join(f.data,'stop.request')).then(()=>true,()=>false),false);
  assert.equal(await fs.access(path.join(f.data,'update-request.json')).then(()=>true,()=>false),false);
  assert.equal(f.service.start().ok,false);
});
test('failed shutdown request removes only its own handoff request',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.data,'stop.request'));
  f.service.start();await f.service.task;
  assert.equal(f.service.snapshot().status,'failed');
  assert.equal(await fs.access(path.join(f.data,'update-request.json')).then(()=>true,()=>false),false);
});
test('a disk failure publishing progress cannot leave the UI permanently busy',async t=>{
  const f=await fixture(t),syncFs=require('node:fs'),write=syncFs.writeFileSync;let stateWrites=0;
  syncFs.writeFileSync=function(file,...args){if(String(file).includes('update-state.json')&&++stateWrites>1)throw Object.assign(Error('disk unavailable'),{code:'EACCES'});return write.call(this,file,...args);};
  try{f.service.start();await f.service.task;assert.equal(f.service.snapshot().status,'failed');assert.equal(f.service.snapshot().error,'prepare_failed');assert.notEqual(f.service.start().error,'update_in_progress');}
  finally{syncFs.writeFileSync=write;}
});
test('a worker that dies after starting the new UI hands recovery back to the native launcher',async t=>{
  const f=await fixture(t),jobDir=path.join(f.data,'updates','interrupted');await fs.mkdir(jobDir,{recursive:true});
  await fs.writeFile(path.join(f.data,'update-pending.json'),JSON.stringify({jobDir}));
  await fs.writeFile(path.join(f.data,'update-state.json'),JSON.stringify({status:'restarting',ownerPid:99999999,version:'0.3.0',updatedAt:1}));
  f.service.recover();
  assert.equal(await fs.readFile(path.join(f.data,'stop.request'),'utf8'),'update');
  assert.equal(f.service.snapshot().status,'restarting');
});
test('terminal state left by a dead worker cannot block the next update forever',async t=>{
  const f=await fixture(t),jobDir=path.join(f.data,'updates','completed');await fs.mkdir(jobDir,{recursive:true});
  await fs.writeFile(path.join(f.data,'update-pending.json'),JSON.stringify({jobDir}));
  await fs.writeFile(path.join(f.data,'update-state.json'),JSON.stringify({status:'complete',ownerPid:99999999,version:'0.3.0',updatedAt:1}));
  assert.equal(f.service.start().error,'update_in_progress');
  assert.equal(await fs.readFile(path.join(f.data,'stop.request'),'utf8'),'update');
});
