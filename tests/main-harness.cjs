// Execute the real main lifecycle/IPC bodies; replace external Electron, account,
// disk and Worker boundaries to measure writes without starting account reads.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
async function mainHarness(source){
  const filename=path.resolve(__dirname,'../desktop/main.cjs'),localRequire=createRequire(filename),handlers=new Map(),writes=[],layouts=[],shapes=[],timers=new Map();
  let now=10000,next=0,start,stringifies=0;
  const schedule=(fn,delay,repeat=false)=>{const id=++next;timers.set(id,{fn,at:now+delay,repeat:repeat?delay:0});return id;};
  const clock={setTimeout:(fn,d)=>schedule(fn,d),clearTimeout:id=>timers.delete(id),setInterval:(fn,d)=>schedule(fn,d,true),clearInterval:id=>timers.delete(id)};
  function advance(ms){const end=now+ms;while(true){const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;const[id,t]=entry;now=t.at;if(t.repeat)t.at+=t.repeat;else timers.delete(id);t.fn();}now=end;}
  class FakeWindow {
    constructor(){this.webContents={send:(name,value)=>{if(name==='layout')layouts.push({at:now,value});},on(){},setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}}};}
    setShape(value){shapes.push(value);}setIgnoreMouseEvents(){}getNativeWindowHandle(){const b=Buffer.alloc(8);b.writeBigUInt64LE(1n);return b;}
    getSize(){return [800,600];}setSize(){}getBounds(){return {x:0,y:0};}isVisible(){return true;}isFocused(){return false;}isDestroyed(){return false;}showInactive(){}hide(){}async loadFile(){}
  }
  const electron={app:{setPath(){},disableHardwareAcceleration(){},commandLine:{appendSwitch(){}},whenReady(){return {then(fn){start=fn;}};},on(){},quit(){}},BrowserWindow:FakeWindow,ipcMain:{on:(name,fn)=>handlers.set(name,fn)},screen:{getCursorScreenPoint:()=>({x:0,y:0})},protocol:{registerSchemesAsPrivileged(){}}};
  const testFs={readFileSync(){throw Error('No prior data');},writeFileSync(file,value){writes.push({at:now,file:path.basename(file),value});},renameSync(){}};
  class FakeDate extends Date{static now(){return now;}}
  const context=vm.createContext({process:{argv:['node','main','--data','C:/drag-fixture']},Buffer,console,...clock,Date:FakeDate,JSON:{parse:JSON.parse,stringify(...args){stringifies++;return JSON.stringify(...args);}},__dirname:path.dirname(filename),require:name=>{
    if(name==='electron')return electron;if(name==='node:fs')return testFs;
    if(name==='node:net')return {createServer(){return {listen(_name,fn){fn();},close(){}};}};
    if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}refresh(){return new Promise(()=>{});}}};
    if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};
    if(name==='../runtime/characters.cjs')return {CharacterStore:class{async init(){}}};
    if(name==='./characters.cjs')return {installCharacters(){}};return localRequire(name);
  }});
  vm.runInContext(source||fs.readFileSync(filename,'utf8'),context,{filename});await start();
  vm.runInContext('ready=true;host={attached:true};dip={width:800,height:600};widget={x:300,y:200};characterSize={width:199,height:280};updateShape();',context);
  const event=vm.runInContext('({sender:win.webContents})',context);
  function reset(){writes.length=0;layouts.length=0;shapes.length=0;stringifies=0;}
  reset();return {context,writes,layouts,shapes,advance,reset,get stringifies(){return stringifies;},gesture:value=>handlers.get('gesture')(event,value),run:script=>vm.runInContext(script,context)};
}
module.exports={mainHarness};
