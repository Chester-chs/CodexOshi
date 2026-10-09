// Local stdio MCP skeleton: no credentials, HTTP, model calls or Codex subprocesses.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const readline=require('node:readline');
const data=path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'codex-quota-widget');
const isFresh=(value,now=Date.now())=>Number.isFinite(value?.updatedAt) && now>=value.updatedAt && now-value.updatedAt<=3500;
function status(){
  let window=null;
  try{window=JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));}catch{}
  let running=false;
  if(isFresh(window)){try{process.kill(window.pid,0);running=true;}catch{}}
  return {stage:1,dataReadsEnabled:false,running,acceptance:'blocked-mouse-input-and-host-focus',window:running?window:null};
}
function dispatch(message){
  if(!message || message.jsonrpc!=='2.0' || typeof message.method!=='string')return {error:{code:-32600,message:'Invalid request'}};
  if(message.method==='initialize')return {result:{protocolVersion:message.params?.protocolVersion || '2024-11-05',capabilities:{tools:{}},serverInfo:{name:'codex-quota-widget',version:'0.1.0'}}};
  if(message.method==='ping')return {result:{}};
  if(message.method==='tools/list')return {result:{tools:[{name:'widget_status',description:'Read local stage 1 widget window diagnostics; does not read account or session data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}}]}};
  if(message.method==='tools/call' && message.params?.name==='widget_status')return {result:{content:[{type:'text',text:JSON.stringify(status())}]}};
  return {error:{code:-32601,message:'Method or tool not allowed'}};
}
if(require.main===module){
  const lines=readline.createInterface({input:process.stdin});
  lines.on('line',line=>{
    let request,response;
    try{
      if(Buffer.byteLength(line)>65536)throw new Error('Request too large');
      request=JSON.parse(line);
      if(request?.id===undefined && String(request?.method).startsWith('notifications/'))return;
      response=dispatch(request);
    }catch{response={error:{code:-32700,message:'Invalid JSON or oversized request'}};}
    if(request?.id!==undefined || response.error)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request?.id??null,...response})+'\n');
  });
}
module.exports={dispatch,status,isFresh};
