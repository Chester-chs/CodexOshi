const {test}=require('node:test'),assert=require('node:assert/strict'),g=require('../desktop/geometry.cjs');
test('resizing a left-hand settings card keeps its right edge adjacent to the portrait',async()=>{
  const {mainHarness}=require('./main-harness.cjs');const h=await mainHarness();
  h.run('dip={width:1700,height:1000};widget={x:1400,y:500};');h.ipc('open-settings');
  h.ipc('panel-resize',{type:'begin'});h.ipc('panel-resize',{type:'update',width:760,height:700});h.ipc('panel-resize',{type:'end'});
  h.ipc('panel-resize',{type:'begin'});h.ipc('panel-resize',{type:'update',width:360,height:400});h.ipc('panel-resize',{type:'end'});
  const r=h.run('viewLayout.regions[1]');assert.equal(1400-r.x-r.width,12);
});
test('settings keeps the same large four-tab card even without quota windows',()=>{
  for(const count of [0,1,2]){const view=g.layout({x:676,y:396},900,700,true,count,{width:200,height:280});assert.equal(view.regions[1].width,480);assert.equal(view.regions[1].height,560);assert.deepEqual(g.shape(view.regions,900,700,view.sizes),view.regions);}
});
test('large card is bounded in small viewports; inflated profiles and whole-window regions fail closed',()=>{
  for(const [width,height]of [[200,180],[480,320],[900,700]]){const v=g.layout(null,width,height,true,0,{width:200,height:280});assert.deepEqual(g.shape(v.regions,width,height,v.sizes),v.regions);for(const r of v.regions){assert.ok(r.x>=8&&r.y>=8&&r.x+r.width<=width-24&&r.y+r.height<=height-24);}}
  const tiny=[{x:0,y:0,width:1,height:1}];assert.deepEqual(g.shape([{x:8,y:8,width:800,height:600}],900,700,[{width:800,height:600}]),tiny);assert.deepEqual(g.shape([{x:8,y:8,width:480,height:560}],900,700,[{width:200,height:280},{width:1000,height:1000}]),tiny);
});
