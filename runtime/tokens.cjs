// Local token indexing only. This module never imports a network or subprocess API.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {performance}=require('node:perf_hooks');
const {authorizeRead}=require('./read-policy.cjs');
const TAIL_BYTES=768*1024,CACHE_MS=300000,DAY=86400000;
const CHUNK_BYTES=256*1024,MAX_LINE_BYTES=1024*1024;
function knownNonToken(prefix){
  // Canonical Codex JSONL puts root metadata before payload. Classify the
  // bounded header of huge image/tool rows without parsing their content.
  const boundary=/,\s*"payload"\s*:/.exec(prefix);if(!boundary)return false;
  try{
    const header=JSON.parse(prefix.slice(0,boundary.index)+'}');
    if(typeof header.type!=='string')return false;if(header.type!=='event_msg')return true;
    const payload=prefix.slice(boundary.index+boundary[0].length),type=/^\s*\{\s*"type"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(payload);
    return Boolean(type&&JSON.parse(type[1])!=='token_count');
  }catch{return false;}
}
function oversized(state,buffer,start,end){
  state.oversizedLines++;
  if(!knownNonToken(buffer.toString('utf8',start,Math.min(end,start+4096))))state.unclassifiedLines++;
}
function tokenRecord(line){
  if(!line.includes('"token_count"'))return null;
  try{
    const event=JSON.parse(line),total=event?.payload?.info?.total_token_usage?.total_tokens;
    if(event.type!=='event_msg'||event.payload?.type!=='token_count'||!Number.isSafeInteger(total)||total<0)return null;
    const at=Date.parse(event.timestamp);return {total,at:Number.isFinite(at)?at:null};
  }catch{return null;}
}
function addRecord(state,record,now){
  const delta=Math.max(0,record.total-state.highWater),baseline=state.baseline&&!state.records;
  state.highWater=Math.max(state.highWater,record.total);state.records++;
  if(delta&&!baseline){
    if(record.at===null){state.missingTimestamps=(state.missingTimestamps||0)+1;return;}
    if(record.at>=now-30*DAY)state.increments.push({at:record.at,value:delta});
  }
}
function buckets(states,now){
  const result={hours24:0,days7:0,days30:0};
  for(const state of states)for(const event of state.increments){
    const age=now-event.at;if(age<0)continue;
    if(age<=DAY)result.hours24+=event.value;
    if(age<=7*DAY)result.days7+=event.value;
    if(age<=30*DAY)result.days30+=event.value;
  }
  return result;
}
function newState(entry,baseline=false){
  return {identity:entry.identity,size:entry.size,mtimeMs:entry.mtimeMs,offset:0,highWater:0,increments:[],records:0,baseline,skipLine:false,oversizedLines:0,unclassifiedLines:0,missingTimestamps:0,complete:false};
}
class TokenIndex{
  constructor(options={}){
    this.home=options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(),'.codex');
    this.root=path.join(this.home,'sessions');this.cacheFile=options.cacheFile;
    this.now=options.now || Date.now;this.onUpdate=options.onUpdate || (()=>{});
    this.states=new Map();this.previews=new Map();this.loaded=false;this.busy=false;this.initialized=false;
    this.lastRefreshAt=null;this.cacheHits=0;this.refreshes=0;this.errors=0;this.discovered=0;this.lastScan=null;
    this.metrics={};this.completeCycle=false;
  }
  async load(){
    if(this.loaded)return;this.loaded=true;if(!this.cacheFile)return;
    try{
      const cached=JSON.parse(await fs.readFile(this.cacheFile,'utf8'));if(cached.version!==2)return;
      for(const [key,s] of Object.entries(cached.files || {})){
        authorizeRead({file:path.join(this.root,key),codexHome:this.home});
        if(!Number.isSafeInteger(s.offset)||s.offset<0||!Number.isSafeInteger(s.highWater)||s.highWater<0||!Number.isSafeInteger(s.records)||!Array.isArray(s.increments)||
          !s.increments.every(e=>Number.isFinite(e.at)&&Number.isSafeInteger(e.value)&&e.value>0))continue;
        // Explicit fields only: never persist or restore raw session text.
        this.states.set(key,{identity:s.identity,size:s.size,mtimeMs:s.mtimeMs,offset:s.offset,highWater:s.highWater,increments:s.increments,records:s.records,baseline:false,skipLine:Boolean(s.skipLine),oversizedLines:s.oversizedLines||0,unclassifiedLines:s.unclassifiedLines||0,missingTimestamps:s.missingTimestamps||0,complete:Boolean(s.complete)});
      }
      this.lastRefreshAt=cached.lastRefreshAt;this.completeCycle=Boolean(cached.completeCycle);
      this.initialized=true;this.discovered=this.states.size;this.lastScan=cached.lastScan || null;
    }catch{}
  }
  async discover(){
    const entries=[];
    const walk=async dir=>{
      let children;try{children=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')this.errors++;return;}
      for(const child of children){
        if(child.isSymbolicLink())continue;const file=path.join(dir,child.name);
        if(child.isDirectory()){await walk(file);continue;}
        if(!child.isFile()||!child.name.endsWith('.jsonl'))continue;
        try{authorizeRead({file,codexHome:this.home});const stat=await fs.stat(file);
          entries.push({file,key:path.relative(this.root,file),size:stat.size,mtimeMs:stat.mtimeMs,identity:stat.dev+':'+stat.ino});
        }catch{this.errors++;}
      }
    };
    await walk(this.root);return entries.sort((a,b)=>b.mtimeMs-a.mtimeMs);
  }
  snapshot(cacheHit=false){
    const states=new Map([...this.states,...this.previews]);
    // Completed history replaces its preview atomically, never adds it twice.
    for(const [key,state] of this.states)if(state.complete)states.set(key,state);
    const values=[...states.values()],indexed=[...this.states.values()].filter(s=>s.complete).length;
    const partial=this.errors>0||values.some(s=>!s.complete||s.unclassifiedLines||s.missingTimestamps);
    const asOf=this.busy?this.now():(this.lastRefreshAt??this.now());
    return {values:buckets(values,asOf),highWaterTotal:values.reduce((sum,s)=>sum+s.highWater,0),
      coverage:this.busy?'indexing':partial?'partial':'complete',filesIndexed:indexed,filesDiscovered:this.discovered,
      observedAt:this.lastRefreshAt,cacheHit,cacheHits:this.cacheHits,refreshes:this.refreshes,
      metrics:{...this.metrics},lastScan:this.lastScan,readErrors:this.errors,
      oversizedLines:values.reduce((sum,s)=>sum+(s.oversizedLines||0),0),missingTimestamps:values.reduce((sum,s)=>sum+(s.missingTimestamps||0),0)};
  }
  publish(){
    if(this.metrics.firstResultMs===null)this.metrics.firstResultMs=Math.round(performance.now()-this.started);
    this.onUpdate(this.snapshot());this.lastPublish=performance.now();
  }
  async save(){
    if(!this.cacheFile)return;
    try{
      await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});const temp=this.cacheFile+'.tmp';
      await fs.writeFile(temp,JSON.stringify({version:2,lastRefreshAt:this.lastRefreshAt,completeCycle:this.completeCycle,lastScan:this.lastScan,files:Object.fromEntries(this.states)}));
      await fs.rename(temp,this.cacheFile);
    }catch{/* A failed cache write must not stop read-only indexing. */}
  }
  async scan(entry,state,mode){
    let offset=mode==='tail'?Math.max(0,entry.size-TAIL_BYTES):state.offset;
    const truncated=mode==='tail'&&offset>0;state.baseline=truncated;
    let skip=state.skipLine||truncated,carry=Buffer.alloc(0),fd;
    try{
      fd=await fs.open(entry.file,'r');const buffer=Buffer.alloc(CHUNK_BYTES);
      while(offset<entry.size){
        const count=Math.min(CHUNK_BYTES,entry.size-offset),read=await fd.read(buffer,0,count,offset);
        if(!read.bytesRead){this.errors++;break;}
        const length=read.bytesRead;this.metrics.bytesReadThisCycle+=length;this.metrics[mode+'Bytes']+=length;this.metrics.chunks++;
        const base=offset-carry.length,joined=carry.length?Buffer.concat([carry,buffer.subarray(0,length)]):buffer.subarray(0,length);
        let start=0,end;
        while((end=joined.indexOf(10,start))>=0){
          if(!skip){
            if(end-start>MAX_LINE_BYTES)oversized(state,joined,start,end);
            else{const record=tokenRecord(joined.toString('utf8',start,end));if(record)addRecord(state,record,this.now());}
          }
          skip=false;start=end+1;state.offset=base+start;
        }
        offset+=length;
        if(skip){carry=Buffer.alloc(0);state.offset=offset;}
        else if(joined.length-start>MAX_LINE_BYTES){skip=true;carry=Buffer.alloc(0);oversized(state,joined,start,joined.length);state.offset=offset;}
        else carry=Buffer.from(joined.subarray(start));
        state.skipLine=skip;
        if(mode!=='tail'&&performance.now()-this.lastPublish>250){this.publish();await this.save();}
        // Parsing and I/O live in a Worker, yielding between bounded chunks.
        await new Promise(resolve=>setImmediate(resolve));
      }
      if(carry.length&&!skip){
        // A final complete JSON record need not end in a newline. Incomplete
        // records keep the preceding checkpoint for the next append/restart.
        const text=carry.toString('utf8');try{JSON.parse(text);const record=tokenRecord(text);if(record)addRecord(state,record,this.now());state.offset=offset;}catch{}
      }
      state.size=entry.size;state.mtimeMs=entry.mtimeMs;state.complete=state.offset===entry.size;
    }catch{this.errors++;state.complete=false;}finally{if(fd)await fd.close();}
  }
  async refresh(){
    await this.load();
    const emptyMetrics=()=>({candidateFiles:0,tailFiles:0,tailBytes:0,fullBytes:0,incrementalBytes:0,bytesReadThisCycle:0,chunks:0,firstResultMs:null,durationMs:0});
    if(this.busy){this.cacheHits++;return this.snapshot(true);}
    if(this.initialized&&this.completeCycle&&Number.isFinite(this.lastRefreshAt)&&this.now()-this.lastRefreshAt<CACHE_MS){
      this.metrics=emptyMetrics();this.cacheHits++;return this.snapshot(true);
    }
    this.busy=true;this.completeCycle=false;this.errors=0;this.refreshes++;this.metrics=emptyMetrics();this.started=performance.now();this.lastPublish=this.started;
    try{
      const entries=await this.discover();this.discovered=entries.length;const keys=new Set(entries.map(e=>e.key));
      if(!this.errors)for(const key of this.states.keys())if(!keys.has(key))this.states.delete(key);
      for(const entry of entries){const s=this.states.get(entry.key);
        if(s&&(s.identity!==entry.identity||entry.size<s.offset||(entry.size===s.size&&entry.mtimeMs!==s.mtimeMs)))this.states.delete(entry.key);
        else if(s)s.increments=s.increments.filter(e=>e.at>=this.now()-30*DAY);
      }
      const candidates=entries.filter(e=>!this.states.has(e.key)).slice(0,300);this.metrics.candidateFiles=candidates.length;
      for(const entry of candidates){
        const state=newState(entry);await this.scan(entry,state,'tail');this.metrics.tailFiles++;
        if(entry.size<=TAIL_BYTES){this.states.set(entry.key,state);}else{state.complete=false;this.previews.set(entry.key,state);}
        if(this.metrics.tailFiles%16===0)this.publish();
      }
      this.publish();
      for(const entry of entries){
        let state=this.states.get(entry.key);
        if(state?.complete&&state.offset===entry.size)continue;
        if(!state){state=newState(entry);this.states.set(entry.key,state);}
        const mode=state.offset===0?'full':'incremental';await this.scan(entry,state,mode);
        this.previews.delete(entry.key);if(performance.now()-this.lastPublish>250){this.publish();await this.save();}
      }
      this.initialized=true;this.lastRefreshAt=this.now();this.metrics.durationMs=Math.round(performance.now()-this.started);
      this.completeCycle=true;this.busy=false;this.lastScan={...this.metrics};await this.save();
      const result=this.snapshot();this.onUpdate(result);return result;
    }finally{this.busy=false;}
  }
}
module.exports={tokenRecord,addRecord,buckets,TokenIndex,TAIL_BYTES,CACHE_MS};
