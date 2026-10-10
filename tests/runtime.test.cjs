const {test}=require('node:test');
const assert=require('node:assert/strict');
const {dispatch,isFresh}=require('../runtime/mcp.cjs');
const {authorizeRead}=require('../runtime/read-policy.cjs');
test('quota allowlist rejects model calls, writes, other URLs and files',()=>{
  for(const operation of [{method:'POST',url:'https://chatgpt.com/backend-api/wham/usage'},{rpc:'turn/start'},{rpc:'thread/start'},{method:'GET',url:'https://example.com'},{local:'session-files-read-only'},{file:'C:/other.jsonl',codexHome:'C:/safe'},{}]) assert.throws(()=>authorizeRead(operation),/allowlist/);
  for(const operation of [{method:'GET',url:'https://chatgpt.com/backend-api/wham/usage'},{rpc:'initialize'},{rpc:'account/rateLimits/read'},{file:'C:/safe/auth.json',codexHome:'C:/safe'},{file:'C:/safe/sessions/2026/a.jsonl',codexHome:'C:/safe'}])assert.doesNotThrow(()=>authorizeRead(operation));
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
  const fs=require('node:fs'),os=require('node:os');
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'codex-quota-mcp-'));
  let child;
  try {child=spawnSync(process.execPath,[path.join(__dirname,'../runtime/mcp.cjs')],{env:{...process.env,CODEX_HOME:fixture},input:requests.map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8',timeout:5000});}
  finally {assert.equal(path.dirname(path.resolve(fixture)),path.resolve(os.tmpdir()));fs.rmSync(fixture,{recursive:true,force:true});}
  assert.equal(child.status,0,child.stderr);
  const replies=child.stdout.trim().split('\n').map(x=>JSON.parse(x));
  assert.deepEqual(replies.map(x=>x.id),[1,2,3]);
  assert.equal(replies[0].result.protocolVersion,'2024-11-05');
  assert.equal(replies[1].result.tools.length,1);
  assert.equal(JSON.parse(replies[2].result.content[0].text).dataReadsEnabled,true);
});
test('MCP executable records startup metadata without polluting protocol output',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {spawnSync}=require('node:child_process');
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'codex-quota-mcp-'));
  const cwd=path.resolve(__dirname,'..');
  try {
    const child=spawnSync(process.execPath,['runtime/mcp.cjs'],{cwd,env:{...process.env,CODEX_HOME:fixture},input:'{"jsonrpc":"2.0","id":1,"method":"ping"}\n',encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');
    assert.deepEqual(JSON.parse(child.stdout),{jsonrpc:'2.0',id:1,result:{}});
    const startupFile=path.join(fixture,'codex-quota-widget','mcp-startup.json');
    assert.equal(fs.existsSync(startupFile),true,'MCP process did not record startup');
    const startup=JSON.parse(fs.readFileSync(startupFile,'utf8'));
    assert.deepEqual(Object.keys(startup).sort(),['at','pid','cwd','argv','codexHome','nodeVersion'].sort());
    assert.ok(Number.isFinite(Date.parse(startup.at)));assert.ok(startup.pid>0);
    assert.equal(startup.cwd,cwd);assert.equal(startup.codexHome,fixture);
    assert.equal(startup.nodeVersion,process.version);
    assert.deepEqual(startup.argv,[process.execPath,path.join(cwd,'runtime','mcp.cjs')]);
  } finally {assert.equal(path.dirname(path.resolve(fixture)),path.resolve(os.tmpdir()));fs.rmSync(fixture,{recursive:true,force:true});}
});
test('MCP protocol still responds silently when startup log cannot be written',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {spawnSync}=require('node:child_process');
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'codex-quota-mcp-'));
  try {
    fs.writeFileSync(path.join(fixture,'codex-quota-widget'),'blocked directory');
    const child=spawnSync(process.execPath,[path.resolve(__dirname,'../runtime/mcp.cjs')],{env:{...process.env,CODEX_HOME:fixture},input:'{"jsonrpc":"2.0","id":1,"method":"initialize"}\n',encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');
    assert.equal(JSON.parse(child.stdout).result.serverInfo.name,'codex-quota-widget');
  } finally {assert.equal(path.dirname(path.resolve(fixture)),path.resolve(os.tmpdir()));fs.rmSync(fixture,{recursive:true,force:true});}
});
