const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {wav}=require('./audio-fixture.cjs');
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'codi-custom-sound-'));try{const {SoundStore}=require('../runtime/sounds.cjs');const store=new SoundStore(path.join(root,'sounds'));await store.init();return await run(store,root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('upload is staged without changing the active sound; selection persists an independent local copy',()=>fixture(async(store,root)=>{
  const file=path.join(root,'喜欢的声音.wav'),bytes=wav();await fs.writeFile(file,bytes);
  assert.equal((await store.snapshot()).custom,null);
  const candidate=await store.stage(file);assert.equal(candidate.name,'喜欢的声音.wav');assert.equal((await store.snapshot()).custom,null);
  await store.select(candidate.id);await fs.unlink(file);
  const {SoundStore}=require('../runtime/sounds.cjs'),restart=new SoundStore(store.root);await restart.init();
  assert.equal((await restart.snapshot()).custom.id,candidate.id);assert.deepEqual((await restart.asset(candidate.id)).buffer,bytes);
  await restart.select(null);assert.equal((await restart.snapshot()).custom,null);
}));
test('invalid or oversized uploads cannot replace an existing sound or modify the original file',()=>fixture(async(store,root)=>{
  const good=path.join(root,'good.wav');await fs.writeFile(good,wav());const first=await store.stage(good);await store.select(first.id);
  const invalid=path.join(root,'fake.mp3');await fs.writeFile(invalid,'this is not audio');await assert.rejects(store.stage(invalid));
  const large=path.join(root,'large.wav');await fs.writeFile(large,Buffer.alloc(10*1024*1024+1));await assert.rejects(store.stage(large),/10 MiB/);
  assert.equal((await store.snapshot()).custom.id,first.id);assert.deepEqual(await fs.readFile(good),wav());
}));
test('discarding a failed decode preserves the previous sound and denies arbitrary asset paths',()=>fixture(async(store,root)=>{
  const source=path.join(root,'good.wav');await fs.writeFile(source,wav());const first=await store.stage(source);await store.select(first.id);
  const pending=await store.stage(source);await store.discard(pending.id);
  assert.equal((await store.snapshot()).custom.id,first.id);await assert.rejects(store.select(pending.id));
  for(const id of ['../good.wav','file:///C:/secret','',null])await assert.rejects(store.asset(id));
  await store.discard(first.id);assert.deepEqual((await store.asset(first.id)).buffer,wav());
}));

test('sound IPC denies foreign senders and the local protocol cannot read arbitrary files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codi-sound-ipc-'));
  try{const file=path.join(root,'picked.wav');await fs.writeFile(file,wav());const handlers=new Map(),protocols=new Map(),events=[],contents={},win={webContents:{...contents,send:(name,state)=>events.push({name,state})},isDestroyed:()=>false};let picks=0;
    const api={ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},protocol:{handle:(name,fn)=>protocols.set(name,fn)},dialog:{async showOpenDialog(){picks++;return {canceled:false,filePaths:[file]};}}};
    await require('../desktop/sounds.cjs').installSounds(win,root,api);
    const foreign={sender:{}},own={sender:win.webContents};assert.equal(await handlers.get('sound-read')(foreign),null);
    assert.equal((await handlers.get('sound-import')(foreign)).ok,false);assert.equal(picks,0);
    const imported=await handlers.get('sound-import')(own,'en-US');assert.equal(imported.ok,true);assert.equal(picks,1);
    const candidate=imported.candidate;assert.equal((await handlers.get('sound-read')(own)).custom,null);
    for(const url of ['sound://local/../secret','sound://other/'+candidate.id,candidate.url+'?path=secret'])assert.equal((await protocols.get('sound')({method:'GET',url})).status,404);
    const response=await protocols.get('sound')({method:'GET',url:candidate.url});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav());
    assert.equal((await handlers.get('sound-select')(foreign,candidate.id)).ok,false);assert.equal(events.length,0);
    assert.equal((await handlers.get('sound-select')(own,candidate.id)).ok,true);assert.equal(events.at(-1).state.custom.id,candidate.id);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
