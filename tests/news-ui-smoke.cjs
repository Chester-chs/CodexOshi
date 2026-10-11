// Hidden real Electron UI with network/account/OS notification and updater IPC boundaries replaced.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]),data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'codi-news-ui-')),notifications=[];
const currentVersion=require('../package.json').version;
const versionParts=currentVersion.split('.').map(Number);
const newerVersion=[versionParts[0],versionParts[1],versionParts[2]+1].join('.');
const versionPattern=new RegExp(newerVersion.replace(/\./g,'\\.'));
process.argv.push('--data',data);const load=Module._load;
// The real updater installs code and restarts the application. Exercise its renderer
// contract without invoking either side effect, retaining the real preload bridge.
let updateCalls=0,releaseUpdate,updateState={status:'idle'},rejectUpdateRead=true,updateReads=0,holdUpdateRead=false,releaseUpdateRead;
const updateHandlers={
  'update-read':()=>{updateReads++;if(rejectUpdateRead)throw new Error('Synthetic unavailable updater state');const state={...updateState};if(holdUpdateRead)return new Promise(resolve=>{releaseUpdateRead=()=>resolve(state);});return state;},
  'update-start':async(event,...args)=>{
    assert.deepEqual(args,[]);updateCalls++;
    if(updateCalls===2)return {ok:false,error:'network_error'};
    if(updateCalls===3)throw new Error('Synthetic update IPC failure');
    updateState={status:'preparing',version:newerVersion,updatedAt:Date.now()};event.sender.send('update-state',updateState);
    await new Promise(resolve=>{releaseUpdate=resolve;});
    updateState={status:'downloading',version:newerVersion,updatedAt:Date.now()};event.sender.send('update-state',updateState);return {ok:true,state:updateState};
  }
};
const handle=electron.ipcMain.handle.bind(electron.ipcMain);
electron.ipcMain.handle=(channel,listener)=>{
  if(updateHandlers[channel]){electron.ipcMain.removeHandler(channel);return handle(channel,updateHandlers[channel]);}
  return handle(channel,listener);
};
for(const channel of Object.keys(updateHandlers))electron.ipcMain.handle(channel,updateHandlers[channel]);
Module._load=function(name,parent,...args){
  if(name==='electron')return {...electron,Notification:class{static isSupported(){return true;}constructor(value){this.value=value;}on(){}show(){notifications.push(this.value);}},shell:{openExternal:async url=>{assert.match(url,/^https:\/\/(?:github.com\/Chester-chs\/Codi|x.com\/thsottiaux)/);}}};
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}async refresh(){return this.snapshot;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};
  return load.call(this,name,parent,...args);
};
let rateLimited=false,fetchCount=0;const createdAt=new Date().toISOString();
global.fetch=async url=>{fetchCount++;if(String(url).startsWith('https://api.github.com/'))return new Response(JSON.stringify({encoding:'base64',content:Buffer.from(JSON.stringify({version:newerVersion})).toString('base64')}));
  assert.equal(url,'https://syndication.twitter.com/srv/timeline-profile/screen-name/thsottiaux');if(rateLimited)return new Response('',{status:429});
  return new Response('<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{timeline:{entries:[{content:{tweet:{id_str:'123456789',user:{screen_name:'thsottiaux'},created_at:createdAt,full_text:'Codex limits reset in 2 hours. <img src=x onerror=alert(1)>'}}}]}}}})+'</script>');};
BrowserWindow.prototype.showInactive=function(){};require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await app.whenReady();let bridge;for(let i=0;i<200&&!bridge;i++){try{bridge=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));}catch{}await delay(20);}assert.ok(bridge);
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,bounds:{width:1600,height:1000}}})+'\n');send();const heartbeat=setInterval(send,150),win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);await delay(250);
  const capture=async name=>{
    await js(`document.querySelector('.news-section').scrollIntoView({block:'start'});for(const animation of document.querySelector('#details').getAnimations())animation.finish()`);
    await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
    const bounds=await js(`(()=>{const r=document.querySelector('#details').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`);
    fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage(bounds,{stayHidden:true,stayAwake:true})).toPNG());
  };
  assert.equal(await js(`Boolean(document.querySelector('#version-update')?.hidden)`),true,'No install button before a new version is available');
  await js(`window.widget.openSettings();document.querySelector('#version-check').click()`);await delay(200);
  assert.match(await js(`document.querySelector('#version-result').textContent`),versionPattern);
  assert.deepEqual(await js(`(()=>{const button=document.querySelector('#version-update');return {hidden:button.hidden,disabled:button.disabled,label:button.textContent};})()`),{hidden:false,disabled:false,label:'一键更新'});
  rejectUpdateRead=false;win.webContents.send('update-state',{status:'idle'});await delay(50);
  await capture('update-available.png');
  await js(`document.querySelector('#tibo-check').click()`);await delay(200);
  assert.match(await js(`document.querySelector('#tibo-notice').textContent`),/公告重置时间/);
  assert.equal(await js(`document.querySelector('#tibo-quote img')===null`),true);
  assert.equal(notifications.length,2);
  await js(`document.querySelector('#tibo-check').click()`);await delay(100);assert.equal(fetchCount,2);assert.equal(notifications.length,2);
  await js(`document.querySelector('[data-language="en-US"]').click()`);await delay(150);assert.match(await js(`document.querySelector('#tibo-notice').textContent`),/Announced reset/);assert.equal(await js(`document.querySelector('#version-check').textContent`),'Check for updates');
  assert.equal(await js(`document.querySelector('#version-update').textContent`),'Update now');
  await capture('update-available-en.png');
  await js(`document.querySelector('#version-update').click();document.querySelector('#version-update').click()`);await delay(100);
  assert.equal(updateCalls,1,'A repeated click must not start a second installation');
  assert.equal(await js(`document.querySelector('#version-update').disabled`),true);
  assert.match(await js(`document.querySelector('#update-result').textContent`),/Preparing/);
  releaseUpdate();await delay(100);
  assert.match(await js(`document.querySelector('#update-result').textContent`),/Downloading/);
  await capture('update-progress.png');
  for(const [status,message] of [['installing',/Installing/],['restarting',/Restarting/]]){
    updateState={status,version:newerVersion,updatedAt:Date.now()};win.webContents.send('update-state',updateState);await delay(50);
    assert.equal(await js(`document.querySelector('#version-update').disabled`),true);
    assert.match(await js(`document.querySelector('#update-result').textContent`),message);
  }
  updateState={status:'failed',version:newerVersion,error:'network_error',updatedAt:Date.now()};win.webContents.send('update-state',updateState);await delay(50);
  assert.equal(await js(`document.querySelector('#version-update').disabled`),false);
  assert.match(await js(`document.querySelector('#update-result').textContent`),/download|connection/i);
  await js(`document.querySelector('#version-update').click()`);await delay(100);
  assert.equal(updateCalls,2);assert.equal(await js(`document.querySelector('#version-update').disabled`),false);
  assert.match(await js(`document.querySelector('#update-result').textContent`),/download|connection/i);
  await js(`document.querySelector('#version-update').click()`);await delay(100);
  assert.equal(updateCalls,3);assert.equal(await js(`document.querySelector('#version-update').disabled`),false);
  assert.match(await js(`document.querySelector('#update-result').textContent`),/retry/i);
  updateState={status:'complete',version:newerVersion,updatedAt:Date.now()};win.webContents.send('update-state',updateState);
  const currentNews=await js(`window.widget.newsRead()`);currentNews.version={...currentNews.version,status:'current',current:newerVersion,latest:newerVersion};win.webContents.send('news-state',currentNews);await delay(50);
  assert.equal(await js(`document.querySelector('#version-update').hidden`),true);
  assert.match(await js(`document.querySelector('#update-result').textContent`),new RegExp('Updated to '+versionPattern.source));
  await js(`document.querySelector('[data-language="zh-CN"]').click()`);await delay(50);
  assert.match(await js(`document.querySelector('#update-result').textContent`),new RegExp('已更新至 '+versionPattern.source));
  await js(`document.querySelector('#news-auto').click()`);await delay(100);assert.equal(JSON.parse(fs.readFileSync(path.join(data,'news-state.json'),'utf8')).enabled,false);
  assert.equal((await js(`window.widget.newsCheck('arbitrary-url')`)).ok,false);assert.equal((await js(`window.widget.newsOpen('file:///secret')`)).ok,false);
  rejectUpdateRead=false;updateState={status:'restarting',version:newerVersion,updatedAt:Date.now()};
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});await delay(100);
  win.webContents.send('news-state',currentNews);await js(`window.widget.openSettings()`);await delay(100);
  assert.match(await js(`document.querySelector('#update-result').textContent`),/正在重启/);
  // A new native worker writes completion to disk without broadcasting through
  // the new renderer's service. Active polling must discover that transition.
  updateState={status:'complete',version:newerVersion,updatedAt:Date.now()};await delay(1200);
  assert.equal(await js(`document.querySelector('#version-update').hidden`),true);
  assert.match(await js(`document.querySelector('#update-result').textContent`),new RegExp('已更新至 '+versionPattern.source));
  const completedReads=updateReads;await delay(1100);assert.equal(updateReads,completedReads,'Terminal states must stop polling');
  updateState={status:'restarting',version:newerVersion,updatedAt:Date.now()};holdUpdateRead=true;win.webContents.send('update-state',updateState);
  for(let i=0;i<75&&!releaseUpdateRead;i++)await delay(20);assert.equal(typeof releaseUpdateRead,'function');
  const heldReads=updateReads;await delay(1100);assert.equal(updateReads,heldReads,'Polling must not overlap');
  updateState={status:'complete',version:newerVersion,updatedAt:Date.now()};win.webContents.send('update-state',updateState);await delay(50);holdUpdateRead=false;releaseUpdateRead();await delay(100);
  assert.match(await js(`document.querySelector('#update-result').textContent`),new RegExp('已更新至 '+versionPattern.source),'A stale poll cannot overwrite a newer event');
  await js(`document.querySelector('[data-language="zh-CN"]').click()`);await capture('news.png');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,versionAvailable:true,localResetTime:true,inertPostText:true,duplicateRequestsAndNotificationsSuppressed:true,languageSwitch:true,autoSettingSaved:true,externalLinkAllowlist:true,updateReadFailureIsolated:true,oneClickUpdate:true,duplicateUpdateSuppressed:true,updateProgress:true,updateFailureRetry:true,updateCompletePersisted:true,completionPolledAfterRestart:true,noOverlappingPolls:true,stalePollIgnored:true},null,2));
  clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
