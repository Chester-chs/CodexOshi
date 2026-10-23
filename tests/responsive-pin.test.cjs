const {test}=require('node:test'),assert=require('node:assert/strict');
const {mainHarness}=require('./main-harness.cjs');
const resize=(h,w,hgt)=>h.run(`host={attached:true,visible:true,dpi:96,bounds:{width:${w},height:${hgt}}};dip={width:${w},height:${hgt}};ready=true;characterSize={width:240,height:340};updateShape();`);
const region=h=>JSON.parse(h.run('JSON.stringify(region[0])'));
async function fixture(){const h=await mainHarness(undefined,{prepare:false,savedPosition:'{"x":80,"y":90}'});h.run('screen.getDisplayMatching=()=>({workAreaSize:{width:2560,height:1440}})');return h;}

test('pinned placement stays near the lower-right window edge without extra composer clearance',async()=>{
  const h=await fixture();
  for(const [width,height] of [[1920,1032],[1240,840]]){
    resize(h,width,height);const r=region(h);
    assert.equal(height-r.y-r.height,24);
    assert.equal(r.x+r.width,width-24);
  }
});

test('pin toggles never change portrait or bar-only dimensions in a small window',async()=>{
  for(const compactOnly of [false,true]){
    const h=await fixture();h.run(`panelPreferences.compactOnly=${compactOnly}`);
    resize(h,1280,720);const pinned=region(h);
    await h.ipc('panel-dock',false);const free=region(h);
    assert.deepEqual(free,pinned,'unpin must preserve the current rectangle, ignoring an older saved free position');
    resize(h,1024,576);const smaller=region(h);assert.ok(smaller.width<free.width);
    await h.ipc('panel-dock',true);const repinned=region(h);
    assert.deepEqual([repinned.width,repinned.height],[smaller.width,smaller.height]);
  }
});
test('a large monitor host shrinks before reaching the old fixed threshold and restores without altering preferences',async()=>{
  const h=await fixture();resize(h,2560,1440);const full=region(h);h.reset();resize(h,1800,1100);const small=region(h);
  assert.ok(small.width<full.width*.8);assert.ok(Math.abs(small.width/full.width-small.height/full.height)<.01);
  resize(h,2560,1440);assert.deepEqual(region(h),full);assert.equal(h.writes.filter(x=>['position.json','panel-preferences.json'].includes(x.file)).length,0);
});
test('compact-only quota bar also shrinks with the host',async()=>{
  const h=await fixture();h.run('panelPreferences.compactOnly=true');resize(h,2560,1440);const full=region(h);resize(h,1280,720);const small=region(h);
  assert.equal(small.width,120);assert.equal(small.height,26);assert.equal(full.width,240);
});
test('moving to a smaller display recalculates from original dimensions rather than compounding scale',async()=>{
  const h=await fixture();resize(h,1280,720);assert.equal(region(h).width,120);
  h.run('screen.getDisplayMatching=()=>({workAreaSize:{width:1280,height:720}})');resize(h,1280,720);assert.equal(region(h).width,240);
  h.run('screen.getDisplayMatching=()=>({workAreaSize:{width:2560,height:1440}})');resize(h,1280,720);assert.equal(region(h).width,120);
});
test('pinned widget and disabled launcher retain the outer margin while unpin retains current position',async()=>{
  const h=await fixture();resize(h,1240,840);let r=region(h);assert.ok(r.y+r.height===840-24);assert.equal(r.x+r.width,1216);
  await h.ipc('panel-dock',false);assert.deepEqual(JSON.parse(h.run('JSON.stringify(widget)')),{x:r.x,y:r.y});
  await h.ipc('panel-dock',true);assert.ok(region(h).y+region(h).height===816);
  await h.ipc('widget-enabled',false);r=region(h);assert.ok(r.y+r.height===816);
});
