const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareImage}=require('../desktop/ui/image-processing.js');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CharacterStore}=require('../runtime/characters.cjs');

test('right docking trims only transparent columns in a close-up and keeps every visible pixel',()=>{
  const {horizontalRows}=require('../desktop/ui/image-processing.js'),{portraitFrame}=require('../desktop/ui/portrait-size.js');
  const width=12,height=16,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=y<8?3:0;x<(y<8?9:12);x++)data[(y*width+x)*4+3]=255;
  const rows=horizontalRows({data,width,height},{x:0,y:0,width,height});
  const close=portraitFrame(200,200,12,16,{zoom:2,x:-1},true,rows);
  assert.deepEqual(close,{x:104,y:36,width:96,height:128,source:{x:3,y:0,width:6,height:8}});
  const full=portraitFrame(200,200,12,16,{zoom:1},true,rows);assert.equal(full.source.width,12);assert.equal(full.source.x,0);assert.equal(full.x+full.width,200);
  const free=portraitFrame(200,200,12,16,{zoom:2,x:-1},false,rows);assert.equal(free.width,192);assert.equal(free.source.width,12);
});

test('docked artwork and footer align to the actual right edge without stretching or cropping sides',()=>{
  const {portraitFrame,portraitFooter}=require('../desktop/ui/portrait-size.js');
  for(const zoom of [.5,1,2,4])for(const x of [-1,0,1])for(const width of [126,400,672]){
    const frame=portraitFrame(width,228,627,882,{zoom,x},true);
    assert.ok(Math.abs(frame.x+frame.width-width)<1e-8,'The artwork, not its transparent canvas, must touch the right edge');
    const footer=portraitFooter(frame,width,width,true);assert.ok(Math.abs(footer.x+footer.width-width)<1e-8);
    assert.ok(frame.x>=0);assert.ok(Math.abs(frame.width/frame.height-627/(882/Math.max(1,zoom)))<1e-8);
  }
  assert.deepEqual(portraitFooter({x:390,width:10},400,400,true),{x:282,width:118});
});

