const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shape, viewport, position } = require('../desktop/geometry.cjs');
const { visibility } = require('../desktop/visibility.cjs');
const {layout}=require('../desktop/geometry.cjs');
const tiny = [{x:0,y:0,width:1,height:1}];
test('unsafe shapes fail closed, never restore the full host window', () => {
  for (const input of [[], null, {}, [{x:NaN,y:0,width:4,height:4}], [{x:0,y:0,width:-1,height:4}],
    [{x:0,y:0,width:40000,height:4}], Array(65).fill({x:2,y:2,width:4,height:4}),
    [{x:990,y:790,width:50,height:50}], [{x:0,y:0,width:1000,height:800}],
    [{x:4.5,y:0,width:5,height:5}]]) assert.deepEqual(shape(input,1000,800),tiny);
});
test('valid shape is copied and stays away from the outer scrollbar strip', () => {
  const input = [{x:40,y:60,width:96,height:80}];
  assert.deepEqual(shape(input,1000,800),[{x:40,y:60,width:96,height:80}]);
  assert.notEqual(shape(input,1000,800),input);
});
test('expanded layout admits only the bounded visible rectangles, with gaps passing through',()=>{
  const v=layout({x:900,y:700},1000,800,true,2);
  assert.equal(v.regions.length,2);assert.ok(v.regions[1].width>=240);
  assert.deepEqual(shape(v.regions,1000,800,v.sizes),v.regions);
  assert.deepEqual(shape([{x:0,y:0,width:1000,height:800}],1000,800,[{width:1000,height:800}]),tiny);
  for(const sizes of [null,[],[{width:673,height:420}],[{width:NaN,height:8}],[{width:20000,height:1}]])assert.deepEqual(shape(v.regions,1000,800,sizes),tiny);
  assert.ok(v.regions.every(r=>r.x+r.width<=976&&r.y+r.height<=776));
  const narrow=layout({x:8,y:8},140,500,false,1);assert.ok(narrow.regions[0].width<120);
});

test('large role layout uses its actual budget, keeps panel separate, and rejects inflated profiles',()=>{
  const v=layout({x:900,y:700},1000,800,true,2,{width:199,height:280});
  assert.equal(v.regions[0].width,199);assert.equal(v.regions[0].height,280);
  assert.equal(v.regions[1].width,320);assert.equal(v.regions[1].height,352);
  assert.deepEqual(shape(v.regions,1000,800,v.sizes),v.regions);
  assert.ok(v.regions.every(r=>r.x>=8&&r.y>=8&&r.x+r.width<=976&&r.y+r.height<=776));
  const enlarged=v.regions.map(r=>({...r}));enlarged[0].width++;assert.deepEqual(shape(enlarged,1000,800,v.sizes),tiny);
  for(const sizes of [[{width:673,height:420}],[{width:672,height:421}],[{width:672,height:420},{width:341,height:352}],[{width:672,height:420},{width:340,height:353}]])assert.deepEqual(shape([{x:8,y:8,width:10,height:10}],2000,2000,sizes),tiny);
  const max=layout({x:9999,y:9999},1200,800,false,0,{width:672,height:420});assert.deepEqual(shape(max.regions,1200,800,max.sizes),max.regions);
  assert.deepEqual(shape([{x:8,y:8,width:672,height:420},{x:8,y:8,width:672,height:420}],2000,2000,[{width:672,height:420},{width:672,height:420}]),tiny);
});
test('physical native bounds become Chromium DIP at 100, 150 and 200 percent', () => {
  assert.deepEqual(viewport(1200,900,96),{width:1200,height:900});
  assert.deepEqual(viewport(1200,900,144),{width:800,height:600});
  assert.deepEqual(viewport(1200,900,192),{width:600,height:450});
});
test('client-relative drag clamps to the viewport and reserves outer scrollbar', () => {
  assert.deepEqual(position(999,999,800,600),{x:680,y:496});
  assert.deepEqual(position(-40,-20,800,600),{x:8,y:8});
});

test('edge snap and viewport shrink keep every supported role size inside reserved borders',()=>{
  const {snap}=require('../desktop/geometry.cjs');
  assert.deepEqual(snap({x:15,y:9},800,600,{width:199,height:280}),{x:8,y:8});
  assert.deepEqual(snap({x:570,y:290},800,600,{width:199,height:280}),{x:577,y:296});
  assert.deepEqual(snap({x:250,y:100},800,600,{width:199,height:280}),{x:250,y:100});
  for(const viewport of [[160,240],[800,600],[1000,800]])for(const requested of [{width:81,height:180},{width:199,height:280},{width:672,height:420}]){
    const v=layout({x:9999,y:9999},...viewport,true,2,requested);
    assert.deepEqual(shape(v.regions,...viewport,v.sizes),v.regions);assert.ok(v.regions.every(r=>r.x>=8&&r.y>=8&&r.x+r.width<=viewport[0]-24&&r.y+r.height<=viewport[1]-24));
  }
});
test('visibility changes only at lifecycle boundaries; restore is inactive', () => {
  const calls=[];const win={showInactive(){calls.push('inactive')},hide(){calls.push('hide')}};
  const update=visibility(win);
  update({ready:true,hostAlive:true,visible:true,attached:true,modal:false});
  update({ready:true,hostAlive:true,visible:true,attached:true,modal:false});
  update({ready:true,hostAlive:true,visible:false,attached:true,modal:false});
  update({ready:true,hostAlive:true,visible:true,attached:true,modal:false});
  assert.deepEqual(calls,['inactive','hide','inactive']);
});
