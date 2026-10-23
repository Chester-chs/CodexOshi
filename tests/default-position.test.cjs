const {test}=require('node:test'),assert=require('node:assert/strict'),{mainHarness}=require('./main-harness.cjs'),{layout,shape}=require('../desktop/geometry.cjs');
const point=h=>JSON.parse(h.run('JSON.stringify(widget)'));
const attach=h=>h.run('panelPreferences={...panelPreferences,dockBottomRight:false};host={attached:true,bounds:{width:800,height:600}};dip={width:800,height:600};ready=true;characterSize={width:199,height:280};updateShape();');
test('first placement waits for real viewport and stays bottom-right through image decoding',async()=>{
  const h=await mainHarness(undefined,{prepare:false});h.run('ready=true;updateShape();');assert.equal(point(h),null,'1x1 placeholder must not become a saved top-left coordinate');
  attach(h);assert.deepEqual(point(h),{x:657,y:408});
  h.run('characterSize={width:126,height:180};updateShape();');assert.deepEqual(point(h),{x:700,y:468},'decoded smaller role must still start at actual bottom-right');
});
test('valid saved coordinates survive startup, relayout and dragging; corrupt positions use default',async()=>{
  for(const savedPosition of ['{"x":100,"y":120}','not json','null','{"x":"100","y":120}']){
    const h=await mainHarness(undefined,{prepare:false,savedPosition});attach(h);
    assert.deepEqual(point(h),savedPosition==='{"x":100,"y":120}'?{x:100,y:120}:{x:657,y:408});
  }
  const h=await mainHarness(undefined,{prepare:false});attach(h);h.reset();h.gesture({type:'drag',x:150,y:160});assert.equal(h.writes.length,0);h.gesture({type:'end'});
  h.run('characterSize={width:126,height:180};updateShape();');assert.deepEqual(point(h),{x:150,y:160});
  const saved=h.writes.find(w=>w.file==='position.json').value;const restarted=await mainHarness(undefined,{prepare:false,savedPosition:saved});attach(restarted);assert.deepEqual(point(restarted),{x:150,y:160});
});
test('reset uses real layout and persists bottom-right once without writing during a drag',async()=>{
  const h=await mainHarness();assert.ok(h.hasHandler('reset-position'),'reset IPC must exist');h.ipc('reset-position');assert.deepEqual(point(h),{x:657,y:408});
  assert.equal(h.writes.filter(w=>w.file==='position.json').length,1);const saved=h.writes.find(w=>w.file==='position.json').value;
  const restarted=await mainHarness(undefined,{prepare:false,savedPosition:saved});attach(restarted);assert.deepEqual(point(restarted),{x:657,y:408});
  h.reset();h.gesture({type:'drag',x:200,y:220});h.ipc('reset-position');assert.equal(h.writes.length,0);assert.deepEqual(point(h),{x:200,y:220});
});
test('oversized role default shrinks and clamps in small viewport with fail-closed shape',()=>{
  const v=layout(null,100,80,false,0,{width:300,height:420});assert.deepEqual(v.widget,{x:42,y:8});assert.deepEqual(v.regions[0],{x:42,y:8,width:34,height:48});assert.deepEqual(shape(v.regions,100,80,v.sizes),v.regions);
  const tiny=layout(null,20,20,false,0,{width:300,height:420});assert.deepEqual(shape(tiny.regions,20,20,tiny.sizes),[{x:0,y:0,width:1,height:1}]);
});
