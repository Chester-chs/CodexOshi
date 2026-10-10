const {app,BrowserWindow,ipcMain,screen} = require('electron');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const {shape,viewport,layout}=require('./geometry.cjs');
const {QuotaReader}=require('../runtime/quota.cjs');
const {Worker}=require('node:worker_threads');
const {visibility}=require('./visibility.cjs');
const data=process.argv[process.argv.indexOf('--data')+1];
if (!data || process.argv.indexOf('--data')<0) throw new Error('Launcher required');
app.setPath('userData',path.join(data,'chromium'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
let win,ready=false,host={},region=[{x:0,y:0,width:1,height:1}],widget=null,clicks=0,dragging=false;
let dip={width:1,height:1};
let bridge,receivedAt=Date.now(),expanded=false,viewLayout=null,pollTimer,tokenTimer,tokenWorker;
let tokens={values:null,coverage:'indexing',filesIndexed:0,filesDiscovered:0};
let savedQuota=null;
try{savedQuota=JSON.parse(fs.readFileSync(path.join(data,'quota-state.json'),'utf8'));}catch{}
const reader=new QuotaReader({snapshot:savedQuota || undefined,lastRpcAttemptAt:savedQuota?.lastRpcAttemptAt});
const stateFile=path.join(data,'window-state.json');
function diagnostic(){
  fs.writeFileSync(stateFile,JSON.stringify({updatedAt:Date.now(),pid:process.pid,hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString(),host,viewport:dip,widget,region,clicks,dragging,expanded,quota:reader.snapshot,tokens,visible:win.isVisible(),focused:win.isFocused()},null,2));
}
function updateShape(){
  viewLayout=layout(widget,dip.width,dip.height,expanded,reader.snapshot.windows.length);widget=viewLayout.widget;
  region=shape(viewLayout.regions,dip.width,dip.height,viewLayout.sizes);
  win.setShape(region);
  if(ready)win.webContents.send('layout',viewLayout);
}
app.whenReady().then(async()=>{
  win=new BrowserWindow({title:'Codex Quota Widget',width:1,height:1,type:'toolbar',transparent:true,frame:false,thickFrame:false,
    resizable:false,maximizable:false,fullscreenable:false,hasShadow:false,skipTaskbar:true,focusable:true,show:false,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.setShape([{x:0,y:0,width:1,height:1}]);
  win.setIgnoreMouseEvents(true,{forward:true});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((wc,permission,callback)=>callback(false));
  const show=visibility(win);
  function sync(){
    if(host.bounds){
      dip=viewport(host.bounds.width,host.bounds.height,host.dpi);
      if(win.getSize()[0]!==dip.width || win.getSize()[1]!==dip.height) win.setSize(dip.width,dip.height,false);
      updateShape();
    }
    show({...host,ready});
    diagnostic();
  }
  ipcMain.on('ready',event=>{if(event.sender!==win.webContents)return;ready=true;win.webContents.send('quota',reader.snapshot);win.webContents.send('tokens',tokens);sync()});
  ipcMain.on('read-tokens',event=>{if(event.sender===win.webContents)readTokens();});
  ipcMain.on('collapse',event=>{if(event.sender!==win.webContents)return;expanded=false;updateShape();diagnostic();});
  ipcMain.on('gesture',(event,value)=>{
    if(event.sender!==win.webContents || !value || typeof value!=='object')return;
    if(value.type==='drag'){
      if(!Number.isFinite(value.x)||!Number.isFinite(value.y))return;
      dragging=true;widget={x:value.x,y:value.y};updateShape();
    } else if(value.type==='end'){
      dragging=false;
      fs.writeFileSync(path.join(data,'position.json'),JSON.stringify(widget));
    } else if(value.type==='click'){clicks++;expanded=!expanded;updateShape();}
    diagnostic();
  });
  try {const saved=JSON.parse(fs.readFileSync(path.join(data,'position.json'),'utf8'));if(Number.isFinite(saved.x)&&Number.isFinite(saved.y))widget=saved;}catch{}
  await win.loadFile(path.join(__dirname,'ui','index.html'));
  function readTokens(){
    if(!tokenWorker){
      const worker=tokenWorker=new Worker(path.join(__dirname,'../runtime/token-worker.cjs'),{workerData:{cacheFile:path.join(data,'token-index.json')}});
      worker.on('message',message=>{
        if(message?.type!=='tokens'||win.isDestroyed())return;tokens=message.value;
        try{const temp=path.join(data,'tokens-state.json.tmp');fs.writeFileSync(temp,JSON.stringify(tokens,null,2));fs.renameSync(temp,path.join(data,'tokens-state.json'));}catch{}
        if(ready)win.webContents.send('tokens',tokens);diagnostic();
      });
      worker.on('error',()=>{tokens={...tokens,coverage:'partial',readErrors:1};if(ready&&!win.isDestroyed())win.webContents.send('tokens',tokens);});
      worker.on('exit',()=>{if(tokenWorker===worker)tokenWorker=null;});
    }
    tokenWorker.postMessage({type:'read'});
  }
  readTokens();tokenTimer=setInterval(readTokens,30000);
  async function refresh(){
    const quota=await reader.refresh();if(win.isDestroyed())return;
    try{const temp=path.join(data,'quota-state.json.tmp');fs.writeFileSync(temp,JSON.stringify(quota,null,2));fs.renameSync(temp,path.join(data,'quota-state.json'));}catch{}
    if(ready){win.webContents.send('quota',quota);updateShape();}diagnostic();
  }
  refresh().catch(()=>{});pollTimer=setInterval(()=>refresh().catch(()=>{}),30000);
  const pipeName='codex-quota-widget-'+process.pid+'-'+crypto.randomBytes(12).toString('hex');
  const token=crypto.randomBytes(32).toString('hex');
  bridge=net.createServer(socket=>{
    let pending='';socket.setEncoding('utf8');
    socket.on('data',chunk=>{
      pending+=chunk;if(pending.length>16384){socket.destroy();return;}
      let newline;
      while((newline=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1);
        try{
          const message=JSON.parse(line);
          if(message.token!==token){socket.destroy();return;}
          receivedAt=Date.now();
          if(message.state.stop){app.quit();return;}
          host=message.state;sync();
        }catch(error){process.stderr.write(error.message+'\n');win.hide();socket.destroy();}
      }
    });
    socket.on('error',()=>{});
  });
  bridge.listen('\\\\.\\pipe\\'+pipeName,()=>fs.writeFileSync(path.join(data,'bridge.json'),JSON.stringify({pid:process.pid,pipe:pipeName,token,hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString()})));
  setInterval(()=>{if(Date.now()-receivedAt>3500){win.hide();app.quit();}},1000);
  // While shaped, only visible widget pixels can ever receive a click.
  // Cursor polling switches hit reception before the first mouse-down.
  let accepting=false;
  setInterval(()=>{
    if(!win || win.isDestroyed())return;
    const cursor=screen.getCursorScreenPoint(),bounds=win.getBounds();
    const x=cursor.x-bounds.x,y=cursor.y-bounds.y;
    const hit=dragging || region.some(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height);
    if(hit!==accepting){accepting=hit;win.setIgnoreMouseEvents(!hit,{forward:true});}
  },16);
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{clearInterval(pollTimer);clearInterval(tokenTimer);tokenWorker?.terminate();if(bridge)bridge.close();});
