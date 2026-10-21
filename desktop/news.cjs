const {NewsService}=require('../runtime/news-service.cjs'),{REPO}=require('../runtime/public-news.cjs');
const version=require('../package.json').version;
function installNews({win,data,ipcMain,Notification,shell,isActive,language}){
  const send=state=>{if(!win.isDestroyed())win.webContents.send('news-state',state);};
  const service=new NewsService({data,version,onChange:send,onNotice:notice=>{
    if(!isActive()||win.isDestroyed())return false;
    try{if(!Notification?.isSupported())return true;const en=language()==='en-US',notification=new Notification({title:'CodexOshi',body:en?'CodexOshi '+notice.version+' is available.':'CodexOshi '+notice.version+' 可更新。',silent:true});notification.on('click',()=>{shell.openExternal(REPO).catch(()=>{});});notification.show();return true;}catch{return false;}
  }});
  const valid=event=>event.sender===win.webContents&&!win.isDestroyed();
  ipcMain.handle('news-read',event=>valid(event)?service.snapshot():null);
  ipcMain.handle('news-check',async(event,kind)=>{if(!valid(event)||!isActive()||kind!=='version')return {ok:false};try{return {ok:true,state:await service.check(kind,true)};}catch{return {ok:false};}});
  ipcMain.handle('news-enabled',(event,value)=>{if(!valid(event)||typeof value!=='boolean')return {ok:false};try{const state=service.configure(value);send(state);return {ok:true,state};}catch{return {ok:false};}});
  ipcMain.handle('news-open',async(event,kind)=>{if(!valid(event)||kind!=='version')return {ok:false};try{await shell.openExternal(REPO);return {ok:true};}catch{return {ok:false};}});
  return {poll:async()=>{if(isActive()&&service.state.enabled)await service.check('version');},close:()=>service.close()};
}
function safeUrl(url){return url===REPO;}
module.exports={installNews,safeUrl};
