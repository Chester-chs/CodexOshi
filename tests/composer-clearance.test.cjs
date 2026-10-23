const {test}=require('node:test'),assert=require('node:assert/strict');
const {inputInset,layout,residentSize}=require('../desktop/geometry.cjs');
const {mainHarness}=require('./main-harness.cjs');
const sample=(x,y,width,height,vw=1240,vh=840)=>({x,y,width,height,viewportWidth:vw,viewportHeight:vh});
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('the reported narrow-window composer stays clear of the whole pinned widget',()=>{
 const composer=sample(392,724,737,99),size=residentSize({width:257,height:365},1240,840,true,{width:1920,height:1040});
 const inset=inputInset(840,1240,size,composer),r=layout(null,1240,840,false,0,size,undefined,null,false,inset).regions[0];
 assert.equal(overlaps(r,composer),false);assert.equal(r.y+r.height,composer.y-12);assert.equal(r.x+r.width,1216);
});
test('wide windows keep their low placement; growing and shrinking the composer changes only required clearance',()=>{
 const size={width:257,height:365};assert.equal(inputInset(1032,1920,size,sample(735,914,737,98,1920,1032)),24);
 assert.equal(inputInset(840,1240,size,sample(392,724,737,99)),128);
 assert.equal(inputInset(840,1240,size,sample(392,550,737,273)),302);
 assert.equal(inputInset(840,1240,size,null),24);
});
test('physical UIA bounds map to DIP and a pending resize scales the last measurement',()=>{
 assert.equal(inputInset(840,1240,{width:166,height:236},sample(588,1086,1105.5,148.5,1860,1260)),128);
 assert.equal(inputInset(420,620,{width:83,height:118},sample(392,724,737,99)),70);
});
test('invalid input bounds cannot throw or move the widget arbitrarily',()=>{
 for(const c of [{},sample(-1,724,737,99),sample(392,NaN,737,99),sample(392,724,3000,99),sample(392,724,737,99,0,840)])
  assert.equal(inputInset(840,1240,{width:166,height:236},c),24);
});
test('a narrow horizontal gap is not an overlap and must not lift the widget',()=>{
 assert.equal(inputInset(840,1240,{width:166,height:236},sample(392,724,653,99)),24);
});
test('pinning consumes live composer bounds and unpinning keeps the avoided rectangle',async()=>{
 const h=await mainHarness(undefined,{prepare:false});
 h.run(`screen.getDisplayMatching=()=>({workAreaSize:{width:1920,height:1040}});ready=true;host={attached:true,visible:true,dpi:96,bounds:{width:1240,height:840},composer:${JSON.stringify(sample(392,724,737,99))}};dip={width:1240,height:840};characterSize={width:257,height:365};updateShape();`);
 const read=()=>JSON.parse(h.run('JSON.stringify(region[0])')),pinned=read();assert.equal(pinned.y+pinned.height,712);
 await h.ipc('panel-dock',false);assert.deepEqual(read(),pinned);
 await h.ipc('panel-dock',true);assert.deepEqual(read(),pinned);
 h.run('host.composer.y=600;host.composer.height=223;updateShape()');assert.equal(read().y+read().height,588);
 h.run('host.composer=null;dip={width:1920,height:1032};updateShape()');assert.equal(read().y+read().height,1008);
});
test('unpin also preserves dimensions when a tall composer required additional fitting',async()=>{
 const h=await mainHarness(undefined,{prepare:false});
 h.run(`screen.getDisplayMatching=()=>({workAreaSize:{width:1920,height:1040}});ready=true;host={attached:true,visible:true,dpi:96,bounds:{width:1240,height:840},composer:${JSON.stringify(sample(392,180,737,643))}};dip={width:1240,height:840};characterSize={width:257,height:365};updateShape();`);
 const read=()=>JSON.parse(h.run('JSON.stringify(region[0])')),pinned=read();assert.ok(pinned.y+pinned.height<=168);
 await h.ipc('panel-dock',false);assert.deepEqual(read(),pinned);
 await h.ipc('panel-dock',true);assert.deepEqual(read(),pinned);
 await h.ipc('panel-dock',false);
 h.run(`dip={width:1920,height:1040};host.bounds={width:1920,height:1040};host.composer=${JSON.stringify(sample(735,914,737,98,1920,1040))};updateShape();`);
 const restored=read();assert.equal(restored.width,257);assert.equal(restored.height,365);
 await h.ipc('panel-dock',true);assert.equal(read().width,restored.width);assert.equal(read().height,restored.height);
});
