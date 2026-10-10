// User-selected files are copied locally. No network, model or subprocess APIs.
const fs=require('node:fs/promises'),path=require('node:path');
const STATES=['ready','tired','low','exhausted'],MAX_BYTES=10*1024*1024;
const defaults=()=>({background:true,zoom:1,x:0,y:0,images:{}});
function safeName(value){
  if(typeof value!=='string'||value!==value.trim()||value.length<1||value.length>64||/[<>:"/\\|?*\x00-\x1f]/.test(value)||/[. ]$/.test(value)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw Error('角色名需为 1–64 字，不能含路径符号或系统保留名称。');
  return value;
}
function imageInfo(buffer){
  let width,height,ext,mime;
  if(buffer.length>=33&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.toString('ascii',12,16)==='IHDR'){
    width=buffer.readUInt32BE(16);height=buffer.readUInt32BE(20);ext='png';mime='image/png';
  }else if(buffer.length>=13&&/^GIF8[79]a$/.test(buffer.toString('ascii',0,6))){width=buffer.readUInt16LE(6);height=buffer.readUInt16LE(8);ext='gif';mime='image/gif';
  }else if(buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255){
    // Walk length-delimited JPEG segments up to a Start Of Frame, not filename.
    let offset=2;
    while(offset<buffer.length){
      if(buffer[offset++]!==255)break;while(buffer[offset]===255)offset++;
      const marker=buffer[offset++];if(marker===undefined||marker===0||marker===217||marker===218)break;
      if(marker===216||marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>buffer.length)break;const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
        if(length>=8&&buffer[offset+7]>0&&length>=8+3*buffer[offset+7]){height=buffer.readUInt16BE(offset+3);width=buffer.readUInt16BE(offset+5);ext='jpg';mime='image/jpeg';}break;
      }offset+=length;
    }
  }else if(buffer.length>=26&&buffer.toString('ascii',0,2)==='BM'){
    const dib=buffer.readUInt32LE(14);
    if(dib===12&&buffer.readUInt16LE(22)===1){width=buffer.readUInt16LE(18);height=buffer.readUInt16LE(20);}
    else if(dib>=40&&dib<=buffer.length-14&&buffer.readUInt16LE(26)===1){width=buffer.readInt32LE(18);height=Math.abs(buffer.readInt32LE(22));}
    if(width>0&&height>0){ext='bmp';mime='image/bmp';}
  }else if(buffer.length>=30&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'){
    const type=buffer.toString('ascii',12,16);ext='webp';mime='image/webp';
    if(type==='VP8X'){width=buffer.readUIntLE(24,3)+1;height=buffer.readUIntLE(27,3)+1;}
    else if(type==='VP8 '&&buffer.subarray(23,26).equals(Buffer.from([157,1,42]))){width=buffer.readUInt16LE(26)&16383;height=buffer.readUInt16LE(28)&16383;}
    else if(type==='VP8L'&&buffer[20]===47){const bits=buffer.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  }
  if(!ext||!width||!height)throw Error('请选择 PNG / JPG / JPEG / WebP / GIF / BMP 格式的图片。文件内容无效或不受支持。');
  if(width>4096||height>4096)throw Error('图片单边不能超过 4096px，请先缩小后再上传。');
  return {width,height,ext,mime};
}
class CharacterStore{
  constructor(root){this.root=path.resolve(root);this.active=null;}
  async init(){await fs.mkdir(this.root,{recursive:true});if((await fs.lstat(this.root)).isSymbolicLink())throw Error('角色目录不能是链接。');try{const q=JSON.parse(await fs.readFile(path.join(this.root,'active.json'),'utf8'));this.active=safeName(q.name);}catch{};}
  directory(name){safeName(name);const dir=path.resolve(this.root,name);if(path.dirname(dir)!==this.root)throw Error('角色路径无效。');return dir;}
  async checked(name){const dir=this.directory(name),stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink()||path.resolve(await fs.realpath(dir))!==dir)throw Error('角色目录不能是链接。');return dir;}
  async read(name){const dir=await this.checked(name);try{const f=path.join(dir,'settings.json');if((await fs.lstat(f)).isSymbolicLink())throw Error();const q=JSON.parse(await fs.readFile(f,'utf8'));return {...defaults(),...this.validSettings(q),images:Object.fromEntries(STATES.filter(s=>new RegExp('^'+s+'\\.(png|jpg|jpeg|webp|gif|bmp)$').test(q.images?.[s])).map(s=>[s,q.images[s]]))};}catch{return defaults();}}
  validSettings(value){const q={};for(const k of ['zoom','x','y'])if(k in value){const min=k==='zoom'?.5:-1,max=k==='zoom'?3:1;if(!Number.isFinite(value[k])||value[k]<min||value[k]>max)throw Error('取景参数超出范围。');q[k]=value[k];}if('background'in value){if(typeof value.background!=='boolean')throw Error('去背景开关无效。');q.background=value.background;}return q;}
  async write(file,value){try{if((await fs.lstat(file)).isSymbolicLink())throw Error('设置文件不能是链接。');}catch(e){if(e.code!=='ENOENT')throw e;}const temp=file+'.tmp';try{if((await fs.lstat(temp)).isSymbolicLink())throw Error('临时文件不能是链接。');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.writeFile(temp,JSON.stringify(value,null,2),{flag:'w'});await fs.rename(temp,file);}
  async names(){return (await fs.readdir(this.root,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.isSymbolicLink()).map(e=>e.name).filter(n=>{try{safeName(n);return true;}catch{return false;}}).sort((a,b)=>a.localeCompare(b));}
  async create(name){const dir=this.directory(name);if((await this.names()).some(n=>n.toLowerCase()===name.toLowerCase()))throw Error('该角色名已存在。');await fs.mkdir(dir);await this.write(path.join(dir,'settings.json'),defaults());await this.select(name);}
  async select(name){await this.checked(name);await this.write(path.join(this.root,'active.json'),{name});this.active=name;}
  async rename(name,next){const old=await this.checked(name),target=this.directory(next);if(next===name)return;if((await this.names()).some(n=>n.toLowerCase()===next.toLowerCase()))throw Error('该角色名已存在。');await fs.rename(old,target);if(this.active===name)await this.select(next);}
  async remove(name){const dir=await this.checked(name);const realRoot=path.resolve(await fs.realpath(this.root));if(path.dirname(path.resolve(await fs.realpath(dir)))!==realRoot)throw Error('删除目标不在角色目录内。');await fs.rm(dir,{recursive:true,force:false});if(this.active===name){const names=await this.names();this.active=names[0]||null;await this.write(path.join(this.root,'active.json'),{name:this.active});}}
  async settings(name,patch){const dir=await this.checked(name),q=await this.read(name);Object.assign(q,this.validSettings(patch));await this.write(path.join(dir,'settings.json'),q);}
  async importFile(name,state,source){
    if(!STATES.includes(state))throw Error('角色状态无效。');const dir=await this.checked(name);const fd=await fs.open(source,'r');let buffer;
    try{const stat=await fd.stat();if(!stat.isFile())throw Error('请选择图片文件。');if(stat.size>MAX_BYTES)throw Error('单文件不能超过 10 MiB。');buffer=Buffer.alloc(stat.size);let offset=0;while(offset<buffer.length){const q=await fd.read(buffer,offset,buffer.length-offset,offset);if(!q.bytesRead)throw Error('图片读取不完整。');offset+=q.bytesRead;}}finally{await fd.close();}
    const info=imageInfo(buffer),filename=state+'.'+info.ext,destination=path.join(dir,filename);
    if(path.resolve(source)!==destination){try{if((await fs.lstat(destination)).isSymbolicLink())throw Error('素材目标不能是链接。');}catch(e){if(e.code!=='ENOENT')throw e;}const temp=destination+'.import';await fs.writeFile(temp,buffer,{flag:'wx'});try{await fs.rename(temp,destination);}finally{await fs.unlink(temp).catch(()=>{});}}
    const q=await this.read(name);q.images[state]=filename;await this.write(path.join(dir,'settings.json'),q);return info;
  }
  async asset(name,state){if(!STATES.includes(state))throw Error('角色状态无效。');const dir=await this.checked(name),q=await this.read(name),filename=q.images[state];if(!filename)throw Error('未设置');const file=path.join(dir,filename);if((await fs.lstat(file)).isSymbolicLink())throw Error('素材不能是链接。');const buffer=await fs.readFile(file);if(buffer.length>MAX_BYTES)throw Error('单文件不能超过 10 MiB。');return {buffer,...imageInfo(buffer)};}
  async snapshot(){
    const characters=[];for(const name of await this.names()){const settings=await this.read(name),images={};for(const state of STATES)if(settings.images[state])try{const f=path.join(await this.checked(name),settings.images[state]),stat=await fs.lstat(f);if(stat.isFile()&&!stat.isSymbolicLink())images[state]={url:'character://local/'+encodeURIComponent(name)+'/'+state+'?v='+stat.mtimeMs};}catch{};delete settings.images;characters.push({name,settings,images});}
    if(!characters.some(c=>c.name===this.active))this.active=characters[0]?.name||null;return {active:this.active,characters};
  }
}
module.exports={CharacterStore,imageInfo,STATES};
