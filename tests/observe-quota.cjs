// Acceptance-only observer. Reads session event types, never payload text or usage.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'sessions');
const output=process.argv[2],duration=Number(process.argv[3] || 600000);
const offsets=new Map(),partials=new Map(),events={},files=new Set();
const start=Date.now();let scans=0,resetFiles=0;
function list(dir){let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
  return entries.flatMap(e=>e.isSymbolicLink()?[]:e.isDirectory()?list(path.join(dir,e.name)):e.isFile()&&e.name.endsWith('.jsonl')?[path.join(dir,e.name)]:[]);
}
for(const file of list(root))offsets.set(file,fs.statSync(file).size);
const initialFiles=offsets.size;
function scan(){scans++;
  for(const file of list(root)){
    try{
      const size=fs.statSync(file).size;let from=offsets.get(file)??0;if(size<from){from=0;resetFiles++;}
      if(size===from)continue;
      const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(size-from);try{fs.readSync(fd,buffer,0,buffer.length,from);}finally{fs.closeSync(fd);}
      offsets.set(file,size);const lines=((partials.get(file)||'')+buffer.toString('utf8')).split('\n');partials.set(file,lines.pop());
      for(const line of lines){try{const e=JSON.parse(line),type=e.type==='event_msg'?e.payload?.type:e.type;
        if(['task_started','turn_started','token_count'].includes(type)){events[type]=(events[type]||0)+1;files.add(path.relative(root,file));}
      }catch{}}
    }catch{}
  }
}
const timer=setInterval(scan,5000);
setTimeout(()=>{clearInterval(timer);scan();const result={startedAt:new Date(start).toISOString(),endedAt:new Date().toISOString(),elapsedMs:Date.now()-start,initialFiles,finalFiles:list(root).length,scans,resetFiles,events,eventFiles:[...files]};fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));},duration);
