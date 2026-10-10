const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CharacterStore,imageInfo}=require('../runtime/characters.cjs');
const {characterState,characterView}=require('../desktop/ui/character-view.js');
const {prepareImage}=require('../desktop/ui/image-processing.js');
test('quota states follow weakest window, unknown stays neutral, and recovered quota is ready',()=>{
  for(const [n,state] of [[100,'ready'],[50,'tired'],[21,'tired'],[20,'low'],[6,'low'],[5,'exhausted'],[0,'exhausted']])assert.equal(characterState([{remainingPercent:n}]),state);
  assert.equal(characterState([]),null);assert.equal(characterState([{remainingPercent:null}]),null);
  assert.equal(characterState([{remainingPercent:90},{remainingPercent:3}]),'exhausted');
  const role={images:{ready:{url:'local-ready'},low:{url:'local-low'}},settings:{zoom:1.4,x:.1,y:-.2,background:true}};
  assert.equal(characterView(role,'low').url,'local-low');assert.equal(characterView(role,'low').fallback,false);
  assert.equal(characterView(role,'tired').url,'local-ready');assert.equal(characterView(role,'tired').fallback,true);
  assert.match(characterView(role,null).url,/placeholder/);assert.notEqual(characterView(role,'exhausted').filter,characterView(role,'tired').filter);
});
function pixels(w,h,color){return {width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>color).flat())};}
test('transparent bounds crop; border-connected background removes and feathers without changing input',()=>{
  const image=pixels(9,9,[255,255,255,255]);for(let y=3;y<6;y++)for(let x=3;x<6;x++)image.data.set([30,80,150,255],(y*9+x)*4);
  const original=Buffer.from(image.data);const on=prepareImage(image,true);assert.equal(on.backgroundRemoved,true);assert.deepEqual(on.bounds,{x:3,y:3,width:3,height:3});
  assert.equal(on.data[3],0);assert.deepEqual(Buffer.from(image.data),original);assert.equal(prepareImage(image,false).bounds.width,9);
  const transparent=pixels(9,9,[0,0,0,0]);transparent.data.set([10,20,30,255],(4*9+4)*4);assert.deepEqual(prepareImage(transparent,false).bounds,{x:4,y:4,width:1,height:1});
  const busy=pixels(8,8,[0,0,0,255]);for(let y=0;y<8;y++)for(let x=0;x<8;x++)busy.data.set([(x*61)%256,(y*67)%256,((x+y)*71)%256,255],(y*8+x)*4);
  assert.equal(prepareImage(busy,true).backgroundRemoved,false);
  const white=pixels(4,4,[255,255,255,255]);assert.equal(prepareImage(white,true).backgroundRemoved,false,'do not erase an entirely uniform image');
});
test('background flood keeps enclosed matching foreground, and tolerance creates feathered pixels',()=>{
  const image=pixels(7,7,[255,255,255,255]);for(let y=1;y<6;y++)for(let x=1;x<6;x++)if(x===1||x===5||y===1||y===5)image.data.set([0,0,0,255],(y*7+x)*4);
  image.data.set([229,229,229,255],(0*7+3)*4);const q=prepareImage(image,true);
  assert.equal(q.data[(3*7+3)*4+3],255);assert.ok(q.data[3*4+3]>0&&q.data[3*4+3]<255);
});
async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'widget-character-'));try{await run(dir);}finally{assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true});}}
// Tiny valid PNG; its source stays outside the managed character directory.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
test('create, copy four states, rename, switch, persist framing, and delete only managed role',()=>fixture(async dir=>{
  const store=new CharacterStore(path.join(dir,'characters'));await store.init();await store.create('几何示例');
  const file=path.join(dir,'original.png');await fs.writeFile(file,png);const before=await fs.stat(file);
  for(const state of ['ready','tired','low','exhausted'])await store.importFile('几何示例',state,file);
  assert.deepEqual(await fs.readFile(file),png);assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);
  assert.deepEqual(await fs.readFile(path.join(dir,'characters','几何示例','low.png')),png);
  await store.settings('几何示例',{zoom:1.5,x:.2,y:-.1,background:false});await store.rename('几何示例','新名字');await store.create('另一角色');await store.select('新名字');
  const reload=new CharacterStore(path.join(dir,'characters'));await reload.init();const q=await reload.snapshot();assert.equal(q.active,'新名字');assert.equal(q.characters.find(c=>c.name===q.active).settings.zoom,1.5);
  assert.match(q.characters.find(c=>c.name==='新名字').images.ready.url,/^character:\/\/local\//);await reload.remove('新名字');assert.equal((await reload.snapshot()).active,'另一角色');assert.deepEqual(await fs.readFile(file),png);
}));
test('invalid names, oversized files, giant dimensions, unsupported data and links cannot escape storage',()=>fixture(async dir=>{
  const store=new CharacterStore(path.join(dir,'characters'));await store.init();for(const name of ['../escape','CON','a/b','bad.',''])await assert.rejects(store.create(name));await store.create('safe');
  const huge=path.join(dir,'huge.png');await fs.writeFile(huge,Buffer.alloc(10*1024*1024+1));await assert.rejects(store.importFile('safe','ready',huge),/10 MiB/);
  const giant=Buffer.from(png);giant.writeUInt32BE(5000,16);assert.throws(()=>imageInfo(giant),/4096/);assert.throws(()=>imageInfo(Buffer.from('text')),/PNG|WebP|GIF/);
  await assert.rejects(store.settings('safe',{zoom:Infinity}));await assert.rejects(store.remove('../escape'));await assert.rejects(store.importFile('safe','bogus',huge));
  const outside=path.join(dir,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'preserve');await fs.symlink(outside,path.join(dir,'characters','linked'),process.platform==='win32'?'junction':'dir');await assert.rejects(store.remove('linked'));assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'preserve');
}));
