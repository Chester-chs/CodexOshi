const {test}=require('node:test'),assert=require('node:assert/strict'),{mainHarness}=require('./main-harness.cjs');
const state=h=>JSON.parse(h.run('JSON.stringify({widget,region})'));
const resize=(h,width,height,visible=true)=>h.run(`host={attached:true,visible:${visible},dpi:96,bounds:{width:${width},height:${height}}};dip={width:${width},height:${height}};ready=true;characterSize={width:200,height:300};updateShape();`);
test('increasing width or size never makes the docked portrait or footer smaller',async()=>{
  const {portraitFrame,stageHeight}=require('../desktop/ui/portrait-size.js');
  for(const viewport of [{width:1600,height:1000},{width:800,height:600}])for(const zoom of [.5,1,2,4]){
    const h=await mainHarness(undefined,{prepare:false});resize(h,viewport.width,viewport.height);
    const draw=(width,height)=>{
      h.ipc('character-size',{contentWidth:627,contentHeight:882/Math.max(1,zoom),targetWidth:width,targetHeight:height,zoom});
      const r=state(h).region[0],frame=portraitFrame(width,stageHeight(height),627,882,{zoom});
      return {width:frame.width*r.width/width,height:frame.height*r.height/height,resident:r};
    };
    for(const height of [180,280,420]){
      let previous=draw(126,height);
      for(const width of [200,280,400,540,672]){const next=draw(width,height);assert.ok(next.width>=previous.width-1,`width ${width} shrank artwork ${previous.width} -> ${next.width}`);assert.ok(next.resident.height>=previous.resident.height-1,'Changing width must not shrink the selected height');previous=next;}
    }
    for(const width of [126,280,672]){
      let previous=draw(width,180);
      for(const height of [220,280,340,420]){const next=draw(width,height);assert.ok(next.width>=previous.width-1,`size ${height} shrank artwork ${previous.width} -> ${next.width}`);assert.ok(next.resident.width>=previous.resident.width-1,'Changing size must not shrink the selected width');previous=next;}
    }
  }
});
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

test('reset position while pinned replaces the old free position with the inset bottom-right point',async()=>{
  const h=await mainHarness(undefined,{prepare:false,savedPosition:'{"x":80,"y":90}'});
  resize(h,800,600);h.reset();h.ipc('reset-position');
  assert.deepEqual(state(h).widget,{x:656,y:396});
  assert.deepEqual(JSON.parse(h.writes.find(w=>w.file==='position.json').value),{x:576,y:276});
  await h.ipc('panel-dock',false);assert.deepEqual(state(h).widget,{x:576,y:276});
});

test('manual portrait mirrors on the left side of the host midpoint and returns on the right',async()=>{
  const h=await mainHarness(undefined,{prepare:false});resize(h,800,600);
  await h.ipc('panel-dock',false);
  h.gesture({type:'drag',x:40,y:100});h.advance(16);assert.equal(h.layouts.at(-1).value.mirrored,true);
  h.gesture({type:'drag',x:350,y:100});h.advance(16);assert.equal(h.layouts.at(-1).value.mirrored,false);
  h.gesture({type:'end'});assert.equal(h.layouts.at(-1).value.mirrored,false);
});

test('visible Codi switch persists off, pauses data reads and restores the original free position',async()=>{
  const h=await mainHarness();const before=state(h);
  assert.equal(h.hasHandler('widget-enabled'),true);
  for(const value of [null,1,'false',{}])assert.equal((await h.ipc('widget-enabled',value))?.ok,false);
  assert.equal(h.writes.length,0);
  assert.equal((await h.ipc('widget-enabled',false)).ok,true);
  assert.deepEqual(state(h).widget,before.widget);assert.deepEqual(state(h).region,[{x:656,y:534,width:120,height:42}]);
  assert.equal(h.writes.filter(w=>w.file==='position.json').length,0);
  const saved=JSON.parse(h.writes.find(w=>w.file==='panel-preferences.json').value);assert.equal(saved.widgetEnabled,false);
  const reads={...h.reads};h.advance(31000);assert.deepEqual(h.reads,reads);
  h.ipc('open-settings');h.gesture({type:'click'});h.gesture({type:'drag',x:0,y:0});assert.deepEqual(state(h).region,[{x:656,y:534,width:120,height:42}]);
  assert.equal((await h.ipc('widget-enabled',true)).ok,true);assert.deepEqual(state(h),before);assert.equal(h.reads.tokens,reads.tokens+1);assert.equal(h.reads.quota,reads.quota+1);
  const restart=await mainHarness(undefined,{prepare:false,savedPanel:saved});resize(restart,800,600);assert.deepEqual(state(restart).region,[{x:656,y:534,width:120,height:42}]);assert.equal(restart.reads.quota,0);assert.equal(restart.reads.tokens,0);
});
