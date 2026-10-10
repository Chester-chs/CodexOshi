const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareImage}=require('../desktop/ui/image-processing.js');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CharacterStore}=require('../runtime/characters.cjs');
test('content ratio determines dimensions, with bounded width and global fallback for extreme proportions',()=>{
  const {portraitSize}=require('../desktop/ui/portrait-size.js');
  assert.deepEqual(portraitSize(627,882,280),{width:199,height:280});
  assert.deepEqual(portraitSize(631,882,420),{width:300,height:420});
  assert.deepEqual(portraitSize(2,1,280),{width:448,height:224});
  assert.deepEqual(portraitSize(1,2,180),{width:90,height:180});
  assert.deepEqual(portraitSize(1,100,420),{width:189,height:420});
  assert.deepEqual(portraitSize(100,1,420),{width:672,height:48});
  for(const bad of [NaN,Infinity,0,-1,5000])assert.deepEqual(portraitSize(bad,882,280),{width:199,height:280});
});
function whiteCoat(){const width=12,height=16,data=new Uint8ClampedArray(width*height*4).fill(255);for(let y=3;y<=12;y++)for(let x=3;x<=8;x++)if(y===3||y===12||x===3||x===8)data.set([30,50,80,255],(y*width+x)*4);return {width,height,data};}
test('white margins trim from outer rows/columns while an enclosed white garment survives even with removal off',()=>{
  const image=whiteCoat(),before=Buffer.from(image.data),p=prepareImage(image,false);
  assert.deepEqual(p.bounds,{x:3,y:3,width:6,height:10});assert.equal(p.data[(6*12+5)*4+3],255);assert.equal(p.data[(6*12+5)*4],255);assert.deepEqual(Buffer.from(image.data),before);
  const q=prepareImage(image,true);assert.deepEqual(q.bounds,p.bounds);assert.equal(q.data[(6*12+5)*4+3],255);
  const uniform={width:4,height:4,data:new Uint8ClampedArray(64).fill(255)};assert.deepEqual(prepareImage(uniform,false).bounds,{x:0,y:0,width:4,height:4});
  const busy=whiteCoat();busy.data.set([25,50,80,255],0);assert.equal(prepareImage(busy,false).bounds.x,0);assert.equal(prepareImage(busy,false).bounds.y,0);
  const tinted=whiteCoat();for(let i=0;i<tinted.data.length;i+=4)if(tinted.data[i]===255)tinted.data.set([239,255,255,255],i);assert.equal(prepareImage(tinted,false).bounds.width,12);
});
test('target height persists per role and invalid values cannot enlarge the overlay',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-portrait-'));try{
    const store=new CharacterStore(root);await store.init();await store.create('A');await store.settings('A',{targetHeight:420});await store.create('B');
    assert.equal((await store.read('B')).targetHeight,280);await store.select('A');const reload=new CharacterStore(root);await reload.init();assert.equal((await reload.read('A')).targetHeight,420);
    for(const value of [179,421,Infinity,NaN,'280'])await assert.rejects(store.settings('A',{targetHeight:value}));
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
