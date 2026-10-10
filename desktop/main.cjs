const {app,BrowserWindow,ipcMain,screen,protocol} = require('electron');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const {shape,viewport,layout,snap,COMPACT}=require('./geometry.cjs');
const {portraitSize}=require('./ui/portrait-size.js');
const {QuotaReader}=require('../runtime/quota.cjs');
const {Worker}=require('node:worker_threads');
const {visibility}=require('./visibility.cjs');
const {CharacterStore}=require('../runtime/characters.cjs');
const {installCharacters}=require('./characters.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'character',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
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
let characterSize={...COMPACT};
let panelScroll=null;
let diagnosticTimer,layoutTimer,checkpointTimer;
let pendingQuota=null,pendingTokens=null;
try{savedQuota=JSON.parse(fs.readFileSync(path.join(data,'quota-state.json'),'utf8'));}catch{}
const reader=new QuotaReader({snapshot:savedQuota || undefined,lastRpcAttemptAt:savedQuota?.lastRpcAttemptAt});
const stateFile=path.join(data,'window-state.json');
function writeDiagnostic(){
  fs.writeFileSync(stateFile,JSON.stringify({updatedAt:Date.now(),pid:process.pid,hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString(),host,viewport:dip,widget,region,clicks,dragging,expanded,panelScroll,quota:reader.snapshot,tokens,visible:win.isVisible(),focused:win.isFocused()},null,2));
}
function diagnostic(){
  if(dragging){if(!diagnosticTimer)diagnosticTimer=setTimeout(()=>{diagnosticTimer=null;writeDiagnostic();},500);return;}
  clearTimeout(diagnosticTimer);diagnosticTimer=null;writeDiagnostic();
}
function savePosition(){fs.writeFileSync(path.join(data,'position.json'),JSON.stringify(widget));}
function sendLayout(){if(ready)win.webContents.send('layout',{...viewLayout,dragging});}
function notifyLayout(){
  if(dragging){if(!layoutTimer)layoutTimer=setTimeout(()=>{layoutTimer=null;sendLayout();},16);return;}
  clearTimeout(layoutTimer);layoutTimer=null;sendLayout();
}
function beginDrag(){
  if(dragging)return;dragging=true;
  checkpointTimer=setTimeout(function checkpoint(){
    if(!dragging)return;savePosition();checkpointTimer=setTimeout(checkpoint,1000);
  },3000);
}
function saveSnapshot(file,value){
  try{const temp=path.join(data,file+'.tmp');fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,path.join(data,file));}catch{}
}
function updateShape(){
  const previous=widget;
  viewLayout=layout(widget,dip.width,dip.height,expanded,reader.snapshot.windows.length,characterSize);widget=viewLayout.widget;
  if(!dragging&&ready&&host.attached&&dip.width>32&&dip.height>32&&(previous?.x!==widget.x||previous?.y!==widget.y))savePosition();
  region=shape(viewLayout.regions,dip.width,dip.height,viewLayout.sizes);
  win.setShape(region);
  notifyLayout();
}
function wheelInput(wheel,host,region){
  if(!wheel||!Number.isFinite(host.dpi)||host.dpi<48||host.dpi>768||!['x','y','delta'].every(k=>Number.isInteger(wheel[k]))||wheel.x<0||wheel.y<0||wheel.x>32768||wheel.y>32768||Math.abs(wheel.delta)>32767)return null;
  const scale=host.dpi/96,x=Math.round(wheel.x/scale),y=Math.round(wheel.y/scale);
  if(!region.some(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height))return null;
  const modifiers=[];if(wheel.shift)modifiers.push('shift');if(wheel.control)modifiers.push('control');
  return {type:'mouseWheel',x,y,deltaX:0,deltaY:wheel.delta,wheelTicksY:wheel.delta/120,modifiers,canScroll:true};
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
  const characters=new CharacterStore(path.join(data,'characters'));await characters.init();installCharacters(win,characters);
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
  ipcMain.on('panel-scroll',(event,value)=>{
    if(event.sender!==win.webContents||!value||!['top','height','clientHeight','wheelEvents'].every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=100000))return;
    const roleTab=value.roleTab;
    if(!roleTab||!['x','y'].every(k=>Number.isInteger(roleTab[k])&&roleTab[k]>=0&&roleTab[k]<=32768)||!['quota','token','character'].includes(value.tab))return;
    panelScroll={top:value.top,height:value.height,clientHeight:value.clientHeight,wheelEvents:value.wheelEvents,tab:value.tab,roleTab:{x:roleTab.x,y:roleTab.y}};diagnostic();
  });
  ipcMain.on('character-size',(event,value)=>{
    if(event.sender!==win.webContents||!value||!['contentWidth','contentHeight'].every(k=>Number.isFinite(value[k])&&value[k]>0&&value[k]<=4096)||!Number.isFinite(value.targetHeight)||value.targetHeight<180||value.targetHeight>420)return;
    const next=portraitSize(value.contentWidth,value.contentHeight,value.targetHeight);
    if(next.width===characterSize.width&&next.height===characterSize.height)return;
    characterSize=next;
    // Decoding can finish before the host handshake; retain the saved position
    // until a real viewport is available instead of clamping it against 1×1.
    if(host.bounds&&dip.width>32&&dip.height>32){updateShape();diagnostic();}
  });
  ipcMain.on('collapse',event=>{if(event.sender!==win.webContents)return;expanded=false;updateShape();diagnostic();});
  ipcMain.on('gesture',(event,value)=>{
    if(event.sender!==win.webContents || !value || typeof value!=='object')return;
    if(value.type==='drag'){
      if(!Number.isFinite(value.x)||!Number.isFinite(value.y))return;
      beginDrag();widget={x:value.x,y:value.y};updateShape();diagnostic();return;
    } else if(value.type==='end'){
      if(dragging){widget=snap(widget,dip.width,dip.height,viewLayout.sizes[0]);updateShape();}
      dragging=false;clearTimeout(checkpointTimer);checkpointTimer=null;
      savePosition();notifyLayout();
      if(pendingQuota){saveSnapshot('quota-state.json',pendingQuota);pendingQuota=null;}
      if(pendingTokens){saveSnapshot('tokens-state.json',pendingTokens);pendingTokens=null;}
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
        if(dragging)pendingTokens=tokens;else saveSnapshot('tokens-state.json',tokens);
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
    if(dragging)pendingQuota=quota;else saveSnapshot('quota-state.json',quota);
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
          const {nativeWheel=[],...state}=message.state;host=state;sync();
          if(host.attached&&win.isVisible()&&Array.isArray(nativeWheel)&&nativeWheel.length<=32){
            for(const wheel of nativeWheel){
              const input=wheelInput(wheel,host,region);if(input)win.webContents.sendInputEvent(input);
            }
          }
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
app.on('before-quit',()=>{clearTimeout(diagnosticTimer);clearTimeout(layoutTimer);clearTimeout(checkpointTimer);clearInterval(pollTimer);clearInterval(tokenTimer);tokenWorker?.terminate();if(bridge)bridge.close();});
