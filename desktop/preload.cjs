const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('widget',{
  ready:()=>ipcRenderer.send('ready'),
  gesture:value=>ipcRenderer.send('gesture',value),
  layout:callback=>ipcRenderer.on('layout',(_event,value)=>callback(value))
});
