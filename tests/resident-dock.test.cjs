const {test}=require('node:test'),assert=require('node:assert/strict'),{mainHarness}=require('./main-harness.cjs');
const state=h=>JSON.parse(h.run('JSON.stringify({widget,region})'));
const resize=(h,width,height,visible=true)=>h.run(`host={attached:true,visible:${visible},dpi:96,bounds:{width:${width},height:${height}}};dip={width:${width},height:${height}};ready=true;characterSize={width:200,height:300};updateShape();`);
test('pinned resident remains bottom-right and scales down then recovers after a host resize',async()=>{
  const h=await mainHarness(undefined,{prepare:false,savedPosition:'{"x":80,"y":90}'});
  resize(h,1600,1000);assert.deepEqual(state(h).region[0],{x:1376,y:676,width:200,height:300});
  resize(h,800,600);assert.deepEqual(state(h).region[0],{x:656,y:396,width:120,height:180});
  resize(h,1600,1000);assert.deepEqual(state(h).region[0],{x:1376,y:676,width:200,height:300});
  h.reset();resize(h,1,1,false);assert.deepEqual(state(h).widget,{x:1376,y:676});assert.equal(h.writes.length,0);
  resize(h,1200,800);assert.deepEqual(state(h).region[0],{x:1016,y:536,width:160,height:240});
  assert.equal(h.writes.filter(w=>w.file==='position.json').length,0,'responsive layouts must not overwrite the free-drag position');
});
test('pinning persists independently, rejects invalid input, and switching off restores the manual position',async()=>{
  const h=await mainHarness(undefined,{prepare:false,savedPosition:'{"x":80,"y":90}'});resize(h,1600,1000);h.reset();
  for(const value of [null,1,'false',{}]){const result=await h.ipc('panel-dock',value);assert.equal(result?.ok,false);}assert.equal(h.writes.length,0);
  assert.equal((await h.ipc('panel-dock',false)).ok,true);assert.deepEqual(state(h).region[0],{x:80,y:90,width:200,height:300});
  const saved=JSON.parse(h.writes.find(w=>w.file==='panel-preferences.json').value);assert.equal(saved.dockBottomRight,false);
  const restart=await mainHarness(undefined,{prepare:false,savedPanel:saved,savedPosition:'{"x":80,"y":90}'});resize(restart,1600,1000);assert.deepEqual(state(restart).widget,{x:80,y:90});
  h.reset();assert.equal((await h.ipc('panel-dock',true)).ok,true);assert.deepEqual(state(h).widget,{x:1376,y:676});
  h.reset();for(let i=0;i<120;i++)h.gesture({type:'drag',x:i,y:i});h.gesture({type:'end'});assert.equal(h.writes.length,0);assert.deepEqual(state(h).widget,{x:1376,y:676});
});
