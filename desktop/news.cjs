const {NewsService}=require('../runtime/news-service.cjs'),{REPO}=require('../runtime/public-news.cjs');
const {noticeText}=require('./ui/news-model.js');
const version=require('../package.json').version;
function installNews({win,data,ipcMain,Notification,shell,isActive,language}){
  const send=state=>{if(!win.isDestroyed())win.webContents.send('news-state',state);};
  const service=new NewsService({data,version,onChange:send,onNotice:notice=>{
    if(!isActive()||win.isDestroyed())return false;
    try{if(!Notification?.isSupported())return true;const en=language()==='en-US',notification=new Notification({title:notice.type==='version'?'Codi':(en?'Codex reset announcement':'Codex 重置公告'),body:notice.type==='version'?(en?'Codi '+notice.version+' is available.':'Codi '+notice.version+' 可更新。'):noticeText(notice.notice,language()),silent:true});notification.on('click',()=>{const url=notice.type==='version'?REPO:notice.notice.url;if(safeUrl(url))shell.openExternal(url).catch(()=>{});});notification.show();return true;}catch{return false;}
  }});
  const valid=event=>event.sender===win.webContents&&!win.isDestroyed();
  ipcMain.handle('news-read',event=>valid(event)?service.snapshot():null);
  ipcMain.handle('news-check',async(event,kind)=>{if(!valid(event)||!isActive()||!['version','tibo'].includes(kind))return {ok:false};try{return {ok:true,state:await service.check(kind,true)};}catch{return {ok:false};}});
  ipcMain.handle('news-enabled',(event,value)=>{if(!valid(event)||typeof value!=='boolean')return {ok:false};try{const state=service.configure(value);send(state);return {ok:true,state};}catch{return {ok:false};}});
  ipcMain.handle('news-open',async(event,kind)=>{if(!valid(event)||!['version','tibo'].includes(kind))return {ok:false};const url=kind==='version'?REPO:(service.snapshot().tibo.notice?.url||'https://x.com/thsottiaux');if(!safeUrl(url))return {ok:false};try{await shell.openExternal(url);return {ok:true};}catch{return {ok:false};}});
  return {poll:async()=>{if(isActive()&&service.state.enabled)await Promise.allSettled(['version','tibo'].map(kind=>service.check(kind)));},close:()=>service.close()};
}
function safeUrl(url){return url===REPO||url==='https://x.com/thsottiaux'||/^https:\/\/x\.com\/thsottiaux\/status\/\d{1,25}$/.test(url);}
module.exports={installNews,safeUrl};
