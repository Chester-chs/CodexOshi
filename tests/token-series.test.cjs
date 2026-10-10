const {test}=require('node:test'),assert=require('node:assert/strict');
const {timeSeries}=require('../runtime/tokens.cjs');
test('calendar bars include empty periods, count current partial period, and sum to their own total',()=>{
  const now=new Date(2026,9,10,12,34).getTime(),hour=3600000;
  const start=new Date(2026,9,9,13).getTime();
  const states=[{increments:[{at:start-1,value:99},{at:start,value:10},{at:now-hour,value:20},{at:now,value:30},{at:now+1,value:999}]}];
  const s=timeSeries(states,now);
  assert.equal(s.hours24.bins.length,24);assert.equal(s.days7.bins.length,7);assert.equal(s.days30.bins.length,30);
  assert.equal(s.hours24.bins[0].value,10);assert.equal(s.hours24.total,60);
  for(const view of Object.values(s)){assert.equal(view.total,view.bins.reduce((n,b)=>n+b.value,0));assert.equal(view.bins.at(-1).end,now);}
  assert.equal(s.days30.bins[0].start,new Date(2026,8,11).getTime());
});
test('daily buckets follow local calendar boundaries and never mutate index increments',()=>{
  const now=new Date(2026,9,10,12).getTime(),events=[{at:new Date(2026,9,4).getTime()-1,value:11},{at:new Date(2026,9,4).getTime(),value:22}];
  const s=timeSeries([{increments:events}],now);assert.equal(s.days7.total,22);assert.equal(s.days7.bins[0].value,22);
  assert.equal(timeSeries([{increments:events}],now).days7.total,22);assert.equal(events.length,2);
});
test('calendar days keep 30 bars across a daylight-saving change',()=>{
  const {execFileSync}=require('node:child_process'),path=require('node:path');
  const result=JSON.parse(execFileSync(process.execPath,['-e',`const {timeSeries}=require('./runtime/tokens.cjs');const now=new Date(2026,10,2,12).getTime();const s=timeSeries([],now).days30;console.log(JSON.stringify({count:s.bins.length,durations:s.bins.slice(0,-1).map(b=>(b.end-b.start)/3600000)}));`],{cwd:path.resolve(__dirname,'..'),env:{...process.env,TZ:'America/New_York'},encoding:'utf8'}));
  assert.equal(result.count,30);assert.ok(result.durations.includes(25));assert.ok(result.durations.every(n=>n===24||n===25));
});
test('repeated daylight-saving hour remains two different chronological bars',()=>{
  const {execFileSync}=require('node:child_process'),path=require('node:path');
  const result=JSON.parse(execFileSync(process.execPath,['-e',`const {timeSeries}=require('./runtime/tokens.cjs');const now=Date.parse('2026-11-01T06:34:00Z');const events=[{at:Date.parse('2026-11-01T05:20:00Z'),value:10},{at:Date.parse('2026-11-01T06:20:00Z'),value:20}];console.log(JSON.stringify(timeSeries([{increments:events}],now).hours24));`],{cwd:path.resolve(__dirname,'..'),env:{...process.env,TZ:'America/New_York'},encoding:'utf8'}));
  assert.equal(result.bins.at(-2).value,10);assert.equal(result.bins.at(-1).value,20);assert.equal(result.total,30);
});
