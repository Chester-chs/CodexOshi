// Hidden real Electron UI with only network/account/OS notification boundaries replaced.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]),data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'codi-news-ui-')),notifications=[];
process.argv.push('--data',data);const load=Module._load;
Module._load=function(name,parent,...args){
  if(name==='electron')return {...electron,Notification:class{static isSupported(){return true;}constructor(value){this.value=value;}on(){}show(){notifications.push(this.value);}},shell:{openExternal:async url=>{assert.match(url,/^https:\/\/(?:github.com\/Chester-chs\/Codi|x.com\/thsottiaux)/);}}};
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}async refresh(){return this.snapshot;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};
  return load.call(this,name,parent,...args);
};
let rateLimited=false,fetchCount=0;const createdAt=new Date().toISOString();
global.fetch=async url=>{fetchCount++;if(String(url).startsWith('https://api.github.com/'))return new Response(JSON.stringify({encoding:'base64',content:Buffer.from('{"version":"0.2.0"}').toString('base64')}));
  assert.equal(url,'https://syndication.twitter.com/srv/timeline-profile/screen-name/thsottiaux');if(rateLimited)return new Response('',{status:429});
  return new Response('<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{timeline:{entries:[{content:{tweet:{id_str:'123456789',user:{screen_name:'thsottiaux'},created_at:createdAt,full_text:'Codex limits reset in 2 hours. <img src=x onerror=alert(1)>'}}}]}}}})+'</script>');};
BrowserWindow.prototype.showInactive=function(){};require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await app.whenReady();let bridge;for(let i=0;i<200&&!bridge;i++){try{bridge=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));}catch{}await delay(20);}assert.ok(bridge);
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,bounds:{width:1600,height:1000}}})+'\n');send();const heartbeat=setInterval(send,150),win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);await delay(250);
  await js(`window.widget.openSettings();document.querySelector('#version-check').click()`);await delay(200);
  assert.match(await js(`document.querySelector('#version-result').textContent`),/0\.2\.0/);
  await js(`document.querySelector('#tibo-check').click()`);await delay(200);
  assert.match(await js(`document.querySelector('#tibo-notice').textContent`),/公告重置时间/);
  assert.equal(await js(`document.querySelector('#tibo-quote img')===null`),true);
  assert.equal(notifications.length,2);
  await js(`document.querySelector('#tibo-check').click()`);await delay(100);assert.equal(fetchCount,2);assert.equal(notifications.length,2);
  await js(`document.querySelector('[data-language="en-US"]').click()`);await delay(150);assert.match(await js(`document.querySelector('#tibo-notice').textContent`),/Announced reset/);assert.equal(await js(`document.querySelector('#version-check').textContent`),'Check for updates');
  await js(`document.querySelector('#news-auto').click()`);await delay(100);assert.equal(JSON.parse(fs.readFileSync(path.join(data,'news-state.json'),'utf8')).enabled,false);
  assert.equal((await js(`window.widget.newsCheck('arbitrary-url')`)).ok,false);assert.equal((await js(`window.widget.newsOpen('file:///secret')`)).ok,false);
  await js(`document.querySelector('[data-language="zh-CN"]').click();document.querySelector('.news-section').scrollIntoView({block:'start'});for(const animation of document.querySelector('#details').getAnimations())animation.finish()`);
  await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});const r=await js(`(()=>{const r=document.querySelector('#details').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`);
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'news.png'),(await win.webContents.capturePage(r,{stayHidden:true,stayAwake:true})).toPNG());
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,versionAvailable:true,localResetTime:true,inertPostText:true,duplicateRequestsAndNotificationsSuppressed:true,languageSwitch:true,autoSettingSaved:true,externalLinkAllowlist:true},null,2));
  clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
