const {ipcMain,protocol,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {installAppearance}=require('./appearance.cjs');
const i18n=require('./ui/i18n.js');
function installCharacters(win,store){
  installAppearance(win,path.dirname(store.root));
  protocol.handle('character',async request=>{
    try{
      const url=new URL(request.url);if(request.method!=='GET')throw Error();let buffer,mime;
      if(url.hostname==='placeholder'&&url.pathname==='/ready'){buffer=await fs.readFile(path.resolve(__dirname,'../assets/placeholder-ready.png'));mime='image/png';}
      else if(url.hostname==='local'){const parts=url.pathname.split('/');if(parts.length!==3)throw Error();const asset=await store.asset(decodeURIComponent(parts[1]),parts[2]);buffer=asset.buffer;mime=asset.mime;}
      else throw Error();
      return new Response(buffer,{headers:{'Content-Type':mime,'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
    }catch{return new Response('Image unavailable',{status:404});}
  });
  const publish=async()=>{const snapshot=await store.snapshot();if(!win.isDestroyed())win.webContents.send('characters',snapshot);return snapshot;};
  ipcMain.on('ready',event=>{if(event.sender===win.webContents)publish().catch(()=>{});});
  let queue=Promise.resolve();
  ipcMain.handle('character-action',(event,value)=>{
    if(event.sender!==win.webContents||!value||typeof value!=='object')return {ok:false,error:'角色操作无效。'};
    const operation=async()=>{
      try{
        const {action,name,patch}=value,text=(key,args)=>i18n.t(key,args,value.language==='en-US'?'en-US':'zh-CN');
        if(action==='select')await store.select(name);
        else if(action==='settings')await store.settings(name,patch||{});
        else if(action==='rename'){
          await store.checked(name);
          const choice=await dialog.showSaveDialog(win,{title:text('重命名角色：输入新名称'),buttonLabel:text('更名'),defaultPath:path.join(store.root,name+' 新名'),properties:['dontAddToRecent']});
          if(!choice.canceled&&choice.filePath)await store.rename(name,path.basename(choice.filePath));
        }else if(action==='import'){
          const choice=await dialog.showOpenDialog(win,{title:text('选择本机角色图片'),filters:[{name:text('角色图片'),extensions:['png','jpg','jpeg','webp','gif','bmp']},{name:text('所有文件（按图片内容校验）'),extensions:['*']}],properties:['openFile','dontAddToRecent']});
          if(!choice.canceled&&choice.filePaths[0])await store.uploadPortrait(choice.filePaths[0]);
        }else if(action==='delete'){
          await store.checked(name);const choice=await dialog.showMessageBox(win,{type:'question',message:text('删除角色“{name}”？',{name}),detail:text('删除本机保存的角色副本，原始图片保留。'),buttons:[text('取消'),text('删除')],defaultId:0,cancelId:0});if(choice.response===1)await store.remove(name);
        }else throw Error('角色操作无效。');
        return {ok:true,snapshot:await publish()};
      }catch(error){return {ok:false,error:error.message||'角色操作失败，请重试。'};}
    };
    const result=queue.then(operation,operation);queue=result.then(()=>{},()=>{});return result;
  });
}
module.exports={installCharacters};