test('restoring geometry defaults removes explicit width while retaining artwork and background',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'codi-reset-'));
  try{
    const store=new CharacterStore(dir);await store.init();await store.create('A');await store.create('B');await store.select('A');
    await store.settings('A',{zoom:4,x:1,y:-1,targetHeight:420,targetWidth:672,background:false});await store.importPortrait('A',path.join(__dirname,'fixtures/portrait-white.png'));
    const before=await store.metadata('A'),other=await store.metadata('B');
    await store.settings('A',{zoom:1,x:0,y:0,targetHeight:280,targetWidth:null});
    const restart=new CharacterStore(dir);await restart.init();const restored=await restart.read('A'),raw=await restart.metadata('A');
    assert.equal(restored.targetHeight,280);assert.equal(restored.zoom,1);assert.equal(restored.x,0);assert.equal(restored.y,0);assert.equal(Object.hasOwn(raw,'targetWidth'),false);
    assert.equal(restored.background,false);assert.equal(restored.portrait,before.portrait);assert.deepEqual(await restart.metadata('B'),other);assert.equal(restart.active,'A');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('footer follows the rendered artwork instead of the unused canvas width at high DPI',()=>{
  const {portraitFooter}=require('../desktop/ui/portrait-size.js');
  assert.equal(typeof portraitFooter,'function');
  assert.deepEqual(portraitFooter({x:120,width:360},900,600),{x:80,width:240});
  assert.deepEqual(portraitFooter({x:360,width:720},1200,600),{x:180,width:360});
});

test('footer keeps narrow artwork controls readable and restores bounds without a bitmap',()=>{
  const {portraitFooter}=require('../desktop/ui/portrait-size.js');
  assert.equal(typeof portraitFooter,'function');
  assert.deepEqual(portraitFooter({x:195,width:10},400,400),{x:141,width:118});
  assert.deepEqual(portraitFooter({x:4,width:10},400,400),{x:0,width:118});
  assert.deepEqual(portraitFooter({x:76,width:10},90,90),{x:8,width:82});
  assert.deepEqual(portraitFooter(null,600,400),{x:4,width:392});
});
test('full portrait at fit scale keeps every edge and panning stays within unused space',()=>{
  const {portraitFrame}=require('../desktop/ui/portrait-size.js');
  for(const [width,height] of [[90,128],[199,228],[300,368],[672,1]])for(const [bw,bh] of [[627,882],[100,1],[1,100]])for(const settings of [{zoom:1,x:-.025,y:.756},{zoom:1,x:1,y:-1},{zoom:.5,x:-1,y:1}]){
    const r=portraitFrame(width,height,bw,bh,settings);
    assert.ok(r.x>=0&&r.y>=0);assert.ok(r.x+r.width<=width+1e-8);assert.ok(r.y+r.height<=height+1e-8);
    assert.ok(Math.abs(r.width/r.height-bw/bh)<1e-8,'full-image aspect ratio must survive');
  }
  assert.deepEqual(portraitFrame(200,300,100,200,{zoom:1,x:0,y:1}),{x:27,y:4,width:146,height:292});
});
test('zoom can frame the upper half without moving the drawn viewport onto the footer',()=>{
  const {portraitFrame}=require('../desktop/ui/portrait-size.js');
  const r=portraitFrame(200,300,100,200,{zoom:2,x:0,y:1});
  assert.ok(r.source,'enlarged view must crop the chosen source area');assert.equal(r.source.y,0);assert.equal(r.source.height,100);
  assert.equal(r.source.x,0);assert.equal(r.source.width,100);assert.equal(r.width,192);assert.equal(r.height,192);
  for(const x of [-1,0,1])for(const y of [-1,0,1]){const q=portraitFrame(200,300,100,200,{zoom:4,x,y});assert.equal(q.source.x,0);assert.equal(q.source.y,0);assert.equal(q.source.width,100);assert.equal(q.source.height,50);assert.ok(q.x>=0&&q.y>=0);assert.ok(q.x+q.width<=200+.001);assert.ok(q.y+q.height<=300+.001);}
});
test('upper-body layout grows horizontally while staying within existing native caps',()=>{
  const {portraitSize,portraitContentSize}=require('../desktop/ui/portrait-size.js');
  assert.equal(typeof portraitContentSize,'function');
  assert.deepEqual(portraitContentSize(627,882,2),{width:627,height:441});assert.deepEqual(portraitContentSize(627,882,4),{width:627,height:220.5});
  assert.deepEqual(portraitSize(627,441,280),{width:398,height:280});
  for(const z of [.5,1,1.5,2,3])for(const [w,h]of [[627,882],[4096,1],[1,4096]]){const c=portraitContentSize(w,h,z),r=portraitSize(c.width,c.height,420);assert.ok(r.width<=672&&r.height<=420);}
});
test('close-up framing retains target height at its width cap and visibly enlarges the portrait',()=>{
  const {portraitSize,portraitFrame,stageHeight}=require('../desktop/ui/portrait-size.js');
  assert.deepEqual(portraitSize(627,220.5,280,true),{width:448,height:280});
  const medium=portraitFrame(398,stageHeight(280),627,882,{zoom:2}),close=portraitFrame(448,stageHeight(280),627,882,{zoom:4});
  assert.ok(close.width/627>medium.width/627*1.3,'close-up must enlarge the actual drawing');assert.equal(close.source.height,220.5);assert.equal(close.source.width,627);
});
test('main accepts bounded close-up size reports and rejects invalid zoom values',async()=>{
  const {mainHarness}=require('./main-harness.cjs'),h=await mainHarness();
  const value={contentWidth:627,contentHeight:220.5,targetHeight:280,zoom:4};h.ipc('character-size',value);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(characterSize)')),{width:448,height:280});
  const before=h.shapes.length;for(const zoom of [4.01,-1,NaN,Infinity,'4'])h.ipc('character-size',{...value,zoom});assert.equal(h.shapes.length,before);
});
test('explicit resident width survives framing changes without distorting the saved height',async()=>{
  const {mainHarness}=require('./main-harness.cjs'),h=await mainHarness();
  for(const zoom of [1,2,4]){h.ipc('character-size',{contentWidth:627,contentHeight:882/zoom,targetHeight:301,targetWidth:240,zoom});assert.deepEqual(JSON.parse(h.run('JSON.stringify(characterSize)')),{width:240,height:301});}
  const before=h.shapes.length;for(const targetWidth of [125,673,200.5,NaN,'240'])h.ipc('character-size',{contentWidth:627,contentHeight:220.5,targetHeight:301,targetWidth,zoom:4});assert.equal(h.shapes.length,before);
});
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
    await store.settings('A',{zoom:4});assert.equal((await reload.read('A')).zoom,4);await assert.rejects(store.settings('A',{zoom:4.01}));
    await store.settings('A',{targetWidth:240});assert.equal((await reload.read('A')).targetWidth,240);for(const targetWidth of [125,673,240.5,'240'])await assert.rejects(store.settings('A',{targetWidth}));
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
