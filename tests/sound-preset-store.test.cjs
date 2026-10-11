const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {SoundStore}=require('../runtime/sounds.cjs'),{wav}=require('./audio-fixture.cjs');

async function fixture(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codi-sound-presets-'));
  try{const store=new SoundStore(path.join(root,'sounds'));await store.init();return await run(store,root);}
  finally{await fs.rm(root,{recursive:true,force:true});}
}
async function restart(store){const fresh=new SoundStore(store.root);await fresh.init();return fresh;}
async function upload(store,root){const file=path.join(root,'my-click.wav');await fs.writeFile(file,wav());const candidate=await store.stage(file);await store.select(candidate.id);return candidate;}

test('built-in selection persists and new stores default to the wooden preset',()=>fixture(async store=>{
  assert.deepEqual(await store.snapshot(),{custom:null,preset:'wood',source:'preset'});
  for(const preset of ['wood','bubble','bell','sparkle','tap']){
    assert.deepEqual(await store.selectPreset(preset),{custom:null,preset,source:'preset'});
    assert.deepEqual(await (await restart(store)).snapshot(),{custom:null,preset,source:'preset'});
  }
}));

test('switching presets retains the uploaded sound across restart and custom reselection',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  assert.deepEqual(await store.selectPreset('bell'),{custom,preset:'bell',source:'preset'});
  const fresh=await restart(store);
  assert.deepEqual(await fresh.snapshot(),{custom,preset:'bell',source:'preset'});
  assert.deepEqual((await fresh.asset(custom.id)).buffer,wav());
  assert.deepEqual(await fresh.select(custom.id),{custom,preset:'bell',source:'custom'});
  assert.deepEqual(await (await restart(fresh)).snapshot(),{custom,preset:'bell',source:'custom'});
  assert.equal((await fresh.selectPreset('tap')).custom.id,custom.id);
}));

test('removing an inactive upload preserves the selected preset after restart',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);await store.selectPreset('bell');
  assert.deepEqual(await store.select(null),{custom:null,preset:'bell',source:'preset'});
  await assert.rejects(fs.access(store.assetPath(custom.id)));
  assert.deepEqual(await (await restart(store)).snapshot(),{custom:null,preset:'bell',source:'preset'});
  assert.deepEqual(await fs.readFile(path.join(root,'my-click.wav')),wav());
}));

test('removing the selected upload restores the last chosen preset after restart',()=>fixture(async(store,root)=>{
  await store.selectPreset('bubble');const custom=await upload(store,root);
  const fresh=await restart(store);assert.equal((await fresh.snapshot()).source,'custom');
  assert.deepEqual(await fresh.select(null),{custom:null,preset:'bubble',source:'preset'});
  await assert.rejects(fs.access(fresh.assetPath(custom.id)));
  assert.deepEqual(await (await restart(fresh)).snapshot(),{custom:null,preset:'bubble',source:'preset'});
}));

test('legacy custom and null settings migrate without losing the uploaded file',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  await fs.writeFile(store.file,JSON.stringify({id:custom.id,name:custom.name}));
  const fresh=await restart(store);
  assert.deepEqual(await fresh.snapshot(),{custom,preset:'wood',source:'custom'});
  assert.deepEqual(await fresh.select(null),{custom:null,preset:'wood',source:'preset'});
  assert.equal(JSON.parse(await fs.readFile(fresh.file,'utf8')),null);
  await assert.rejects(fresh.asset(custom.id));
  assert.deepEqual(await (await restart(fresh)).snapshot(),{custom:null,preset:'wood',source:'preset'});
}));

test('invalid preset IDs never change the saved selection or uploaded sound',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);await store.selectPreset('sparkle');
  const persisted=await fs.readFile(store.file,'utf8');
  for(const preset of [null,undefined,'','WOOD','../bell','sound://local/'+custom.id,custom.id,{},[],1])await assert.rejects(store.selectPreset(preset));
  assert.equal(await fs.readFile(store.file,'utf8'),persisted);
  assert.deepEqual(await store.snapshot(),{custom,preset:'sparkle',source:'preset'});
  assert.deepEqual((await store.asset(custom.id)).buffer,wav());
}));

