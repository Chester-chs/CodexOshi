// Real production renderer, isolated user data and synthetic quota only.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const output=process.argv[process.argv.indexOf('--output')+1],data=path.join(output,'data');fs.mkdirSync(data,{recursive:true});process.argv.push('--data',data);
const load=Module._load;Module._load=function(name,parent,...args){
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[{remainingPercent:100,label:'Weekly'}]};}async refresh(){return this.snapshot;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};
  return load.call(this,name,parent,...args);
};
BrowserWindow.prototype.showInactive=function(){};
require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let heartbeat;
(async()=>{
  await app.whenReady();let bridge;
  for(let i=0;i<200&&!bridge;i++){try{bridge=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));}catch{}await delay(25);}
  assert.ok(bridge);const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,active:true,dpi:96,bounds:{width:1920,height:1040}}})+'\n');send();heartbeat=setInterval(send,150);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);await delay(600);
  const cases=await js(`(()=>{
    const cases=[],footer=document.querySelector('.compact-line'),status=document.querySelector('#status');
    Object.assign(button.style,{left:'24px',top:'24px',width:'672px',height:'420px'});
    const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
    for(const language of ['zh-CN','en-US'])for(const scale of [.5,1])for(const remainingPercent of [0,99,100])for(const stale of [false,true])for(const footerWidth of [118,126,140,170,180,199,240,280,420]){
      window.uiText.setLanguage(language);quota={windows:[{remainingPercent,label:'每周限额'}],stale};render();
      resident.style.width='672px';resident.style.height='420px';resident.style.transform='scale('+scale+')';
      Object.assign(footer.style,{left:'0px',right:'auto',width:footerWidth+'px'});
      const bar=rect(footer),number=rect(status),pin=rect(document.querySelector('#pin-control')),gear=rect(document.querySelector('#settings-open'));
      const range=document.createRange();range.selectNodeContents(status);const text=range.getBoundingClientRect();
      const widget=rect(button);
      const passed=status.textContent===remainingPercent+'%'&&status.scrollWidth<=status.clientWidth&&text.right<=number.right+.5&&number.right<=pin.left+.5&&pin.right<=gear.left+.5&&gear.right<=bar.right+.5&&number.left>=bar.left-.5&&bar.right<=widget.right+.5&&bar.bottom<=widget.bottom+.5;
      cases.push({language,scale,remainingPercent,stale,footerWidth,passed,clientWidth:status.clientWidth,scrollWidth:status.scrollWidth,textWidth:text.width,bar,number,pin,gear});
    }
    return cases;
  })()`);
  const failures=cases.filter(c=>!c.passed);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:failures.length===0,cases,failures},null,2));
  assert.equal(failures.length,0,'Incomplete quota percentage: '+JSON.stringify(failures[0]));
  clearInterval(heartbeat);socket.destroy();
  app.quit();
})().catch(error=>{fs.writeFileSync(path.join(output,'error.txt'),error.stack);clearInterval(heartbeat);app.exit(1);});
