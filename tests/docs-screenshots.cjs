// Documentation-only renderer fixture: synthetic quota/token values and original demo artwork.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module');
const {EventEmitter}=require('node:events');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]);
const data=path.join(output,'data'),role=path.join(data,'characters','星簿');
fs.mkdirSync(role,{recursive:true});
const portrait='portrait-00000000000000000000000000000001.png';
fs.copyFileSync(path.join(__dirname,'../docs/images/demo-chibi.png'),path.join(role,portrait));
fs.writeFileSync(path.join(role,'settings.json'),JSON.stringify({portrait,targetHeight:300,targetWidth:300,background:false}));
fs.writeFileSync(path.join(data,'characters','active.json'),JSON.stringify({name:'星簿'}));
fs.writeFileSync(path.join(data,'appearance.json'),JSON.stringify({palette:'midnight'}));
const quota={windows:[{remainingPercent:78,label:'5 小时限额'},{remainingPercent:56,label:'每周限额'}],planType:'plus',source:'http',observedAt:Date.now()};
const tokens=require('./token-fixture.cjs')();
process.argv.push('--data',data);
const originalLoad=Module._load;
Module._load=function(name,parent,...args){
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot=quota;}async refresh(){return quota;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){queueMicrotask(()=>this.emit('message',{type:'tokens',value:tokens}));}terminate(){}}};
  return originalLoad.call(this,name,parent,...args);
};
BrowserWindow.prototype.showInactive=function(){};
require('../desktop/main.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=()=>JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));
(async()=>{
  await app.whenReady();
  let bridge;
  for(let n=0;n<250&&!bridge;n++){try{bridge=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(bridge.pid!==process.pid)bridge=null;}catch{}await delay(20);}
  if(!bridge)throw Error('No renderer bridge');
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,bounds:{width:1280,height:800}}})+'\n');
  send();const heartbeat=setInterval(send,300);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  for(let n=0;n<200;n++){if(await js(`document.querySelector('#character-canvas').dataset.source?.includes('portrait-0000')`))break;await delay(30);}
  await delay(200);
  async function capture(region,name){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await delay(80);fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage(region,{stayHidden:true,stayAwake:true})).toPNG());}
  await capture(state().region[0],'companion.png');
  await js(`window.widget.openSettings()`);await delay(200);
  for(const [tab,name]of [['quota','quota.png'],['token','token-30-days.png'],['appearance','appearance.png']]){
    await js(`document.querySelector('#${tab}-tab').click();document.querySelector('#panel-body').scrollTop=0;`);
    if(tab==='token')await js(`document.querySelector('[data-period="days30"]').click()`);
    await delay(180);await capture(state().region[1],name);
  }
  clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(error=>{process.stderr.write(error.stack+'\n');app.exit(1);});
