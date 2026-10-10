// Stage 3 only: formal renderer, fixed panel bounds, chart, tabs and Worker load.
const {app,BrowserWindow,ipcMain}=require('electron');
const {Worker}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {layout,shape}=require('../desktop/geometry.cjs');
const output=process.argv[process.argv.indexOf('--output')+1];
app.setPath('userData',path.join(output,'chromium'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const home=path.join(output,'fixture-home');await fs.mkdir(path.join(home,'sessions'),{recursive:true});
  const now=Date.now(),token=(n,at)=>JSON.stringify({type:'event_msg',timestamp:new Date(at).toISOString(),payload:{type:'token_count',info:{total_token_usage:{total_tokens:n}}}})+'\n';
  const file=await fs.open(path.join(home,'sessions','load.jsonl'),'w');
  try{
    await file.write(token(100,now-2*86400000));const padding=JSON.stringify({type:'response_item',payload:{text:'x'.repeat(65536)}})+'\n';
    for(let i=0;i<400;i++)await file.write(padding);await file.write(token(500,now-1000)+token(540,now));
  }finally{await file.close();}
  const win=new BrowserWindow({show:false,frame:false,width:720,height:480,transparent:true,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  ipcMain.on('ready',()=>{});ipcMain.on('read-tokens',()=>{});ipcMain.on('collapse',()=>{});
  await win.loadFile(path.resolve(__dirname,'../desktop/ui/index.html'));
  const v=layout({x:400,y:40},720,480,true,1);win.setShape(shape(v.regions,720,480,v.sizes));win.webContents.send('layout',v);
  await win.webContents.executeJavaScript(`document.querySelector('#token-tab').click();window.framesSeen=0;window.ticker=setInterval(()=>window.framesSeen++,10)`);
  let maxMainGap=0,previous=Date.now();const heartbeat=setInterval(()=>{const current=Date.now();maxMainGap=Math.max(maxMainGap,current-previous);previous=current;},10);
  const worker=new Worker(path.resolve(__dirname,'../runtime/token-worker.cjs'),{workerData:{codexHome:home}});
  const updates=[];let workerResult;
  try{
    workerResult=await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.type!=='tokens')return;updates.push(m.value.coverage);win.webContents.send('tokens',m.value);if(m.value.coverage!=='indexing')resolve(m.value);});worker.postMessage({type:'read'});});
    assert.equal(workerResult.values.hours24,440);
  }finally{clearInterval(heartbeat);await worker.terminate();}
  const cold=await win.webContents.executeJavaScript(`({ticks:window.framesSeen,selected:document.querySelector('#token-tab').getAttribute('aria-selected'),columns:document.querySelectorAll('.token-column').length})`);
  assert.equal(cold.columns,3);assert.ok(cold.ticks>0);assert.ok(maxMainGap<250);assert.equal(cold.selected,'true');assert.ok(updates.includes('indexing'));
  const captured=JSON.parse(await fs.readFile(path.join(process.env.CODEX_HOME || path.join(process.env.USERPROFILE,'.codex'),'codex-quota-widget','tokens-state.json'),'utf8'));
  const cases=[];
  for(const [count,height,coverage] of [[0,448,'indexing'],[1,448,'partial'],[2,448,'complete']]){
    const view=layout({x:400,y:40},720,480,true,count);win.setShape(shape(view.regions,720,480,view.sizes));win.webContents.send('layout',view);win.webContents.send('tokens',{...captured,coverage});
    await new Promise(r=>setTimeout(r,100));
    const state=await win.webContents.executeJavaScript(`(()=>{const panel=document.querySelector('#details'),bars=[...document.querySelectorAll('.token-bar')];return {width:panel.offsetWidth,height:panel.offsetHeight,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,values:[...document.querySelectorAll('.token-value')].map(x=>x.textContent),widths:bars.map(x=>x.getBoundingClientRect().width),colors:bars.map(x=>getComputedStyle(x).backgroundColor),coverage:document.querySelector('#token-coverage').textContent,statement:document.querySelector('#token-statement').textContent}})()`);
    assert.equal(state.width,480);assert.equal(state.height,height);assert.equal(state.widths.length,3);assert.ok(state.widths[0]<=state.widths[1]&&state.widths[1]<=state.widths[2]);assert.equal(new Set(state.colors).size,1);
    assert.match(state.statement,/本机现存会话/);assert.match(state.statement,/非 OpenAI 账户官方统计/);assert.match(state.statement,/已删除会话及其他电脑/);
    await fs.writeFile(path.join(output,'chart-'+count+'.png'),(await win.webContents.capturePage()).toPNG());
    const footerVisible=await win.webContents.executeJavaScript(`(()=>{const panel=document.querySelector('#details');panel.scrollTop=panel.scrollHeight;const a=panel.getBoundingClientRect(),b=document.querySelector('#token-statement').getBoundingClientRect();return b.bottom<=a.bottom&&b.top>=a.top;})()`);assert.equal(footerVisible,true);cases.push({...state,footerVisible});
  }
  await fs.writeFile(path.join(output,'token-ui-smoke.json'),JSON.stringify({cold,maxMainGap,workerMetrics:workerResult.lastScan,cases},null,2));
  await fs.unlink(path.join(home,'sessions','load.jsonl'));app.quit();
}).catch(error=>{process.stderr.write(String(error));app.exit(1);});
