const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const {authorizeRead,USAGE_URL}=require('./read-policy.cjs');
const home=()=>process.env.CODEX_HOME || path.join(os.homedir(),'.codex');
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function normalize(input,source,observedAt=Date.now()){
  const value=input?.rate_limit || input?.rateLimitsByLimitId?.codex || input?.rateLimits || input || {};
  const windows=[];
  for(const id of ['primary','secondary']){
    const w=value[id+'_window'] ?? value[id];if(!w||typeof w!=='object')continue;
    const minutes=finite(w.window_minutes) ?? finite(w.windowDurationMins);
    const seconds=finite(w.limit_window_seconds) ?? (minutes===null?null:minutes*60);
    const used=finite(w.used_percent) ?? finite(w.usedPercent);
    const usedPercent=used===null?null:Math.max(0,Math.min(100,used));
    const resetAt=finite(w.reset_at) ?? finite(w.resets_at) ?? finite(w.resetsAt) ?? (finite(w.reset_after_seconds)===null?null:observedAt/1000+w.reset_after_seconds);
    windows.push({id,label:seconds===18000?'5 小时限额':seconds>=604800?'每周限额':seconds>=86400?'长期额度':'短期额度',durationSeconds:seconds,usedPercent,remainingPercent:usedPercent===null?null:100-usedPercent,resetAt});
  }
  const plan=input?.plan_type ?? value.plan_type ?? value.planType;
  const count=input?.rateLimitResetCredits?.availableCount;
  const resetCredits=Number.isSafeInteger(count)&&count>=0?{availableCount:count,observedAt,stale:false}:null;
  return {planType:typeof plan==='string'&&plan.length<=80?plan:'未知',windows,source,observedAt,stale:source!=='http',resetCredits};
}
function readToken(codexHome=home()){
  const file=path.join(codexHome,'auth.json');authorizeRead({file,codexHome});
  const token=JSON.parse(fs.readFileSync(file,'utf8'))?.tokens?.access_token;
  if(typeof token!=='string'||!token)throw Error('auth-unavailable');return token;
}
async function readHttp(options={}){
  authorizeRead({method:'GET',url:USAGE_URL});
  for(let attempt=0;attempt<2;attempt++){
    let token;try{token=await (options.readToken || (()=>readToken(options.codexHome)))();}catch{throw Error('auth-unavailable');}
    let response;
    try{response=await (options.fetch || fetch)(USAGE_URL,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token,'User-Agent':'codex-cli/'+(options.version || '0.162.0-alpha.17.2')}});}catch{throw Error('http-unavailable');}
    if(response.status===401&&attempt===0)continue;
    if(!response.ok)throw Error('http-'+response.status);
    let value;try{value=await response.json();}catch{throw Error('http-invalid-json');}
    if(!value?.rate_limit || typeof value.rate_limit!=='object')throw Error('http-invalid-quota');
    const quota=normalize(value,'http',(options.now || Date.now)());
    if(!quota.windows.some(w=>w.remainingPercent!==null))throw Error('http-invalid-quota');
    return quota;
  }
}
async function readLocal(codexHome=home()){
  let newest=null;
  async function walk(dir){
    let entries;try{entries=await fs.promises.readdir(dir,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      if(entry.isSymbolicLink())continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()){await walk(file);continue;}
      if(!entry.isFile()||!entry.name.endsWith('.jsonl'))continue;
      authorizeRead({file,codexHome});let fd;
      try{
        fd=await fs.promises.open(file,'r');const stat=await fd.stat();
        // Bounded recent tail; never retain chat text or token usage.
        const start=Math.max(0,stat.size-4*1024*1024),buffer=Buffer.alloc(stat.size-start);
        await fd.read(buffer,0,buffer.length,start);
        const lines=buffer.toString('utf8').split('\n');if(start)lines.shift();
        for(const line of lines){try{
          const event=JSON.parse(line),limits=event?.payload?.rate_limits,at=Date.parse(event?.timestamp);
          if(event.type!=='event_msg'||event.payload?.type!=='token_count'||!limits||!Number.isFinite(at)||
            (limits.limit_id&&limits.limit_id!=='codex')||(newest&&at<=newest.observedAt))continue;
          const q=normalize(limits,'local',at);if(q.windows.some(w=>w.remainingPercent!==null))newest=q;
        }catch{}}
      }catch{}finally{if(fd)await fd.close();}
    }
  }
  await walk(path.join(codexHome,'sessions'));return newest;
}
function findCodex(){
  if(process.platform==='darwin'){
    const candidates=[process.env.CODEX_CLI_PATH,...[path.join(os.homedir(),'Applications'),'/Applications'].flatMap(dir=>['codex-cli/bin/codex','codex-cli/CodexCLI.app/Contents/MacOS/codex','codex'].map(file=>path.join(dir,'Codex.app/Contents/Resources',file))),...(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,'codex'))];
    return candidates.find(file=>{try{return file&&fs.statSync(file).isFile()&&(fs.accessSync(file,fs.constants.X_OK),true);}catch{return false;}})||null;
  }
  const base=path.join(process.env.LOCALAPPDATA || '', 'OpenAI','Codex','bin');
  try{return fs.readdirSync(base).map(name=>path.join(base,name,'codex.exe')).filter(file=>fs.existsSync(file)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];}catch{return null;}
}
async function readRpc(options={}){
  const executable=options.executable || findCodex();if(!executable)throw Error('rpc-unavailable');
  // Only subprocess in the reader: no turn methods exist.
  const child=(options.spawn || spawn)(executable,['app-server','--stdio'],{windowsHide:true,stdio:['pipe','pipe','ignore'],env:{...process.env,CODEX_HOME:options.codexHome || home()}});
  const lines=readline.createInterface({input:child.stdout});let pending=null,id=0;
  const fail=()=>{if(pending){clearTimeout(pending.timer);pending.reject(Error('rpc-unavailable'));pending=null;}};
  child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);
  lines.on('line',line=>{
    if(line.length>1024*1024){fail();return;}
    try{const response=JSON.parse(line);if(pending&&response.id===pending.id){const request=pending;pending=null;clearTimeout(request.timer);if(response.error)request.reject(Error('rpc-read-failed'));else request.resolve(response.result);}}catch{}
  });
  function request(method,params){authorizeRead({rpc:method});return new Promise((resolve,reject)=>{
    const timer=setTimeout(fail,10000);pending={id:++id,resolve,reject,timer};child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });}
  try{
    await request('initialize',{clientInfo:{name:'codex_quota_widget',version:'0.1.0'}});
    return normalize(await request('account/rateLimits/read',{}),'rpc',(options.now || Date.now)());
  }finally{fail();lines.close();child.stdin.end();child.kill();}
}
class QuotaReader{
  constructor(options={}){
    this.now=options.now || Date.now;this.http=options.http || (()=>readHttp(options));this.local=options.local || (()=>readLocal(options.codexHome));this.rpc=options.rpc || (()=>readRpc(options));
    this.snapshot=options.snapshot || {...normalize({},'none',null),stale:true};this.lastRpcAttemptAt=options.lastRpcAttemptAt ?? null;this.busy=false;this.readResetCredits=options.readResetCredits===true;
  }
  async refresh(){
    if(this.busy)return this.snapshot;this.busy=true;let quota=null,errorCode=null;
    try{
      try{quota=await this.http();}catch(error){errorCode=/^(http-[\w-]+|auth-unavailable)$/.test(error.message)?error.message:'http-unavailable';}
      if(!quota){try{quota=await this.local();}catch{}}
      // Offline history must not replace a newer successful reading with older numbers.
      if(quota?.source==='local'&&Number.isFinite(this.snapshot.observedAt)&&quota.observedAt<this.snapshot.observedAt)quota={...this.snapshot,stale:true};
      let resetCredits=quota?.resetCredits||this.snapshot.resetCredits||null;
      if((!quota||this.readResetCredits)&&(this.lastRpcAttemptAt===null||this.now()-this.lastRpcAttemptAt>=300000)){
        this.lastRpcAttemptAt=this.now();try{
          const rpc=await this.rpc();
          if(rpc.windows.some(w=>w.remainingPercent!==null)&&(!quota||(errorCode&&Number.isFinite(rpc.observedAt)&&(!Number.isFinite(quota.observedAt)||rpc.observedAt>quota.observedAt))))quota=rpc;
          resetCredits=rpc.resetCredits||null;
        }catch{if(resetCredits)resetCredits={...resetCredits,stale:true};}
      }
      this.snapshot={...(quota || this.snapshot),resetCredits,stale:!quota || Boolean(errorCode) || quota.source!=='http',lastAttemptAt:this.now(),lastRpcAttemptAt:this.lastRpcAttemptAt,errorCode};return this.snapshot;
    }finally{this.busy=false;}
  }
}
module.exports={normalize,readHttp,readLocal,readRpc,readToken,QuotaReader};
