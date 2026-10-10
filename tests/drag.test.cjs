const {test}=require('node:test'),assert=require('node:assert/strict'),{mainHarness}=require('./main-harness.cjs');
test('120 drag events update the actual shape without writes or serialization, then save the latest snapped end',async()=>{
  const h=await mainHarness();for(let i=0;i<120;i++)h.gesture({type:'drag',x:250+i,y:150});
  assert.equal(h.writes.length,0,'pointermove must never write disk');assert.equal(h.stringifies,0,'pointermove must never serialize');assert.equal(h.shapes.length,120);
  h.gesture({type:'end'});const positions=h.writes.filter(w=>w.file==='position.json');assert.equal(positions.length,1);assert.deepEqual(JSON.parse(positions[0].value),{x:369,y:150});
  assert.equal(h.writes.filter(w=>w.file==='window-state.json').length,1);
  assert.equal(h.layouts.at(-1).value.dragging,false,'end must resume renderer immediately');
  assert.equal(h.layouts.at(-1).value.widget.x,369);
});
test('background snapshots stay in memory during drag and flush the latest values at end',async()=>{
  const h=await mainHarness();h.gesture({type:'drag',x:300,y:200});
  h.run('pendingQuota={revision:1};pendingQuota={revision:2};pendingTokens={revision:3};');
  assert.equal(h.writes.length,0);h.gesture({type:'end'});
  assert.deepEqual(JSON.parse(h.writes.find(w=>w.file==='quota-state.json.tmp').value),{revision:2});
  assert.deepEqual(JSON.parse(h.writes.find(w=>w.file==='tokens-state.json.tmp').value),{revision:3});
  h.reset();h.gesture({type:'end'});assert.equal(h.writes.filter(w=>w.file.endsWith('.tmp')).length,0);
});
test('drag diagnostics coalesce at 500ms and layout updates at 16ms without event backlog',async()=>{
  const h=await mainHarness();for(let i=0;i<100;i++)h.gesture({type:'drag',x:250+i,y:150});
  assert.equal(h.layouts.length,0);h.advance(16);assert.equal(h.layouts.length,1);assert.equal(h.layouts[0].value.widget.x,349);
  h.advance(483);assert.equal(h.writes.length,0);h.advance(1);assert.equal(h.writes.filter(w=>w.file==='window-state.json').length,1);
  h.gesture({type:'drag',x:370,y:180});h.advance(499);assert.equal(h.writes.filter(w=>w.file==='window-state.json').length,1);h.advance(1);assert.equal(h.writes.filter(w=>w.file==='window-state.json').length,2);
});
test('long drags checkpoint once per second after three seconds; end cancels timers and keeps snapping',async()=>{
  const h=await mainHarness();h.gesture({type:'drag',x:570,y:290});h.advance(2999);assert.equal(h.writes.filter(w=>w.file==='position.json').length,0);
  h.advance(1);assert.equal(h.writes.filter(w=>w.file==='position.json').length,1);h.gesture({type:'drag',x:571,y:291});h.advance(1000);assert.equal(h.writes.filter(w=>w.file==='position.json').length,2);
  h.gesture({type:'end'});assert.deepEqual(JSON.parse(h.writes.filter(w=>w.file==='position.json').at(-1).value),{x:577,y:296});
  h.reset();h.advance(1500);assert.equal(h.writes.filter(w=>w.file==='position.json').length,0);assert.equal(h.writes.filter(w=>w.file==='window-state.json').length,0);
});
