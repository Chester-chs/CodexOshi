const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CharacterStore,imageInfo,STATES}=require('../runtime/characters.cjs');
const fixture=name=>path.join(__dirname,'fixtures',name);
test('JPEG baseline/progressive and BMP dimensions are detected from content',async()=>{
  for(const [file,ext,mime] of [['geometry.jpg','jpg','image/jpeg'],['geometry-progressive.jpeg','jpg','image/jpeg'],['geometry.bmp','bmp','image/bmp']]){
    const b=await fs.readFile(fixture(file));assert.deepEqual(imageInfo(b),{width:63,height:47,ext,mime});
    for(const size of [0,2,12,26])assert.throws(()=>imageInfo(b.subarray(0,size)),/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);
  }
  const bmp=await fs.readFile(fixture('geometry.bmp'));bmp.writeInt32LE(-47,22);assert.equal(imageInfo(bmp).height,47);
  bmp.writeInt32LE(4097,18);assert.throws(()=>imageInfo(bmp),/4096/);
  const core=Buffer.alloc(26);core.write('BM');core.writeUInt32LE(26,10);core.writeUInt32LE(12,14);core.writeUInt16LE(63,18);core.writeUInt16LE(47,20);core.writeUInt16LE(1,22);core.writeUInt16LE(24,24);assert.equal(imageInfo(core).width,63);
  const giantJpeg=Buffer.from([255,216,255,192,0,11,8,0,47,16,1,1,1,17,0]);assert.throws(()=>imageInfo(giantJpeg),/4096/);
  assert.throws(()=>imageInfo(Buffer.from([255,216,255,224,255,255])),/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);
});
test('all four JPEG states survive reload; mislabeled images import without changing originals',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-formats-'));
  try{
    const store=new CharacterStore(path.join(root,'characters'));await store.init();await store.create('几何');
    const bytes=await fs.readFile(fixture('geometry.jpg')),source=path.join(root,'original.jpeg');await fs.writeFile(source,bytes);const before=await fs.stat(source);
    for(const state of STATES)await store.importFile('几何',state,source);
    const reload=new CharacterStore(store.root);await reload.init();assert.equal((await reload.snapshot()).characters[0].image.filename,'ready.jpg');
    for(const state of STATES){const q=await reload.asset('几何',state);assert.equal(q.mime,'image/jpeg');assert.deepEqual(q.buffer,bytes);}
    assert.deepEqual(await fs.readFile(source),bytes);assert.equal((await fs.stat(source)).mtimeMs,before.mtimeMs);
    const png=await fs.readFile(path.resolve(__dirname,'../assets/placeholder-ready.png'));
    for(const name of ['renamed.jpg','unexpected.dat']){const file=path.join(root,name);await fs.writeFile(file,png);assert.equal((await reload.importFile('几何','ready',file)).ext,'png');assert.deepEqual(await fs.readFile(file),png);}
    await reload.importFile('几何','ready',fixture('geometry.bmp'));assert.equal((await reload.asset('几何','ready')).mime,'image/bmp');
    const fake=path.join(root,'text.png');await fs.writeFile(fake,'This is text, not an image.');await assert.rejects(reload.importFile('几何','ready',fake),/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);assert.equal((await reload.asset('几何','ready')).mime,'image/bmp');
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
