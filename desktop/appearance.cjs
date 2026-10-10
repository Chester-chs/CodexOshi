const {ipcMain}=require('electron'),{AppearanceStore}=require('../runtime/appearance.cjs');
function installAppearance(win,data){
  const store=new AppearanceStore(data);
  ipcMain.handle('appearance-read',event=>event.sender===win.webContents?store.read():null);
  ipcMain.handle('appearance-save',async(event,value)=>{
    if(event.sender!==win.webContents)return {ok:false,error:'外观操作无效。'};
    try{return {ok:true,settings:await store.save(value)};}catch{return {ok:false,error:'配色未能保存，请检查主题选择和本机文件权限。'};}
  });
}
module.exports={installAppearance};
