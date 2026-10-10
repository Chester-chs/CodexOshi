const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('widget',{
  ready:()=>ipcRenderer.send('ready'),
  gesture:value=>ipcRenderer.send('gesture',value),
  collapse:()=>ipcRenderer.send('collapse'),
  quota:callback=>ipcRenderer.on('quota',(_event,value)=>callback(value)),
  tokens:callback=>ipcRenderer.on('tokens',(_event,value)=>callback(value)),
  readTokens:()=>ipcRenderer.send('read-tokens'),
  characters:callback=>ipcRenderer.on('characters',(_event,value)=>callback(value)),
  characterAction:value=>ipcRenderer.invoke('character-action',value),
  characterSize:value=>ipcRenderer.send('character-size',value),
  panelScroll:value=>ipcRenderer.send('panel-scroll',value),
  layout:callback=>ipcRenderer.on('layout',(_event,value)=>callback(value))
});
