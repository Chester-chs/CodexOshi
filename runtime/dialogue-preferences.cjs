const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),model=require('../desktop/ui/dialogue-model.js');
class DialoguePreferencesStore{
  constructor(root){this.root=path.resolve(root);this.file=path.join(this.root,'dialogue-preferences.json');this.queue=Promise.resolve();}
  async read(){try{const s=await fs.lstat(this.file);if(!s.isFile()||s.isSymbolicLink()||s.size>4096)return model.defaults();return model.validate(JSON.parse(await fs.readFile(this.file,'utf8')));}catch{return model.defaults();}}
  async save(value){const settings=model.validate(value);const operation=async()=>{
    await fs.mkdir(this.root,{recursive:true});if((await fs.lstat(this.root)).isSymbolicLink())throw Error('设置目录不能是链接。');
    try{if((await fs.lstat(this.file)).isSymbolicLink())throw Error('设置文件不能是链接。');}catch(e){if(e.code!=='ENOENT')throw e;}
    const temp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(settings,null,2),{flag:'wx'});await fs.rename(temp,this.file);}finally{await fs.unlink(temp).catch(()=>{});}return settings;
  };const result=this.queue.then(operation,operation);this.queue=result.catch(()=>{});return result;}
}
module.exports={DialoguePreferencesStore};
