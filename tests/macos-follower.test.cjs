const test=require('node:test');
const assert=require('node:assert/strict');
const {parseState}=require('../desktop/macos/follower.cjs');
test('macOS positions retain negative monitor coordinates and point units',()=>{
  assert.deepEqual(parseState(JSON.stringify({mode:'attached',bounds:{x:-1440,y:40,width:1200,height:800}})),{hostAlive:true,visible:true,attached:true,dpi:96,bounds:{x:-1440,y:40,width:1200,height:800}});
});
test('missing permission differs from hidden host',()=>{
  assert.equal(parseState('{"mode":"permission"}').mode,'permission');
  assert.equal(parseState('{"mode":"hidden"}').visible,false);
});
test('reject malformed window geometry',()=>{
  for(const line of ['bad','{}','{"mode":"attached","bounds":{"x":0,"y":0,"width":-1,"height":80}}'])assert.equal(parseState(line),null);
});
