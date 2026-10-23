// Exercise production Electron main with isolated data and no account/network work.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),{EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const output=process.argv[process.argv.indexOf('--output')+1],scenario=process.argv[process.argv.indexOf('--case')+1],data=path.join(output,'data');
fs.mkdirSync(data,{recursive:true});process.argv.push('--data',data);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),originalLoad=Module._load,startedWork=[];
const markWork=kind=>startedWork.push({kind,visible:BrowserWindow.getAllWindows()[0]?.isVisible()===true});
const reception=[],mouseEvents=[];
const ignoreMouse=BrowserWindow.prototype.setIgnoreMouseEvents;
BrowserWindow.prototype.setIgnoreMouseEvents=function(ignore,options){reception.push({ignore,forward:options?.forward===true});return ignoreMouse.call(this,ignore,options);};
Module._load=function(name,parent,...args){
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}async refresh(){markWork('quota');return this.snapshot;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){markWork('tokens');}terminate(){}}};
  const loaded=originalLoad.call(this,name,parent,...args);
  if(name==='../runtime/characters.cjs'&&scenario==='slow-start')return {...loaded,CharacterStore:class extends loaded.CharacterStore{async init(){await delay(5000);return super.init();}}};
  return loaded;
};
const filename=path.resolve(__dirname,'../desktop/main.cjs'),main=new Module(filename,module);main.filename=filename;main.paths=Module._nodeModulePaths(path.dirname(filename));main._compile(fs.readFileSync(filename,'utf8'),filename);
async function until(check,message,ms=12000){const deadline=Date.now()+ms;while(Date.now()<deadline){if(await check())return;await delay(40);}throw Error(message);}
(async()=>{
  await app.whenReady();let bridge;
  await until(()=>{try{bridge=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));return bridge.pid===process.pid;}catch{return false;}},'bridge never became ready');
  if(scenario==='slow-start')await delay(1600);
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);socket.on('error',()=>{});await new Promise(resolve=>socket.once('connect',resolve));
  const state={hostAlive:true,attached:true,visible:true,modal:false,dpi:96,revision:0,bounds:{width:600,height:500}};
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state})+'\n');send();let heartbeat=setInterval(send,150);
  const win=BrowserWindow.getAllWindows()[0];await until(()=>win.isVisible(),'widget failed to appear');
  const sendInput=win.webContents.sendInputEvent.bind(win.webContents);
  win.webContents.sendInputEvent=event=>{mouseEvents.push(event);return sendInput(event);};
  if(scenario==='external-hide'){
    win.hide();assert.equal(win.isVisible(),false);
    await until(()=>win.isVisible(),'widget stayed hidden although the host was visible',2500);
  }else if(scenario==='heartbeat-gap'){
    clearInterval(heartbeat);await delay(5000);send();heartbeat=setInterval(send,150);
    await until(()=>win.isVisible(),'widget did not recover after a temporary heartbeat gap',2500);
  }else if(scenario==='startup-work'){
    await until(()=>startedWork.length>=2,'background reads never started');
    assert.ok(startedWork.every(work=>work.visible),'quota/token work competed with the initial window display');
  }else if(scenario==='foreground-hover'){
    await until(()=>reception.at(-1)?.forward===true,'active host hover was not enabled');
    state.active=false;send();await until(()=>!win.isVisible(),'inactive host retained its hover surface');
    assert.deepEqual(reception.at(-1),{ignore:true,forward:false});
    assert.ok(mouseEvents.some(event=>event.type==='mouseLeave'),'pending hover was not cleared');
    await delay(700);assert.equal(win.isVisible(),false,'heartbeat revived the inactive overlay');
    assert.deepEqual(reception.at(-1),{ignore:true,forward:false});
    state.active=true;send();await until(()=>win.isVisible(),'returning to Codex did not restore the widget');
    await until(()=>reception.at(-1)?.forward===true,'returning to Codex did not restore hover');
  }
  assert.equal(win.isFocused(),false,'recovery stole keyboard focus');
  state.visible=false;send();await until(()=>!win.isVisible(),'widget stayed visible after host hid');
  state.visible=true;send();await until(()=>win.isVisible(),'widget did not return with host');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({scenario,pid:process.pid,passed:true}));
  clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(error=>{fs.writeFileSync(path.join(output,'error.txt'),error.stack);app.exit(1);});
