const {ipcMain}=require('electron'),{AppearanceStore}=require('../runtime/appearance.cjs');
function installAppearance(win,data,windows=()=>[win]){
  const store=new AppearanceStore(data);
  const allowed=sender=>windows().some(w=>!w.isDestroyed()&&w.webContents===sender);
  ipcMain.handle('appearance-read',event=>allowed(event.sender)?store.read():null);
  ipcMain.handle('appearance-save',async(event,value)=>{
    if(!allowed(event.sender))return {ok:false,error:'外观操作无效。'};
    try{const settings=await store.save(value);for(const target of windows())if(!target.isDestroyed()&&target.webContents!==event.sender)target.webContents.send('appearance-changed',settings);return {ok:true,settings};}catch{return {ok:false,error:'外观未能保存，请检查颜色和本机文件权限。'};}
  });
}
module.exports={installAppearance};
