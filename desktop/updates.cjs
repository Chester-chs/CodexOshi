const path=require('node:path');
const {UpdateService}=require('../runtime/update-service.cjs');
function installUpdates({win,data,ipcMain}){
  if(process.platform==='darwin'){
    const state={status:'failed',error:'unsupported_installation',updatedAt:0};
    const valid=event=>!win.isDestroyed()&&event.sender===win.webContents;
    ipcMain.handle('update-read',event=>valid(event)?state:null);
    ipcMain.handle('update-start',event=>valid(event)?{ok:false,error:'unsupported_installation'}:{ok:false});
    return {close(){}};
  }
  const service=new UpdateService({data,appRoot:path.resolve(__dirname,'..'),currentVersion:require('../package.json').version,onChange:state=>{if(!win.isDestroyed())win.webContents.send('update-state',state);}});
  const valid=event=>!win.isDestroyed()&&event.sender===win.webContents;
  ipcMain.handle('update-read',event=>{if(!valid(event))return null;service.recover();return service.snapshot();});
  ipcMain.handle('update-start',event=>valid(event)?service.start():{ok:false});
  return {close:()=>service.close()};
}
module.exports={installUpdates};
