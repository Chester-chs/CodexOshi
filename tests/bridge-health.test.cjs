const {test}=require('node:test'),assert=require('node:assert/strict');
const {bridgeHealth}=require('../desktop/bridge-health.cjs');
test('slow startup gets its handshake budget from bridge listening, not process creation',()=>{
  let now=50000;const health=bridgeHealth(()=>now);
  now+=10000;assert.equal(health.check(),'starting');
  health.received();assert.equal(health.check(),'healthy');
});
test('a brief heartbeat gap hides safely but can recover without replacing Electron',()=>{
  let now=0;const health=bridgeHealth(()=>now);health.received();
  now=5000;assert.equal(health.check(),'stale');
  health.received();assert.equal(health.check(),'healthy');
  now+=31000;assert.equal(health.check(),'expired');
});
test('a bridge that never connects eventually expires',()=>{
  let now=0;const health=bridgeHealth(()=>now);now=31000;
  assert.equal(health.check(),'expired');
});
