const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CharacterStore}=require('../runtime/characters.cjs');

test('replacing a live character root with a direct link cannot authorize outside deletion',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'codexoshi-audit-'));
  const root=path.join(temp,'characters'),external=path.join(temp,'outside');
  t.after(async()=>{await fs.unlink(root).catch(()=>{});assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});});
  await fs.mkdir(path.join(external,'safe'),{recursive:true});
  const keep=path.join(external,'safe','keep.txt');await fs.writeFile(keep,'original');
  const store=new CharacterStore(root);await store.init();
  await fs.rmdir(root);await fs.symlink(external,root,process.platform==='win32'?'junction':'dir');
  await assert.rejects(store.remove('safe'),/链接/);
  assert.equal(await fs.readFile(keep,'utf8'),'original');
});

test('a canonical parent alias remains a supported character storage location',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'codexoshi-parent-alias-'));
  const real=path.join(temp,'real'),alias=path.join(temp,'alias');
  t.after(async()=>{await fs.unlink(alias).catch(()=>{});assert.equal(path.dirname(temp),os.tmpdir());await fs.rm(temp,{recursive:true,force:true});});
  await fs.mkdir(real);await fs.symlink(real,alias,process.platform==='win32'?'junction':'dir');
  const store=new CharacterStore(path.join(alias,'characters'));await store.init();
  await store.create('safe');
  assert.deepEqual(await store.names(),['safe']);
  await store.remove('safe');
  assert.deepEqual(await store.names(),[]);
});
