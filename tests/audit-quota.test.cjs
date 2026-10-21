const test=require('node:test');
const assert=require('node:assert/strict');
const {readHttp,normalize,QuotaReader}=require('../runtime/quota.cjs');

test('empty successful HTTP response is unavailable rather than a valid empty quota',async()=>{
  await assert.rejects(readHttp({readToken:()=> 'fixture-token',
    fetch:async()=>new Response(JSON.stringify({rate_limit:{}}),{status:200})}),/http-invalid-quota/);
});

test('empty RPC response cannot erase the last observed quota',async()=>{
  const previous=normalize({primary:{used_percent:40,window_minutes:10080}},'http',1000);
  const reader=new QuotaReader({snapshot:previous,now:()=>2000,
    http:async()=>{throw Error('http-503');},local:async()=>null,
    rpc:async()=>normalize({},'rpc',2000)});
  const value=await reader.refresh();
  assert.equal(value.windows[0]?.remainingPercent,60);
  assert.equal(value.observedAt,1000);
  assert.equal(value.stale,true);
});
