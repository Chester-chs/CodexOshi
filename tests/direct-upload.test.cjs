const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CharacterStore}=require('../runtime/characters.cjs');
test('upload directly creates and selects a portrait role, then duplicate names preserve all existing images',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-direct-upload-'));
  try{
    const source=path.join(root,'几何.png'),bytes=await fs.readFile(path.join(__dirname,'fixtures/portrait-white.png'));await fs.writeFile(source,bytes);const stat=await fs.stat(source);
    const store=new CharacterStore(path.join(root,'characters'));await store.init();await store.uploadPortrait(source);
    const first=await store.snapshot();assert.equal(first.active,'几何');assert.equal(first.characters.length,1);assert.ok(first.characters[0].image);assert.deepEqual((await store.asset('几何','portrait')).buffer,bytes);
    await store.uploadPortrait(source);const second=await store.snapshot();assert.equal(second.active,'几何 2');assert.deepEqual(second.characters.map(c=>c.name),['几何','几何 2']);assert.equal(second.characters[0].image.filename,first.characters[0].image.filename);
    assert.deepEqual((await store.asset('几何 2','portrait')).buffer,bytes);assert.deepEqual(await fs.readFile(source),bytes);assert.equal((await fs.stat(source)).mtimeMs,stat.mtimeMs);
    const reload=new CharacterStore(store.root);await reload.init();assert.equal((await reload.snapshot()).active,'几何 2');
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
test('invalid direct uploads leave no empty role or changed active selection',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-direct-upload-'));
  try{
    const store=new CharacterStore(path.join(root,'characters'));await store.init();const fake=path.join(root,'fake.png');await fs.writeFile(fake,'not an image');await assert.rejects(store.uploadPortrait(fake),/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);assert.deepEqual(await store.snapshot(),{active:null,characters:[]});
    const large=path.join(root,'large.png');await fs.writeFile(large,Buffer.alloc(10*1024*1024+1));await assert.rejects(store.uploadPortrait(large),/10 MiB/);
    const bytes=await fs.readFile(path.join(__dirname,'fixtures/portrait-white.png'));bytes.writeUInt32BE(4097,16);await fs.writeFile(fake,bytes);await assert.rejects(store.uploadPortrait(fake),/4096px/);assert.deepEqual(await store.names(),[]);
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
test('automatic names remain safe for reserved and long source filenames',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-direct-upload-'));
  try{
    const store=new CharacterStore(path.join(root,'characters'));await store.init();const bytes=await fs.readFile(path.join(__dirname,'fixtures/portrait-white.png'));
    const source=path.join(root,'CON.jpeg.fixture');await fs.writeFile(source,bytes);await store.uploadPortrait(source);assert.ok((await store.snapshot()).characters[0].image);
    const long=path.join(root,'长'.repeat(90)+'.png');await fs.writeFile(long,bytes);await store.uploadPortrait(long);const q=await store.snapshot();assert.ok(q.active.length<=64);assert.equal(path.dirname(store.directory(q.active)),store.root);assert.ok(q.characters.every(c=>c.image));
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
