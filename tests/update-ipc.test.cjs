const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {installUpdates}=require('../desktop/updates.cjs');

async function fixture(t,state){
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'codi-update-ipc-'));
  if(state)await fs.writeFile(path.join(data,'update-state.json'),JSON.stringify(state));
  const handlers=new Map(),events=[];
  const win={destroyed:false,isDestroyed(){return this.destroyed;},webContents:{send(channel,value){events.push({channel,value});}}};
  // Only the Electron transport is represented here; the registered handlers,
  // UpdateService, state sanitization and filesystem effects are all real.
  const updates=installUpdates({win,data,ipcMain:{handle(channel,handler){handlers.set(channel,handler);}}});
  t.after(async()=>{updates.close();await fs.rm(data,{recursive:true,force:true});});
  return {data,win,events,call:(channel,event,...args)=>handlers.get(channel)(event,...args)};
}

test('a foreign renderer cannot read update state or start an installation',async t=>{
  const f=await fixture(t),foreign={sender:{send(){}}};
  assert.equal(f.call('update-read',foreign),null);
  assert.deepEqual(f.call('update-start',foreign),{ok:false});
  assert.deepEqual(await fs.readdir(f.data),[]);
  assert.deepEqual(f.events,[]);
});

test('a destroyed widget cannot start another update even with its former sender',async t=>{
  const f=await fixture(t),event={sender:f.win.webContents};f.win.destroyed=true;
  assert.equal(f.call('update-read',event),null);
  assert.deepEqual(f.call('update-start',event),{ok:false});
  assert.deepEqual(await fs.readdir(f.data),[]);
});

test('only the widget renderer can trigger dead-worker recovery through a state read',async t=>{
  const f=await fixture(t),jobDir=path.join(f.data,'updates','interrupted');
  await fs.mkdir(jobDir,{recursive:true});
  await fs.writeFile(path.join(f.data,'update-pending.json'),JSON.stringify({jobDir}));
  await fs.writeFile(path.join(f.data,'update-state.json'),JSON.stringify({status:'restarting',version:'0.3.0',ownerPid:99999999,updatedAt:1}));
  await fs.writeFile(path.join(f.data,'launcher-state.json'),JSON.stringify({pid:process.pid,updateHandoff:1}));
  assert.equal(f.call('update-read',{sender:{}}),null);
  assert.equal(await fs.access(path.join(f.data,'stop.request')).then(()=>true,()=>false),false);
  assert.equal(f.call('update-read',{sender:f.win.webContents}).status,'restarting');
  assert.equal(await fs.readFile(path.join(f.data,'stop.request'),'utf8'),'update');
});

test('trusted update reads expose public state without process ids or installation paths',async t=>{
  const f=await fixture(t,{status:'complete',version:'0.3.0',updatedAt:123,ownerPid:process.pid,jobDir:'C:\\private\\job',error:'private diagnostics'});
  assert.deepEqual(f.call('update-read',{sender:f.win.webContents}),{status:'complete',version:'0.3.0',updatedAt:123});
});

test('renderer-supplied update paths and versions cannot bypass installation validation',async t=>{
  // With no receipt or launcher this must fail before network/download/handoff.
  const f=await fixture(t),event={sender:f.win.webContents};
  const result=f.call('update-start',event,{data:'C:\\injected',appRoot:'C:\\injected',version:'999.0.0',url:'https://example.invalid/payload',platform:'win32'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(result.ok,true);
  assert.equal(f.call('update-read',event).status,'failed');
  assert.equal(f.call('update-read',event).error,'unsupported_installation');
  assert.equal(f.call('update-read',event).version,undefined);
  assert.deepEqual(await fs.readdir(f.data),['update-state.json']);
  assert.deepEqual(f.events.map(item=>[item.channel,item.value.status]),[['update-state','preparing'],['update-state','failed']]);
  assert.equal(f.events.some(item=>JSON.stringify(item).includes('injected')),false);
});
