const path=require('node:path'),{SoundStore}=require('../runtime/sounds.cjs'),i18n=require('./ui/i18n.js');
async function installSounds(win,data,api=require('electron')){
  const {ipcMain,protocol,dialog}=api,store=new SoundStore(path.join(data,'sounds'));await store.init();let queue=Promise.resolve();
  const publish=async()=>{const state=await store.snapshot();if(!win.isDestroyed())win.webContents.send('sound-state',state);return state;};
  protocol.handle('sound',async request=>{try{const url=new URL(request.url);if(request.method!=='GET'||url.hostname!=='local'||url.search||url.hash||!/^\/[a-f0-9]{32}$/.test(url.pathname))throw Error();const asset=await store.asset(url.pathname.slice(1));return new Response(asset.buffer,{headers:{'Content-Type':asset.mime,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});}catch{return new Response('Sound unavailable',{status:404});}});
  ipcMain.handle('sound-read',event=>event.sender===win.webContents?store.snapshot():null);
  for(const action of ['import','select','preset','discard'])ipcMain.handle('sound-'+action,(event,value)=>{
    if(event.sender!==win.webContents)return {ok:false};
    const operation=async()=>{try{
      if(action==='import'){
        const locale=value==='en-US'?'en-US':'zh-CN',t=key=>i18n.t(key,{},locale);
        const choice=await dialog.showOpenDialog(win,{title:t('选择本机音效'),filters:[{name:t('音效文件'),extensions:['wav','mp3','ogg','m4a','flac']}],properties:['openFile','dontAddToRecent']});
        if(choice.canceled||!choice.filePaths?.[0])return {ok:true,canceled:true};return {ok:true,candidate:await store.stage(choice.filePaths[0])};
      }
      if(action==='discard'){await store.discard(value);return {ok:true};}
      if(action==='preset')await store.selectPreset(value);else await store.select(value);return {ok:true,state:await publish()};
    }catch(error){return {ok:false,error:error.message||'音效设置未能保存，请重试。'};}};
    const result=queue.then(operation);queue=result.catch(()=>{});return result;
  });
  return store;
}
module.exports={installSounds};
