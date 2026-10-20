const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
function parseState(line){
  try{
    const state=JSON.parse(line);
    if(state.mode==='permission')return state;
    if(state.mode==='hidden')return {hostAlive:true,visible:false,attached:false};
    const b=state.bounds;
    if(state.mode!=='attached'||!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.width<1||b.height<1)return null;
    return {hostAlive:true,visible:true,attached:true,dpi:96,bounds:b};
  }catch{return null;}
}
function follow({screen,onState}){
  let child,closed=false,pending='';
  const fallback=()=>{if(!closed)onState({hostAlive:true,visible:true,attached:true,dpi:96,bounds:screen.getPrimaryDisplay().workArea});};
  const binary=path.join(__dirname,'window-observer');
  fallback();
  if(fs.existsSync(binary)){
    child=spawn(binary,[],{stdio:['ignore','pipe','ignore']});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      pending+=chunk;if(pending.length>65536){pending='';return;}
      let end;while((end=pending.indexOf('\n'))>=0){
        const state=parseState(pending.slice(0,end));pending=pending.slice(end+1);
        if(state?.mode==='permission')fallback();else if(state&&!closed)onState(state);
      }
    });
    child.on('error',fallback);child.on('exit',fallback);
  }
  return {close(){closed=true;child?.kill();}};
}
module.exports={follow,parseState};
