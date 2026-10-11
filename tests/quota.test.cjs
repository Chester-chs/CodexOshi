const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {normalize,readHttp,readLocal,readRpc,QuotaReader}=require('../runtime/quota.cjs');
const now=1791580000000;
test('a single HTTP weekly window remains the actual display window',()=>{
  const q=normalize({plan_type:'prolite',rate_limit:{primary_window:{used_percent:30,limit_window_seconds:604800,reset_after_seconds:426260,reset_at:1792005174},secondary_window:null}},'http',now);
  assert.equal(q.planType,'prolite');assert.equal(q.windows.length,1);
  assert.deepEqual(q.windows[0],{id:'primary',label:'每周限额',durationSeconds:604800,usedPercent:30,remainingPercent:70,resetAt:1792005174});
});
test('session and RPC schemas normalize two windows and no fabricated values',()=>{
  const session=normalize({primary:{used_percent:16,window_minutes:300,resets_at:1788288578},secondary:{used_percent:7,window_minutes:10080,resets_at:1788857323},plan_type:null},'local',now);
  assert.deepEqual(session.windows.map(w=>[w.label,w.remainingPercent]),[['5 小时限额',84],['每周限额',93]]);assert.equal(session.planType,'未知');
  const rpc=normalize({rateLimits:{primary:{usedPercent:22,windowDurationMins:1440,resetsAt:1792005174},secondary:null}},'rpc',now);
  assert.equal(rpc.windows[0].label,'长期额度');assert.equal(rpc.windows[0].durationSeconds,86400);
  assert.equal(normalize({rate_limit:{primary_window:null,secondary_window:null}},'http',now).windows.length,0);
  assert.equal(normalize({primary:{used_percent:null,window_minutes:45}},'local',now).windows[0].remainingPercent,null);
  assert.equal(normalize({rate_limit:{primary_window:{used_percent:0,limit_window_seconds:60,reset_after_seconds:30}}},'http',now).windows[0].resetAt,now/1000+30);
});
test('HTTP reloads the token after 401, retries once, and never redirects',async()=>{
  const tokens=['bad','rotated'];const calls=[];
  const q=await readHttp({readToken:()=>tokens.shift(),fetch:async(url,options)=>{calls.push([url,options]);return calls.length===1?{status:401,ok:false}:{ok:true,status:200,json:async()=>({rate_limit:{primary_window:{used_percent:35,limit_window_seconds:604800}}})};}});
  assert.equal(q.windows[0].remainingPercent,65);assert.equal(calls.length,2);
  assert.equal(calls[0][0],'https://chatgpt.com/backend-api/wham/usage');assert.equal(calls[1][1].headers.Authorization,'Bearer rotated');
  assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].redirect,'error');
  assert.match(calls[0][1].headers['User-Agent'],/^codex-cli\//);
  let attempts=0;
  await assert.rejects(readHttp({readToken:()=> 'bad',fetch:async()=>{attempts++;return {status:401,ok:false};}}),/http-401/);
  assert.equal(attempts,2);
});
test('offline scan extracts only the newest Codex quota snapshot, tolerating broken lines',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'quota-session-'));
  try {
    fs.mkdirSync(path.join(root,'sessions','nested'),{recursive:true});
    fs.writeFileSync(path.join(root,'sessions','nested','a.jsonl'),[
      JSON.stringify({type:'event_msg',timestamp:'2026-10-09T12:00:00Z',payload:{type:'token_count',rate_limits:{primary:{used_percent:25,window_minutes:10080}}}}),
      'broken',JSON.stringify({type:'event_msg',timestamp:'2026-10-10T12:00:00Z',payload:{type:'token_count',rate_limits:{primary:{used_percent:32,window_minutes:10080}}}}),
      JSON.stringify({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:123}}}})
    ].join('\n'));
    const q=await readLocal(root);assert.equal(q.windows[0].remainingPercent,68);assert.equal(q.observedAt,Date.parse('2026-10-10T12:00:00Z'));
    assert.equal(JSON.stringify(q).includes('total_tokens'),false);
  } finally {assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}
});
test('reader prioritizes HTTP then local, limits RPC to five minutes, and keeps old values',async()=>{
  let time=now;let rpcCalls=0;let fail=false;let localAvailable=false;
  const sample=normalize({primary:{used_percent:40,window_minutes:10080}},'rpc',now);
  const reader=new QuotaReader({now:()=>time,http:async()=>{throw Error('offline')},local:async()=>localAvailable?{...sample,source:'local'}:null,rpc:async()=>{rpcCalls++;if(fail)throw Error('down');return sample;}});
  await reader.refresh();assert.equal(reader.snapshot.source,'rpc');assert.equal(rpcCalls,1);
  fail=true;time+=30000;await reader.refresh();assert.equal(rpcCalls,1);assert.equal(reader.snapshot.stale,true);assert.equal(reader.snapshot.windows[0].remainingPercent,60);assert.equal(reader.snapshot.observedAt,now);
  localAvailable=true;await reader.refresh();assert.equal(reader.snapshot.source,'local');assert.equal(rpcCalls,1);
  localAvailable=false;time+=300000;await reader.refresh();assert.equal(rpcCalls,2);assert.equal(reader.snapshot.stale,true);
});
test('successful HTTP never reads offline data or launches RPC; failure keeps newer cached values',async()=>{
  let fail=false,locals=0,rpcs=0;
  const fresh=normalize({primary:{used_percent:45,window_minutes:10080}},'http',now);
  const older=normalize({primary:{used_percent:20,window_minutes:10080}},'local',now-60000);
  const reader=new QuotaReader({now:()=>now+30000,http:async()=>{if(fail)throw Error('http-401');return fresh;},local:async()=>{locals++;return older;},rpc:async()=>{rpcs++;throw Error('unexpected');}});
  await reader.refresh();assert.equal(locals,0);assert.equal(rpcs,0);
  fail=true;await reader.refresh();assert.equal(reader.snapshot.windows[0].remainingPercent,55);assert.equal(reader.snapshot.observedAt,now);assert.equal(reader.snapshot.stale,true);assert.equal(rpcs,0);
});
test('a fresh RPC quota replaces an older local snapshot when HTTP fails',async()=>{
  const older=normalize({primary:{used_percent:90,window_minutes:10080}},'local',now-60000);
  const fresh=normalize({rateLimits:{primary:{usedPercent:10,windowDurationMins:10080}}},'rpc',now);
  const reader=new QuotaReader({now:()=>now,http:async()=>{throw Error('http-503')},local:async()=>older,rpc:async()=>fresh,readResetCredits:true});
  await reader.refresh();
  assert.equal(reader.snapshot.source,'rpc');
  assert.equal(reader.snapshot.observedAt,now);
  assert.equal(reader.snapshot.windows[0].remainingPercent,90);
});
test('RPC sends initialize then quota read only after its response, and hides its child',async()=>{
  const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
  const child=new EventEmitter();child.stdout=new PassThrough();let initialized=false,killed=false;const methods=[];
  child.kill=()=>{killed=true;};
  child.stdin=new Writable({write(chunk,encoding,done){const request=JSON.parse(chunk.toString());methods.push(request.method);
    if(request.method==='account/rateLimits/read')assert.equal(initialized,true);
    setTimeout(()=>{initialized=true;child.stdout.write(JSON.stringify({id:request.id,result:request.method==='initialize'?{}:{rateLimitsByLimitId:{codex:{primary:{usedPercent:12,windowDurationMins:10080},planType:'prolite'}}}})+'\n');},5);done();
  }});
  const q=await readRpc({executable:'fixture-only',spawn:(exe,args,options)=>{assert.deepEqual(args,['app-server','--stdio']);assert.equal(options.windowsHide,true);return child;},now:()=>now});
  assert.deepEqual(methods,['initialize','account/rateLimits/read']);assert.equal(q.windows[0].remainingPercent,88);assert.equal(killed,true);
});
