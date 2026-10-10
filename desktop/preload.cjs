const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('widget',{
  ready:()=>ipcRenderer.send('ready'),
  gesture:value=>ipcRenderer.send('gesture',value),
  collapse:()=>ipcRenderer.send('collapse'),
  quota:callback=>ipcRenderer.on('quota',(_event,value)=>callback(value)),
  layout:callback=>ipcRenderer.on('layout',(_event,value)=>callback(value))
});
