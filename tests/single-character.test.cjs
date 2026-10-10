const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CharacterStore}=require('../runtime/characters.cjs');
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-single-'));try{const store=new CharacterStore(path.join(root,'characters'));await store.init();await store.create('几何');await run(store,root);}finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}}
const png=()=>fs.readFile(path.resolve(__dirname,'fixtures/portrait-white.png'));
test('legacy image migration chooses the first existing priority file without changing any bytes',()=>fixture(async(store)=>{
  const dir=store.directory('几何'),bytes=await png();
  for(const state of ['exhausted','low','tired','ready']){
    await fs.writeFile(path.join(dir,state+'.png'),bytes);const settings=await fs.readFile(path.join(dir,'settings.json'));
    const snapshot=await store.snapshot();assert.equal(snapshot.characters[0].image.filename,state+'.png');
    assert.deepEqual((await store.asset('几何','portrait')).buffer,bytes);assert.deepEqual(await fs.readFile(path.join(dir,'settings.json')),settings);
    for(const name of await fs.readdir(dir))if(name.endsWith('.png'))assert.deepEqual(await fs.readFile(path.join(dir,name)),bytes);
  }
}));
test('tired-only metadata migrates, missing ready metadata falls back, and settings fields stay intact',()=>fixture(async(store)=>{
  const dir=store.directory('几何'),metadata={background:false,zoom:1.2,x:.1,y:0,targetHeight:320,images:{ready:'ready.png',tired:'tired.png'},notes:'keep old data'};
  await fs.writeFile(path.join(dir,'tired.png'),await png());await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(metadata));
  const before=await fs.readFile(path.join(dir,'settings.json')),snapshot=await store.snapshot();assert.equal(snapshot.characters[0].image.filename,'tired.png');assert.equal(snapshot.characters[0].settings.targetHeight,320);assert.deepEqual(await fs.readFile(path.join(dir,'settings.json')),before);
  await store.settings('几何',{zoom:1.4});const after=JSON.parse(await fs.readFile(path.join(dir,'settings.json'),'utf8'));assert.deepEqual(after.images,metadata.images);assert.equal(after.notes,'keep old data');
}));
test('single uploads select a new copy and retain all old files and source bytes across reload',()=>fixture(async(store,root)=>{
  const dir=store.directory('几何'),bytes=await png(),source=path.join(root,'source.jpg');await fs.writeFile(source,bytes);await fs.writeFile(path.join(dir,'ready.png'),bytes);await fs.writeFile(path.join(dir,'tired.png'),bytes);
  const initial=await fs.stat(source);await store.importPortrait('几何',source);const first=(await store.snapshot()).characters[0].image;
  await store.importPortrait('几何',source);const second=(await store.snapshot()).characters[0].image;assert.notEqual(first.filename,second.filename);
  for(const file of ['ready.png','tired.png',first.filename,second.filename])assert.deepEqual(await fs.readFile(path.join(dir,file)),bytes);
  const reload=new CharacterStore(store.root);await reload.init();assert.equal((await reload.snapshot()).characters[0].image.filename,second.filename);assert.deepEqual(await fs.readFile(source),bytes);assert.equal((await fs.stat(source)).mtimeMs,initial.mtimeMs);
  const fake=path.join(root,'fake.png');await fs.writeFile(fake,'text');await assert.rejects(store.importPortrait('几何',fake),/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);assert.equal((await reload.snapshot()).characters[0].image.filename,second.filename);
}));
