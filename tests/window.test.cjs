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
  for(const sizes of [null,[],[{width:360,height:360}],[{width:NaN,height:8}],[{width:20000,height:1}]])assert.deepEqual(shape(v.regions,1000,800,sizes),tiny);
  assert.ok(v.regions.every(r=>r.x+r.width<=976&&r.y+r.height<=776));
  const narrow=layout({x:8,y:8},140,500,false,1);assert.ok(narrow.regions[0].width<120);
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
test('visibility changes only at lifecycle boundaries; restore is inactive', () => {
  const calls=[];const win={showInactive(){calls.push('inactive')},hide(){calls.push('hide')}};
  const update=visibility(win);
  update({ready:true,hostAlive:true,visible:true,attached:true,modal:false});
  update({ready:true,hostAlive:true,visible:true,attached:true,modal:false});
  update({ready:true,hostAlive:true,visible:false,attached:true,modal:false});
  update({ready:true,hostAlive:true,visible:true,attached:true,modal:false});
  assert.deepEqual(calls,['inactive','hide','inactive']);
});