test('malformed persisted selection falls back safely while keeping a valid upload',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);
  for(const [record,expected] of [
    [{id:custom.id,name:custom.name,preset:'../sound',source:'preset'},{custom,preset:'wood',source:'preset'}],
    [{id:custom.id,name:custom.name,preset:'wood',source:'untrusted'},{custom,preset:'wood',source:'preset'}],
    [{id:'../secret',name:'bad.wav',preset:'bell',source:'custom'},{custom:null,preset:'bell',source:'preset'}],
    [{preset:'tap',source:'custom'},{custom:null,preset:'tap',source:'preset'}]
  ]){
    await fs.writeFile(store.file,JSON.stringify(record));
    // Keep the valid upload available for each independently corrupted record.
    await fs.writeFile(store.assetPath(custom.id),wav());
    const fresh=await restart(store);
    assert.deepEqual(await fresh.snapshot(),expected);
  }
}));

test('a failed settings write preserves the selected preset and retained upload',()=>fixture(async(store,root)=>{
  const custom=await upload(store,root);await store.selectPreset('bubble');
  await fs.unlink(store.file);await fs.mkdir(store.file);
  await assert.rejects(store.selectPreset('bell'));
  assert.deepEqual(await store.snapshot(),{custom,preset:'bubble',source:'preset'});
  assert.deepEqual((await store.asset(custom.id)).buffer,wav());
  assert.deepEqual((await fs.readdir(store.root)).filter(name=>name.endsWith('.tmp')),[]);
}));

test('preset IPC validates senders and serializes preset/custom choices with state broadcasts',()=>fixture(async(_store,root)=>{
  const file=path.join(root,'picked.wav');await fs.writeFile(file,wav());
  const handlers=new Map(),events=[],win={webContents:{send:(name,state)=>events.push({name,state})},isDestroyed:()=>false};
  const api={ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},protocol:{handle(){}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[file]})}};
  await require('../desktop/sounds.cjs').installSounds(win,root,api);
  const own={sender:win.webContents},foreign={sender:{}};
  assert.equal(typeof handlers.get('sound-preset'),'function');
  assert.equal((await handlers.get('sound-preset')(foreign,'bell')).ok,false);
  for(const id of ['../bell',null,{}])assert.equal((await handlers.get('sound-preset')(own,id)).ok,false);
  assert.equal(events.length,0);
  const {candidate}=await handlers.get('sound-import')(own,'en-US');
  const results=await Promise.all([
    handlers.get('sound-preset')(own,'bubble'),
    handlers.get('sound-select')(own,candidate.id),
    handlers.get('sound-preset')(own,'sparkle')
  ]);
  assert.ok(results.every(result=>result.ok));
  assert.deepEqual(events.map(event=>[event.name,event.state.preset,event.state.source]),[
    ['sound-state','bubble','preset'],['sound-state','bubble','custom'],['sound-state','sparkle','preset']
  ]);
  assert.deepEqual(await handlers.get('sound-read')(own),{custom:candidate,preset:'sparkle',source:'preset'});
  assert.deepEqual(await (await restart(_store)).snapshot(),{custom:candidate,preset:'sparkle',source:'preset'});
}));

test('preload exposes preset selection through the dedicated IPC channel',async()=>{
  let widget;const calls=[];
  const electron={contextBridge:{exposeInMainWorld:(name,value)=>{if(name==='widget')widget=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve({ok:true});}}};
  vm.runInNewContext(await fs.readFile(path.join(__dirname,'../desktop/preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return electron;}});
  assert.equal(typeof widget.soundPreset,'function');
  assert.equal((await widget.soundPreset('bell')).ok,true);
  assert.deepEqual(calls,[['sound-preset','bell']]);
});
