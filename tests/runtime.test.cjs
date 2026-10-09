const {test}=require('node:test');
const assert=require('node:assert/strict');
const {dispatch,isFresh}=require('../runtime/mcp.cjs');
const {authorizeRead}=require('../runtime/read-policy.cjs');
test('stage 1 rejects every data source including future allowed reads',()=>{
  for(const operation of [{method:'GET',url:'https://chatgpt.com/backend-api/wham/usage'},{rpc:'account/rateLimits/read'},{local:'session-files-read-only'},{}]) assert.throws(()=>authorizeRead(operation),/disabled in stage 1/);
});
test('MCP only exposes local diagnostics and rejects unlisted tools and methods',()=>{
  assert.equal(dispatch({jsonrpc:'2.0',method:'tools/list'}).result.tools[0].name,'widget_status');
  assert.equal(dispatch({jsonrpc:'2.0',method:'tools/call',params:{name:'model_completion'}}).error.code,-32601);
  assert.equal(dispatch({jsonrpc:'2.0',method:'account/rateLimits/read'}).error.code,-32601);
  assert.equal(dispatch({jsonrpc:'2.0',method:'arbitrary'}).error.code,-32601);
});
test('a stopped companion cannot appear live from an old diagnostic file',()=>{
  assert.equal(isFresh({updatedAt:10000},12000),true);
  assert.equal(isFresh({updatedAt:10000},15000),false);
  assert.equal(isFresh({},12000),false);
  assert.equal(isFresh({updatedAt:16000},12000),false);
});
test('real stdio MCP process initializes and returns only local diagnostics',()=>{
  const {spawnSync}=require('node:child_process');
  const path=require('node:path');
  const requests=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},
    {jsonrpc:'2.0',method:'notifications/initialized'},
    {jsonrpc:'2.0',id:2,method:'tools/list'},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'widget_status',arguments:{}}}
  ];
  const child=spawnSync(process.execPath,[path.join(__dirname,'../runtime/mcp.cjs')],{input:requests.map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8',timeout:5000});
  assert.equal(child.status,0,child.stderr);
  const replies=child.stdout.trim().split('\n').map(x=>JSON.parse(x));
  assert.deepEqual(replies.map(x=>x.id),[1,2,3]);
  assert.equal(replies[0].result.protocolVersion,'2024-11-05');
  assert.equal(replies[1].result.tools.length,1);
  assert.equal(JSON.parse(replies[2].result.content[0].text).dataReadsEnabled,false);
});
