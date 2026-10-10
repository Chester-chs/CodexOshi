const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
// A sum of cumulative records, mtime buckets, or rereading from zero breaks these.
const {tokenRecord,addRecord,buckets,TokenIndex,TAIL_BYTES,CACHE_MS}=require('../runtime/tokens.cjs');
const now=Date.parse('2026-10-10T12:00:00Z'),day=86400000;
const line=(total,at=now)=>JSON.stringify({type:'event_msg',timestamp:new Date(at).toISOString(),payload:{type:'token_count',info:{total_token_usage:{total_tokens:total,input_tokens:999}}}})+'\n';
test('high water ignores cumulative regressions and duplicates, allocating only new maxima',()=>{
  const state={highWater:0,increments:[],records:0};
  for(const [value,at] of [[100,now-8*day],[60,now-3*day],[90,now-2*day],[120,now-3600000],[120,now]])addRecord(state,{total:value,at},now);
  assert.equal(state.highWater,120);assert.deepEqual(buckets([state],now),{hours24:20,days7:20,days30:120});
});
test('truncated first total is a baseline; complete files count their first event',()=>{
  const tail={highWater:0,increments:[],records:0,baseline:true};
  addRecord(tail,{total:500,at:now-3600000},now);addRecord(tail,{total:540,at:now},now);
  assert.equal(tail.highWater,540);assert.equal(buckets([tail],now).hours24,40);
  const complete={highWater:0,increments:[],records:0};addRecord(complete,{total:500,at:now},now);assert.equal(buckets([complete],now).hours24,500);
});
test('only valid token_count cumulative fields are extracted, and event timestamps set buckets',()=>{
  assert.deepEqual(tokenRecord(line(12,now).trim()),{total:12,at:now});
  assert.equal(tokenRecord(JSON.stringify({type:'response_item',payload:{type:'token_count',info:{total_token_usage:{total_tokens:500}}}})),null);
  assert.equal(tokenRecord(line(-1).trim()),null);assert.equal(tokenRecord('broken'),null);
  const old={highWater:0,increments:[],records:0};addRecord(old,{total:20,at:now-31*day},now);addRecord(old,{total:50,at:now-2*day},now);addRecord(old,{total:70,at:now-1000},now);
  assert.deepEqual(buckets([old],now),{hours24:20,days7:50,days30:50});
});
async function fixture(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-tokens-'));
  try{await fs.mkdir(path.join(root,'sessions'),{recursive:true});return await run(root);}
  finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
}
test('bounded preview uses tail baseline, then background reconciles to complete history',async()=>fixture(async root=>{
  const file=path.join(root,'sessions','long.jsonl');await fs.writeFile(file,line(100,now-2*day)+'x'.repeat(TAIL_BYTES+5)+'\n'+line(500,now-3600000)+line(540,now));
  const updates=[];const index=new TokenIndex({codexHome:root,now:()=>now,onUpdate:q=>updates.push(q)});
  const result=await index.refresh();
  const preview=updates.find(q=>q.coverage!=='complete'&&q.metrics.tailFiles>0);assert.ok(preview);
  assert.ok(preview.metrics.tailBytes<=TAIL_BYTES);assert.equal(preview.values.hours24,40);
  assert.deepEqual(result.values,{hours24:440,days7:540,days30:540});assert.equal(result.coverage,'complete');
}));
test('five-minute cache is zero-read; expiry appends from offsets and survives index reload',async()=>fixture(async root=>{
  const file=path.join(root,'sessions','a.jsonl'),cacheFile=path.join(root,'token-index.json');let time=now;
  await fs.writeFile(file,line(100,now-2*day)+line(140,now-1000));await fs.utimes(file,new Date(now+day),new Date(now+day));
  const index=new TokenIndex({codexHome:root,cacheFile,now:()=>time});let q=await index.refresh();
  assert.deepEqual(q.values,{hours24:40,days7:140,days30:140});
  await fs.appendFile(file,line(180,now+1000));time+=CACHE_MS-1;q=await index.refresh();assert.equal(q.cacheHit,true);assert.equal(q.metrics.bytesReadThisCycle,0);assert.equal(q.values.hours24,40);
  time++;q=await index.refresh();assert.equal(q.values.hours24,80);assert.equal(q.metrics.tailBytes,0);assert.equal(q.metrics.fullBytes,0);assert.equal(q.metrics.incrementalBytes,Buffer.byteLength(line(180,now+1000)));
  const reload=new TokenIndex({codexHome:root,cacheFile,now:()=>time});q=await reload.refresh();assert.equal(q.cacheHit,true);assert.equal(q.values.hours24,80);assert.equal(q.metrics.bytesReadThisCycle,0);
  const persisted=await fs.readFile(cacheFile,'utf8');assert.equal(persisted.includes('input_tokens'),false);assert.equal(persisted.includes('token_count'),false);
}));
test('partial appended JSON resumes correctly, and truncation/deletion removes old totals',async()=>fixture(async root=>{
  let time=now;const file=path.join(root,'sessions','a.jsonl');await fs.writeFile(file,line(10));
  const index=new TokenIndex({codexHome:root,now:()=>time});await index.refresh();
  const next=line(30,now+1000);await fs.appendFile(file,next.slice(0,50));time+=CACHE_MS;let q=await index.refresh();assert.equal(q.values.hours24,10);
  await fs.appendFile(file,next.slice(50));time+=CACHE_MS;q=await index.refresh();assert.equal(q.values.hours24,30);
  await fs.writeFile(file,line(5,now+2000));time+=CACHE_MS;q=await index.refresh();assert.equal(q.values.hours24,5);
  await fs.unlink(file);time+=CACHE_MS;q=await index.refresh();assert.deepEqual(q.values,{hours24:0,days7:0,days30:0});
}));
test('first preview caps candidates at 300, while background includes remaining files',async()=>fixture(async root=>{
  await Promise.all(Array.from({length:301},(_,i)=>fs.writeFile(path.join(root,'sessions',i+'.jsonl'),line(1))));
  const index=new TokenIndex({codexHome:root,now:()=>now});const result=await index.refresh();
  assert.equal(result.metrics.tailFiles,300);assert.equal(result.values.hours24,301);assert.equal(result.filesIndexed,301);
}));
test('cached results keep their event cutoff until expiry, then roll the time window without rereading',async()=>fixture(async root=>{
  let time=now;await fs.writeFile(path.join(root,'sessions','a.jsonl'),line(20,now-day+60000));
  const index=new TokenIndex({codexHome:root,now:()=>time});assert.equal((await index.refresh()).values.hours24,20);
  time+=120000;assert.equal((await index.refresh()).values.hours24,20);
  const cached=await index.refresh();assert.equal(cached.metrics.bytesReadThisCycle,0);assert.equal(cached.series.hours24.bins.length,24);assert.equal(cached.series.days30.bins.length,30);
  time=now+CACHE_MS;const q=await index.refresh();assert.equal(q.values.hours24,0);assert.equal(q.values.days7,20);assert.equal(q.metrics.bytesReadThisCycle,0);
}));
test('known non-token oversized rows do not falsely mark completed token coverage as partial',async()=>fixture(async root=>{
  const huge='x'.repeat(1100000),rows=[{type:'response_item',payload:{content:huge}},{type:'compacted',payload:{message:huge}},{type:'event_msg',payload:{type:'item_completed',content:huge}}];
  await fs.writeFile(path.join(root,'sessions','a.jsonl'),rows.map(r=>JSON.stringify(r)+'\n').join('')+line(40));
  const q=await new TokenIndex({codexHome:root,now:()=>now}).refresh();assert.equal(q.coverage,'complete');assert.equal(q.values.hours24,40);assert.equal(q.oversizedLines,3);
}));
test('real Worker streams provisional results, finishes history, then serves a zero-read cache',async()=>fixture(async root=>{
  const {Worker}=require('node:worker_threads');
  const liveNow=Date.now();await fs.writeFile(path.join(root,'sessions','a.jsonl'),line(100,liveNow-2*day)+'x'.repeat(800000)+'\n'+line(500,liveNow-1000)+line(540,liveNow));
  const worker=new Worker(path.resolve(__dirname,'../runtime/token-worker.cjs'),{workerData:{codexHome:root}});
  const updates=[];
  try{
    const finished=new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.type!=='tokens')return;updates.push(m.value);if(m.value.coverage!=='indexing')resolve(m.value);});});
    worker.postMessage({type:'read'});const result=await finished;
    assert.ok(updates.some(q=>q.coverage==='indexing'));assert.equal(result.values.hours24,440);
    const cached=new Promise(resolve=>worker.on('message',m=>{if(m.value?.cacheHit)resolve(m.value);}));worker.postMessage({type:'read'});
    assert.equal((await cached).metrics.bytesReadThisCycle,0);
  }finally{await worker.terminate();}
}));
