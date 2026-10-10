const {test}=require('node:test'),assert=require('node:assert/strict');
const {presentSeries}=require('../desktop/ui/token-chart.js');
test('time chart keeps zeros, uses chronological bars and exact selected total',()=>{
  const bins=[{start:1000000,end:4600000,value:0},{start:4600000,end:8200000,value:12345}];
  const v=presentSeries({series:{hours24:{bins,total:12345,asOf:8200000,period:'hour'}}},'hours24','en-US');
  assert.equal(v.known,true);assert.equal(v.total,'12,345');assert.equal(v.bins.length,2);assert.equal(v.bins[0].percent,0);assert.ok(v.bins[1].percent>0&&v.bins[1].percent<=100);assert.ok(v.bins[1].tooltip.includes('12,345'));
});
test('missing or corrupt time metadata never fabricates bars from an aggregate',()=>{
  assert.equal(presentSeries({values:{hours24:1200}},'hours24').known,false);
  assert.equal(presentSeries({series:{hours24:{bins:[{start:0,end:1,value:-1}],total:-1}}},'hours24').known,false);
});
