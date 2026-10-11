const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const MAX_BYTES=10*1024*1024,ID=/^[a-f0-9]{32}$/;
function audioType(buffer){
  if(buffer.length>=44&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WAVE')return 'audio/wav';
  if(buffer.length>=10&&(buffer.toString('ascii',0,3)==='ID3'||buffer[0]===255&&(buffer[1]&224)===224&&(buffer[1]&6)!==0))return 'audio/mpeg';
  if(buffer.length>=27&&buffer.toString('ascii',0,4)==='OggS')return 'audio/ogg';
  if(buffer.length>=42&&buffer.toString('ascii',0,4)==='fLaC')return 'audio/flac';
  if(buffer.length>=16&&buffer.toString('ascii',4,8)==='ftyp')return 'audio/mp4';
  throw Error('请选择可播放的 WAV、MP3、OGG、M4A 或 FLAC 音效。');
}
async function readAudio(file){
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('请选择本机音效文件。');
  const fd=await fs.open(file,'r');
  try{const stat=await fd.stat();if(!stat.isFile())throw Error('请选择本机音效文件。');if(stat.size<1||stat.size>MAX_BYTES)throw Error('音效文件不能超过 10 MiB。');
    const buffer=Buffer.alloc(stat.size);let offset=0;while(offset<buffer.length){const {bytesRead}=await fd.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)throw Error('音效读取失败，请重新选择。');offset+=bytesRead;}
    return {buffer,mime:audioType(buffer)};
  }finally{await fd.close();}
}
class SoundStore{
  constructor(root){this.root=path.resolve(root);this.file=path.join(this.root,'active.json');this.active=null;this.pending=new Map();}
  async checked(){const stat=await fs.lstat(this.root);if(!stat.isDirectory()||stat.isSymbolicLink()||path.resolve(await fs.realpath(this.root))!==this.root)throw Error('音效目录无效。');}
  assetPath(id){if(typeof id!=='string'||!ID.test(id))throw Error('音效无效。');return path.join(this.root,id+'.audio');}
  public(value){return value?{...value,url:'sound://local/'+value.id}:null;}
  async init(){await fs.mkdir(this.root,{recursive:true});await this.checked();try{const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error();const value=JSON.parse(await fs.readFile(this.file,'utf8'));if(value&&ID.test(value.id)&&typeof value.name==='string'&&value.name.length<=128){await readAudio(this.assetPath(value.id));this.active={id:value.id,name:value.name};}}catch{}
    // Only this store's unselected copies are cleaned; original uploads stay untouched.
    for(const name of await fs.readdir(this.root))if(/^[a-f0-9]{32}\.audio$/.test(name)&&name!==this.active?.id+'.audio')await fs.unlink(path.join(this.root,name)).catch(()=>{});
  }
  async snapshot(){return {custom:this.public(this.active)};}
  async stage(source){await this.checked();const {buffer}=await readAudio(source),id=randomUUID().replaceAll('-',''),value={id,name:path.basename(source).replace(/[\x00-\x1f]/g,'').slice(0,128)};
    // A later file selection supersedes an uncommitted selection.
    for(const pending of [...this.pending.keys()])await this.discard(pending);
    await fs.writeFile(this.assetPath(id),buffer,{flag:'wx'});this.pending.set(id,value);return this.public(value);
  }
  async select(id){await this.checked();let value=null;if(id!==null){if(id===this.active?.id)return this.snapshot();value=this.pending.get(id);if(!value)throw Error('音效无效。');await readAudio(this.assetPath(id));}
    try{if((await fs.lstat(this.file)).isSymbolicLink())throw Error('音效设置文件无效。');}catch(error){if(error.code!=='ENOENT')throw error;}
    const temp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value),{flag:'wx'});await fs.rename(temp,this.file);}finally{await fs.unlink(temp).catch(()=>{});}
    const previous=this.active;this.active=value;if(id)this.pending.delete(id);if(previous&&previous.id!==id)await fs.unlink(this.assetPath(previous.id)).catch(()=>{});return this.snapshot();
  }
  async discard(id){if(!this.pending.has(id))return;await this.checked();this.pending.delete(id);await fs.unlink(this.assetPath(id)).catch(()=>{});}
  async asset(id){await this.checked();if(id!==this.active?.id&&!this.pending.has(id))throw Error('音效无效。');return readAudio(this.assetPath(id));}
}
module.exports={SoundStore,MAX_BYTES,audioType};
