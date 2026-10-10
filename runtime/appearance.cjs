// Appearance only: fixed local path, no account, network, image or position access.
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const model=require('../desktop/ui/appearance-model.js');
class AppearanceStore{
  constructor(root){this.root=path.resolve(root);this.file=path.join(this.root,'appearance.json');this.queue=Promise.resolve();}
  async read(){try{const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)return model.defaults();return model.validate(JSON.parse(await fs.readFile(this.file,'utf8')));}catch{return model.defaults();}}
  async save(value){const settings=model.validate(value);const operation=async()=>{
    await fs.mkdir(this.root,{recursive:true});if((await fs.lstat(this.root)).isSymbolicLink())throw Error('外观目录不能是链接。');
    try{if((await fs.lstat(this.file)).isSymbolicLink())throw Error('外观设置不能是链接。');}catch(error){if(error.code!=='ENOENT')throw error;}
    const temp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(settings,null,2),{flag:'wx'});await fs.rename(temp,this.file);}finally{await fs.unlink(temp).catch(()=>{});}
    return settings;
  };const result=this.queue.then(operation,operation);this.queue=result.catch(()=>{});return result;}
}
module.exports={AppearanceStore};
