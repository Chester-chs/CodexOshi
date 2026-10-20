const {app,BrowserWindow,ipcMain,screen,protocol,Notification,shell} = require('electron');
const {installNews}=require('./news.cjs');
const {installUpdates}=require('./updates.cjs');
const {installSounds}=require('./sounds.cjs');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const {shape,viewport,layout,snap,residentSize,COMPACT}=require('./geometry.cjs');
const {portraitSize}=require('./ui/portrait-size.js');
const {QuotaReader}=require('../runtime/quota.cjs');
const {Worker}=require('node:worker_threads');
const {visibility}=require('./visibility.cjs');
const {bridgeHealth}=require('./bridge-health.cjs');
const {CharacterStore}=require('../runtime/characters.cjs');
const {installCharacters}=require('./characters.cjs');
const panelModel=require('./ui/panel-model.js');
const {PanelPreferencesStore}=require('../runtime/panel-preferences.cjs');
const dialogueModel=require('./ui/dialogue-model.js');
const isMac=process.platform==='darwin';
let macFollower;
function applyRegion(value){if(!isMac)win.setShape(value);}
const {DialoguePreferencesStore}=require('../runtime/dialogue-preferences.cjs');
protocol.registerSchemesAsPrivileged(['character','sound'].map(scheme=>({scheme,privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}})));
const data=process.argv[process.argv.indexOf('--data')+1];
if (!data || process.argv.indexOf('--data')<0) throw new Error('Launcher required');
app.setPath('userData',path.join(data,'chromium'));
if(isMac&&!app.requestSingleInstanceLock())app.quit();
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
let win,ready=false,host={},region=[{x:0,y:0,width:1,height:1}],widget=null,clicks=0,dragging=false;
let dip={width:1,height:1};
let bridge,health,bridgeTimer,expanded=false,viewLayout=null,pollTimer,tokenTimer,tokenWorker,pollStartTimer,pollingStarted=false;
let tokens={values:null,coverage:'indexing',filesIndexed:0,filesDiscovered:0};
let savedQuota=null;
let characterSize={...COMPACT};
let panelScroll=null;
let defaultPlacement=true;
let freePosition=null;
let diagnosticTimer,layoutTimer,checkpointTimer,news,newsTimer,updates;
let pendingQuota=null,pendingTokens=null;
let quitting=false;
const lifecycleFile=path.join(data,'lifecycle.log');
function recordLifecycle(event,details={}){
  try{
    if(fs.existsSync(lifecycleFile)&&fs.statSync(lifecycleFile).size>65536)fs.writeFileSync(lifecycleFile,'');
    fs.appendFileSync(lifecycleFile,JSON.stringify({at:new Date().toISOString(),pid:process.pid,event,...details})+'\n');
  }catch{}
}
recordLifecycle('process-start');
const panelStore=new PanelPreferencesStore(data);
let panelPreferences=panelModel.defaults(),panelOffset=null,panelResizing=false;
const dialogueStore=new DialoguePreferencesStore(data);
let dialoguePreferences=dialogueModel.defaults(),speechVisible=false,speechIndex=-1;
let textEditing=false,fieldEditing=false,keyboardMode=false;
function setTextEditing(value){
  fieldEditing=value;const retain=fieldEditing||keyboardMode;
  if(textEditing===retain)return;textEditing=retain;
  win.setTitle(retain?'Codex Quota Widget [Text editing]':'Codex Quota Widget');
}
function endPanelFocus(){keyboardMode=false;setTextEditing(false);}
try{savedQuota=JSON.parse(fs.readFileSync(path.join(data,'quota-state.json'),'utf8'));}catch{}
const reader=new QuotaReader({snapshot:savedQuota || undefined,lastRpcAttemptAt:savedQuota?.lastRpcAttemptAt,readResetCredits:true});
const stateFile=path.join(data,'window-state.json');
function writeDiagnostic(){
  fs.writeFileSync(stateFile,JSON.stringify({updatedAt:Date.now(),version:require('../package.json').version,pid:process.pid,hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString(),host,viewport:dip,widget,region,clicks,dragging,expanded,speechVisible,speechIndex,textEditing,panelScroll,widgetEnabled:widgetEnabled(),quota:reader.snapshot,tokens,visible:win.isVisible(),focused:win.isFocused()},null,2));
}
function diagnostic(){
  if(dragging||panelResizing){if(!diagnosticTimer)diagnosticTimer=setTimeout(()=>{diagnosticTimer=null;writeDiagnostic();},500);return;}
  clearTimeout(diagnosticTimer);diagnosticTimer=null;writeDiagnostic();
}
const docked=()=>panelPreferences.dockBottomRight!==false;
const widgetEnabled=()=>panelPreferences.widgetEnabled!==false;
const displaySize=(portrait=characterSize)=>panelPreferences.compactOnly?{width:Math.min(280,Math.max(180,portrait.width)),height:52}:portrait;
const currentResident=(portrait=characterSize)=>residentSize(displaySize(portrait),dip.width,dip.height,docked()&&!panelPreferences.compactOnly);
function savePosition(){if(docked())return;freePosition={...widget};fs.writeFileSync(path.join(data,'position.json'),JSON.stringify(widget));}
function sendLayout(){if(ready){const portrait=viewLayout?.regions?.[0];win.webContents.send('layout',{...viewLayout,residentSize:displaySize(),docked:docked(),mirrored:Boolean(!docked()&&portrait&&portrait.x+portrait.width/2<dip.width/2),widgetEnabled:widgetEnabled(),expanded,keyboardMode,speechVisible,speechIndex,dialoguePreferences,dragging,resizing:panelResizing,panelPreferences});}}
function notifyLayout(){
  if(dragging||panelResizing){if(!layoutTimer)layoutTimer=setTimeout(()=>{layoutTimer=null;sendLayout();},16);return;}
  clearTimeout(layoutTimer);layoutTimer=null;sendLayout();
}
function beginDrag(){
  if(dragging)return;if(!expanded)endPanelFocus();defaultPlacement=false;dragging=true;
  checkpointTimer=setTimeout(function checkpoint(){
    if(!dragging)return;savePosition();checkpointTimer=setTimeout(checkpoint,1000);
  },3000);
}
function saveSnapshot(file,value){
  try{const temp=path.join(data,file+'.tmp');fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,path.join(data,file));}catch{}
}
function updateShape(){
  // Placeholder bounds must not turn an absent/saved position into (8,8).
  if(!host.bounds||host.visible===false||host.attached===false||dip.width<=1||dip.height<=1)return;
  if(!widgetEnabled()){
    viewLayout=layout(null,dip.width,dip.height,false,0,{width:148,height:42});
    region=shape(viewLayout.regions,dip.width,dip.height,viewLayout.sizes);applyRegion(region);notifyLayout();return;
  }
  const previous=widget;
  const resident=currentResident();
  viewLayout=layout(docked()||defaultPlacement?null:widget,dip.width,dip.height,expanded||speechVisible,reader.snapshot.windows.length,resident,panelPreferences,speechVisible?null:panelOffset,speechVisible);widget=viewLayout.widget;
  if(!dragging&&!panelResizing&&ready&&host.attached&&dip.width>32&&dip.height>32&&(previous?.x!==widget.x||previous?.y!==widget.y))savePosition();
  region=shape(viewLayout.regions,dip.width,dip.height,viewLayout.sizes);
  applyRegion(region);
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
  applyRegion([{x:0,y:0,width:1,height:1}]);
  if(isMac){
    app.dock?.hide();win.setAlwaysOnTop(true,'floating');
    win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  }
  win.setIgnoreMouseEvents(true,{forward:true});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((wc,permission,callback)=>callback(false));
  const characters=new CharacterStore(path.join(data,'characters'));await characters.init();installCharacters(win,characters);
  await installSounds(win,data);
  panelPreferences=await panelStore.read();
  dialoguePreferences=await dialogueStore.read();
  news=installNews({win,data,ipcMain,Notification,shell,isActive:()=>!quitting&&widgetEnabled()&&!dragging&&!panelResizing&&host.visible!==false&&host.attached===true,language:()=>panelPreferences.language});
  updates=installUpdates({win,data,ipcMain});
  newsTimer=setInterval(()=>news.poll().catch(()=>{}),60000);
  ipcMain.handle('dialogue-focus',(event,value)=>{
    if(event.sender!==win.webContents||typeof value!=='boolean'||value&&(!expanded||dragging))return {ok:false};
    setTextEditing(value);if(value)win.focus();return {ok:true};
  });
  ipcMain.handle('panel-keyboard-mode',(event,value)=>{
    if(event.sender!==win.webContents||typeof value!=='boolean'||value&&(!expanded||dragging||!widgetEnabled()))return {ok:false};
    keyboardMode=value;setTextEditing(fieldEditing);if(value)win.focus();diagnostic();return {ok:true};
  });
  ipcMain.handle('dialogue-read',event=>event.sender===win.webContents?dialoguePreferences:null);
  ipcMain.handle('dialogue-save',async(event,value)=>{
    if(event.sender!==win.webContents)return {ok:false};
    try{const saved=await dialogueStore.save(value);dialoguePreferences=saved;setTextEditing(false);notifyLayout();return {ok:true};}catch(e){return {ok:false,error:e.message};}
  });
  const dismiss=()=>{endPanelFocus();if(!expanded&&!speechVisible)return;if(panelResizing){panelResizing=false;savePanel();}expanded=false;speechVisible=false;updateShape();diagnostic();};
  ipcMain.on('open-settings',event=>{if(event.sender!==win.webContents||dragging||!widgetEnabled())return;speechVisible=false;panelOffset=null;expanded=true;keyboardMode=true;setTextEditing(fieldEditing);updateShape();win.focus();diagnostic();});
  const savePanel=()=>panelStore.save({...panelPreferences}).catch(()=>{if(!quitting&&!win.isDestroyed())win.webContents.send('panel-error','卡片设置未能保存，请检查本机文件权限。');});
  let booleanPreferenceQueue=Promise.resolve();
  const queueBooleanPreference=operation=>{const result=booleanPreferenceQueue.then(operation);booleanPreferenceQueue=result.catch(()=>{});return result;};
  ipcMain.handle('panel-preferences-read',event=>event.sender===win.webContents?{...panelPreferences}:null);
  ipcMain.handle('widget-enabled',async(event,value)=>{
    if(event.sender!==win.webContents||typeof value!=='boolean'||dragging||panelResizing)return {ok:false};
    return queueBooleanPreference(async()=>{
      if(dragging||panelResizing)return {ok:false};
      const next={...panelPreferences,widgetEnabled:value};
      try{await panelStore.save(next);}catch{return {ok:false,error:'卡片设置未能保存，请检查本机文件权限。'};}
      panelPreferences={...panelPreferences,widgetEnabled:value};endPanelFocus();expanded=false;speechVisible=false;panelOffset=null;
      if(!value){const worker=tokenWorker;tokenWorker=null;worker?.terminate();}
      updateShape();diagnostic();if(value){readTokens();refresh().catch(()=>{});}return {ok:true};
    });
  });
  ipcMain.handle('panel-language',async(event,language)=>{
    if(event.sender!==win.webContents||!panelModel.LANGUAGES.includes(language))return {ok:false};
    panelPreferences={...panelPreferences,language};notifyLayout();
    try{await panelStore.save({...panelPreferences});return {ok:true};}catch{return {ok:false,error:'卡片设置未能保存，请检查本机文件权限。'};}
  });
  ipcMain.handle('panel-click-sound',async(event,value)=>{
    if(event.sender!==win.webContents||typeof value!=='boolean')return {ok:false};
    return queueBooleanPreference(async()=>{
      const previous=panelPreferences.clickSoundEnabled;
      panelPreferences={...panelPreferences,clickSoundEnabled:value};notifyLayout();
      try{await panelStore.save({...panelPreferences});return {ok:true};}catch{
        panelPreferences={...panelPreferences};if(previous===undefined)delete panelPreferences.clickSoundEnabled;else panelPreferences.clickSoundEnabled=previous;notifyLayout();
        return {ok:false,error:'卡片设置未能保存，请检查本机文件权限。'};
      }
    });
  });
  ipcMain.handle('panel-sound-volume',async(event,value)=>{
    if(event.sender!==win.webContents||!Number.isInteger(value)||value<0||value>100)return {ok:false};
    return queueBooleanPreference(async()=>{
      const previous=panelPreferences.clickSoundVolume;
      panelPreferences={...panelPreferences,clickSoundVolume:value};notifyLayout();
      try{await panelStore.save({...panelPreferences});return {ok:true};}catch{
        panelPreferences={...panelPreferences};if(previous===undefined)delete panelPreferences.clickSoundVolume;else panelPreferences.clickSoundVolume=previous;notifyLayout();
        return {ok:false,error:'音效设置未能保存，请重试。'};
      }
    });
  });
  ipcMain.handle('panel-dock',async(event,value)=>{
    if(event.sender!==win.webContents||typeof value!=='boolean'||dragging||panelResizing)return {ok:false};
    return queueBooleanPreference(async()=>{
      if(dragging||panelResizing)return {ok:false};
      const next={...panelPreferences,dockBottomRight:value};
      try{await panelStore.save(next);}catch{return {ok:false,error:'卡片设置未能保存，请检查本机文件权限。'};}
      panelPreferences={...panelPreferences,dockBottomRight:value};if(!value){widget=freePosition;defaultPlacement=widget===null;}updateShape();diagnostic();return {ok:true};
    });
  });
  ipcMain.handle('panel-compact-only',async(event,value)=>{
    if(event.sender!==win.webContents||typeof value!=='boolean'||dragging||panelResizing)return {ok:false};
    return queueBooleanPreference(async()=>{
      if(dragging||panelResizing)return {ok:false};
      const next={...panelPreferences,compactOnly:value};
      try{await panelStore.save(next);}catch{return {ok:false,error:'卡片设置未能保存，请检查本机文件权限。'};}
      const previousHeight=viewLayout?.regions?.[0]?.height||currentResident().height;
      const panel=expanded?viewLayout?.regions?.[1]:null;
      panelPreferences=next;
      if(!docked()&&widget){const newHeight=currentResident().height;widget={x:widget.x,y:widget.y+previousHeight-newHeight};}
      if(panel&&host.bounds&&dip.width>32&&dip.height>32){
        const point=layout(docked()||defaultPlacement?null:widget,dip.width,dip.height,true,reader.snapshot.windows.length,currentResident(),panelPreferences).widget;
        panelOffset={x:panel.x-point.x,y:panel.y-point.y};
      }
      updateShape();if(!docked())savePosition();diagnostic();return {ok:true};
    });
  });
  ipcMain.on('panel-resize',(event,value)=>{
    if(event.sender!==win.webContents||!value||!expanded||dragging)return;
    if(value.type==='begin'&&viewLayout?.regions[1]){panelOffset=null;panelResizing=true;}
    else if(value.type==='update'&&panelResizing&&panelModel.validSize(value)){panelPreferences={...panelPreferences,width:value.width,height:value.height};updateShape();}
    else if(value.type==='end'&&panelResizing){panelResizing=false;updateShape();diagnostic();savePanel();}
  });
  const show=visibility(win);
  function sync(){
    if(quitting||win.isDestroyed())return;
    if(host.bounds&&host.visible!==false&&host.attached!==false){
      dip=viewport(host.bounds.width,host.bounds.height,host.dpi);
      if(isMac)win.setPosition(Math.round(host.bounds.x),Math.round(host.bounds.y),false);
      if(win.getSize()[0]!==dip.width || win.getSize()[1]!==dip.height) win.setSize(dip.width,dip.height,false);
      updateShape();
    }
    show({...host,ready});
    if(win.isVisible())startPolling();
    diagnostic();
  }
  ipcMain.on('ready',event=>{if(event.sender!==win.webContents)return;ready=true;recordLifecycle('renderer-ready');win.webContents.send('quota',reader.snapshot);win.webContents.send('tokens',tokens);sync()});
  ipcMain.on('read-tokens',event=>{if(event.sender===win.webContents)readTokens();});
  ipcMain.on('panel-scroll',(event,value)=>{
    if(event.sender!==win.webContents||!value||!['top','height','clientHeight','wheelEvents'].every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=100000))return;
    const roleTab=value.roleTab;
    if(!roleTab||!['x','y'].every(k=>Number.isInteger(roleTab[k])&&roleTab[k]>=0&&roleTab[k]<=32768)||!['quota','token','character','appearance'].includes(value.tab))return;
    panelScroll={top:value.top,height:value.height,clientHeight:value.clientHeight,wheelEvents:value.wheelEvents,tab:value.tab,roleTab:{x:roleTab.x,y:roleTab.y}};diagnostic();
  });
  ipcMain.on('character-size',(event,value)=>{
    if(event.sender!==win.webContents||!value||!['contentWidth','contentHeight'].every(k=>Number.isFinite(value[k])&&value[k]>0&&value[k]<=4096)||!Number.isFinite(value.targetHeight)||value.targetHeight<180||value.targetHeight>420)return;
    if(value.zoom!==undefined&&(!Number.isFinite(value.zoom)||value.zoom<.5||value.zoom>4))return;
    const next=portraitSize(value.contentWidth,value.contentHeight,value.targetHeight,value.zoom>1);
    if(value.targetWidth!==undefined){if(!Number.isInteger(value.targetWidth)||value.targetWidth<126||value.targetWidth>672)return;next.width=value.targetWidth;next.height=Math.round(value.targetHeight);}
    if(next.width===characterSize.width&&next.height===characterSize.height)return;
    const panel=expanded?viewLayout?.regions[1]:null;
    characterSize=next;
    // Decoding can finish before the host handshake; retain the saved position
    // until a real viewport is available instead of clamping it against 1×1.
    if(host.bounds&&dip.width>32&&dip.height>32){
      // Keep the controls under the pointer while character dimensions change.
      // The existing layout/position clamp still bounds the settings region.
      if(panel){
        const resident=currentResident(next);
        const point=layout(docked()||defaultPlacement?null:widget,dip.width,dip.height,true,reader.snapshot.windows.length,resident,panelPreferences).widget;
        panelOffset={x:panel.x-point.x,y:panel.y-point.y};
      }
      updateShape();diagnostic();
    }
  });
  ipcMain.on('collapse',event=>{if(event.sender===win.webContents)dismiss();});
  ipcMain.on('reset-position',event=>{
    if(event.sender!==win.webContents||dragging)return;
    defaultPlacement=true;widget=null;updateShape();
    if(docked()&&host.bounds&&host.visible!==false&&host.attached!==false&&dip.width>1&&dip.height>1){
      const freeResident=residentSize(characterSize,dip.width,dip.height,false);
      freePosition=layout(null,dip.width,dip.height,false,0,freeResident).widget;
      fs.writeFileSync(path.join(data,'position.json'),JSON.stringify(freePosition));
    }
    diagnostic();
  });
  ipcMain.on('gesture',(event,value)=>{
    if(event.sender!==win.webContents || !value || typeof value!=='object'||!widgetEnabled())return;
    if(value.type==='drag'){
      if(docked())return;
      if(!Number.isFinite(value.x)||!Number.isFinite(value.y))return;
      beginDrag();widget={x:value.x,y:value.y};updateShape();diagnostic();return;
    } else if(value.type==='end'){
      if(docked())return;
      if(dragging){widget=snap(widget,dip.width,dip.height,viewLayout.sizes[0]);updateShape();}
      dragging=false;clearTimeout(checkpointTimer);checkpointTimer=null;
      savePosition();notifyLayout();
      if(pendingQuota){saveSnapshot('quota-state.json',pendingQuota);pendingQuota=null;}
      if(pendingTokens){saveSnapshot('tokens-state.json',pendingTokens);pendingTokens=null;}
    } else if(value.type==='click'){endPanelFocus();if(panelResizing){panelResizing=false;savePanel();}clicks++;speechIndex=0;expanded=false;speechVisible=true;updateShape();}
    else if(value.type==='speech-next'){if(!speechVisible||expanded)return;speechIndex=(speechIndex+1)%2;notifyLayout();}
    diagnostic();
  });
  try {const saved=JSON.parse(fs.readFileSync(path.join(data,'position.json'),'utf8'));if(Number.isFinite(saved.x)&&Number.isFinite(saved.y)){widget=freePosition=saved;defaultPlacement=false;}}catch{}
  // Polling is scheduled only after the first visible frame can be presented.
  function readTokens(){
    if(!widgetEnabled())return;
    if(!tokenWorker){
      const worker=tokenWorker=new Worker(path.join(__dirname,'../runtime/token-worker.cjs'),{workerData:{cacheFile:path.join(data,'token-index.json')}});
      worker.on('message',message=>{
        if(message?.type!=='tokens'||win.isDestroyed()||!widgetEnabled()||tokenWorker!==worker)return;tokens=message.value;
        if(dragging)pendingTokens=tokens;else saveSnapshot('tokens-state.json',tokens);
        if(ready)win.webContents.send('tokens',tokens);diagnostic();
      });
      worker.on('error',()=>{if(!widgetEnabled()||tokenWorker!==worker)return;tokens={...tokens,coverage:'partial',readErrors:1};if(ready&&!win.isDestroyed())win.webContents.send('tokens',tokens);});
      worker.on('exit',()=>{if(tokenWorker===worker)tokenWorker=null;});
    }
    tokenWorker.postMessage({type:'read'});
  }

  async function refresh(){
    if(!widgetEnabled())return;
    const quota=await reader.refresh();if(win.isDestroyed()||!widgetEnabled())return;
    if(dragging)pendingQuota=quota;else saveSnapshot('quota-state.json',quota);
    if(ready){win.webContents.send('quota',quota);updateShape();}diagnostic();
  }
  function startPolling(){
    if(pollingStarted||pollStartTimer)return;
    recordLifecycle('first-visible');
    pollStartTimer=setTimeout(()=>{
      pollStartTimer=null;if(quitting||win.isDestroyed()||!win.isVisible())return;
      pollingStarted=true;
      readTokens();tokenTimer=setInterval(readTokens,30000);
      refresh().catch(()=>{});pollTimer=setInterval(()=>refresh().catch(()=>{}),30000);
    },150);
  }
  const pipeName='codex-quota-widget-'+process.pid+'-'+crypto.randomBytes(12).toString('hex');
  const token=crypto.randomBytes(32).toString('hex');
  bridge=net.createServer(socket=>{
    let pending='';socket.setEncoding('utf8');
    socket.on('data',chunk=>{
      if(quitting||win.isDestroyed()){socket.destroy();return;}
      pending+=chunk;if(pending.length>16384){socket.destroy();return;}
      let newline;
      while((newline=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1);
        try{
          const message=JSON.parse(line);
          if(message.token!==token){socket.destroy();return;}
          health?.received();
          if(message.state.stop){app.quit();return;}
          const {nativeWheel=[],outsideClick=false,...state}=message.state;host=state;
          if(outsideClick===true&&!dragging&&!panelResizing)dismiss();sync();
          if(host.attached&&win.isVisible()&&Array.isArray(nativeWheel)&&nativeWheel.length<=32){
            for(const wheel of nativeWheel){
              const input=wheelInput(wheel,host,region);if(input)win.webContents.sendInputEvent(input);
            }
          }
        }catch(error){process.stderr.write(error.message+'\n');if(!win.isDestroyed())win.hide();socket.destroy();}
      }
    });
    socket.on('error',()=>{});
  });
  if(!isMac)bridge.listen('\\\\.\\pipe\\'+pipeName,()=>{
    health=bridgeHealth();
    fs.writeFileSync(path.join(data,'bridge.json'),JSON.stringify({pid:process.pid,pipe:pipeName,token,hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString()}));
    recordLifecycle('bridge-listening');
    let previous='starting';
    bridgeTimer=setInterval(()=>{
      if(quitting)return;if(win.isDestroyed()){app.quit();return;}
      const status=health.check();
      if(status!==previous){recordLifecycle('bridge-'+status);previous=status;}
      if(status==='stale'||status==='expired'){win.hide();diagnostic();}
      if(status==='expired')app.quit();
    },500);
  });
  if(isMac){
    macFollower=require('./macos/follower.cjs').follow({screen,onState:state=>{host=state;sync();}});
    win.on('blur',()=>{if(!dragging&&!panelResizing)dismiss();});
    app.on('before-quit',()=>macFollower?.close());
  }
  await win.loadFile(path.join(__dirname,'ui','index.html'));
  if(isMac&&process.argv.includes('--smoke-test'))setTimeout(async()=>{
    try{const image=await win.webContents.capturePage();fs.writeFileSync(path.join(data,'smoke.png'),image.toPNG());recordLifecycle('smoke-complete');}finally{app.quit();}
  },4000);
  // While shaped, only visible widget pixels can ever receive a click.
  // Cursor polling switches hit reception before the first mouse-down.
  let accepting=false;
  setInterval(()=>{
    if(!win || win.isDestroyed())return;
    const cursor=screen.getCursorScreenPoint(),bounds=win.getBounds();
    const x=cursor.x-bounds.x,y=cursor.y-bounds.y;
    const hit=dragging || panelResizing || region.some(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height);
    if(hit!==accepting){accepting=hit;win.setIgnoreMouseEvents(!hit,{forward:true});}
  },16);
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{quitting=true;recordLifecycle('process-quit');clearInterval(bridgeTimer);clearTimeout(pollStartTimer);clearInterval(newsTimer);news?.close();updates?.close();clearTimeout(diagnosticTimer);clearTimeout(layoutTimer);clearTimeout(checkpointTimer);clearInterval(pollTimer);clearInterval(tokenTimer);tokenWorker?.terminate();if(bridge)bridge.close();});
