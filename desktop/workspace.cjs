const path=require('node:path');
const tabs=['quota','token','character','appearance'];
// A normal, user-opened window. It never resizes or shapes the transparent widget.
function createWorkspace(overlay,{BrowserWindow,ipcMain}){
  let win=null;
  const current=()=>win&&!win.isDestroyed()?win:null;
  ipcMain.on('open-workspace',async(event,tab)=>{
    if(event.sender!==overlay.webContents&&event.sender!==current()?.webContents)return;
    if(!tabs.includes(tab))return;
    if(current()){win.webContents.send('select-tab',tab);if(win.isMinimized())win.restore();win.show();win.focus();return;}
    win=new BrowserWindow({title:'Codex 额度 · 用量与设置',width:840,height:680,minWidth:540,minHeight:520,show:false,autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const opened=win;opened.webContents.setWindowOpenHandler(()=>({action:'deny'}));opened.webContents.on('will-navigate',event=>event.preventDefault());
    opened.on('closed',()=>{if(win===opened)win=null;});
    try{await opened.loadFile(path.join(__dirname,'ui/index.html'),{query:{workspace:'true',tab}});if(!opened.isDestroyed())opened.show();}catch{if(!opened.isDestroyed())opened.close();}
  });
  return {window:current,owns:sender=>sender===current()?.webContents,send:(channel,value)=>current()?.webContents.send(channel,value),close:()=>current()?.close()};
}
module.exports={createWorkspace};
