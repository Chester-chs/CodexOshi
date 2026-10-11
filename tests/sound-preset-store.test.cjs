const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {SoundStore}=require('../runtime/sounds.cjs'),{wav}=require('./audio-fixture.cjs');

async function fixture(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codi-sound-default-'));
  try{const store=new SoundStore(path.join(root,'sounds'));await store.init();return await run(store,root);}
  finally{await fs.rm(root,{recursive:true,force:true});}
}
async function restart(store){const fresh=new SoundStore(store.root);await fresh.init();return fresh;}
async function upload(store,root){const file=path.join(root,'my-click.wav');await fs.writeFile(file,wav());const candidate=await store.stage(file);await store.select(candidate.id);return candidate;}

test('fresh and legacy built-in selections all load the starlight default',()=>fixture(async store=>{
  assert.deepEqual(await store.snapshot(),{custom:null,preset:'sparkle',source:'preset'});
  for(const record of [null,...['wood','bubble','bell','sparkle','tap'].map(preset=>({preset,source:'preset'}))]){
    await fs.writeFile(store.file,JSON.stringify(record));
    assert.deepEqual(await (await restart(store)).snapshot(),{custom:null,preset:'sparkle',source:'preset'});
  }
}));

test('switching to the default retains the uploaded sound across restart and custom reselection',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  assert.deepEqual(await store.select('builtin'),{custom,preset:'sparkle',source:'preset'});
  const fresh=await restart(store);
  assert.deepEqual(await fresh.snapshot(),{custom,preset:'sparkle',source:'preset'});
  assert.deepEqual((await fresh.asset(custom.id)).buffer,wav());
  assert.deepEqual(await fresh.select(custom.id),{custom,preset:'sparkle',source:'custom'});
  assert.deepEqual(await (await restart(fresh)).snapshot(),{custom,preset:'sparkle',source:'custom'});
}));

test('removing an inactive upload restores the default without changing the original file',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);await store.select('builtin');
  assert.deepEqual(await store.select(null),{custom:null,preset:'sparkle',source:'preset'});
  await assert.rejects(fs.access(store.assetPath(custom.id)));
  assert.deepEqual(await (await restart(store)).snapshot(),{custom:null,preset:'sparkle',source:'preset'});
  assert.deepEqual(await fs.readFile(path.join(root,'my-click.wav')),wav());
}));

test('legacy custom settings preserve the uploaded sound and migrate the fallback to starlight',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  for(const record of [{id:custom.id,name:custom.name},...['wood','bubble','bell','sparkle','tap'].map(preset=>({id:custom.id,name:custom.name,preset,source:'custom'}))]){
    await fs.writeFile(store.file,JSON.stringify(record));
    const fresh=await restart(store);
    assert.deepEqual(await fresh.snapshot(),{custom,preset:'sparkle',source:'custom'});
    assert.deepEqual((await fresh.asset(custom.id)).buffer,wav());
  }
  await store.select(null);
  assert.equal(JSON.parse(await fs.readFile(store.file,'utf8')),null);
  assert.deepEqual(await (await restart(store)).snapshot(),{custom:null,preset:'sparkle',source:'preset'});
}));

test('legacy built-in settings retain an inactive uploaded sound after migration',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  for(const preset of ['wood','bubble','bell','sparkle','tap']){
    await fs.writeFile(store.file,JSON.stringify({id:custom.id,name:custom.name,preset,source:'preset'}));
    const fresh=await restart(store);
    assert.deepEqual(await fresh.snapshot(),{custom,preset:'sparkle',source:'preset'});
    assert.deepEqual((await fresh.asset(custom.id)).buffer,wav());
  }
}));

test('invalid sound choices never change the saved selection or uploaded sound',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);const persisted=await fs.readFile(store.file,'utf8');
  for(const choice of [undefined,'','wood','sparkle','../bell','sound://local/'+custom.id,{},[],1])await assert.rejects(store.select(choice));
  assert.equal(await fs.readFile(store.file,'utf8'),persisted);
  assert.deepEqual(await store.snapshot(),{custom,preset:'sparkle',source:'custom'});
  assert.deepEqual((await store.asset(custom.id)).buffer,wav());
}));

test('malformed persisted selection falls back safely while keeping an independently valid upload',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  for(const [record,expected] of [
    [{id:custom.id,name:custom.name,preset:'../sound',source:'preset'},{custom,preset:'sparkle',source:'preset'}],
    [{id:custom.id,name:custom.name,preset:'wood',source:'untrusted'},{custom,preset:'sparkle',source:'preset'}],
    [{id:'../secret',name:'bad.wav',preset:'bell',source:'custom'},{custom:null,preset:'sparkle',source:'preset'}],
    [{preset:'tap',source:'custom'},{custom:null,preset:'sparkle',source:'preset'}]
  ]){
    await fs.writeFile(store.file,JSON.stringify(record));await fs.writeFile(store.assetPath(custom.id),wav());
    assert.deepEqual(await (await restart(store)).snapshot(),expected);
  }
}));

test('a failed default-switch write preserves the selected custom sound',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);await fs.unlink(store.file);await fs.mkdir(store.file);
  await assert.rejects(store.select('builtin'));
  assert.deepEqual(await store.snapshot(),{custom,preset:'sparkle',source:'custom'});
  assert.deepEqual((await store.asset(custom.id)).buffer,wav());
  assert.deepEqual((await fs.readdir(store.root)).filter(name=>name.endsWith('.tmp')),[]);
}));

test('sound IPC validates senders and serializes default/custom choices with state broadcasts',()=>fixture(async(_store,root)=>{
  const file=path.join(root,'picked.wav');await fs.writeFile(file,wav());
  const handlers=new Map(),events=[],win={webContents:{send:(name,state)=>events.push({name,state})},isDestroyed:()=>false};
  const api={ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},protocol:{handle(){}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[file]})}};
  await require('../desktop/sounds.cjs').installSounds(win,root,api);
  const own={sender:win.webContents},foreign={sender:{}};
  assert.equal((await handlers.get('sound-select')(foreign,'builtin')).ok,false);
  for(const id of ['wood','sparkle','../bell',{}])assert.equal((await handlers.get('sound-select')(own,id)).ok,false);
  assert.equal(events.length,0);
  const {candidate}=await handlers.get('sound-import')(own,'en-US');
  const results=await Promise.all([
    handlers.get('sound-select')(own,candidate.id),
    handlers.get('sound-select')(own,'builtin'),
    handlers.get('sound-select')(own,candidate.id)
  ]);
  assert.ok(results.every(result=>result.ok));
  assert.deepEqual(events.map(event=>[event.name,event.state.preset,event.state.source]),[
    ['sound-state','sparkle','custom'],['sound-state','sparkle','preset'],['sound-state','sparkle','custom']
  ]);
  assert.deepEqual(await handlers.get('sound-read')(own),{custom:candidate,preset:'sparkle',source:'custom'});
  assert.deepEqual(await (await restart(_store)).snapshot(),{custom:candidate,preset:'sparkle',source:'custom'});
}));
