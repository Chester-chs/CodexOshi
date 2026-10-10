// Real production main, preload and reset button; isolated files and hidden window.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),{EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const output=process.argv[process.argv.indexOf('--output')+1],scenario=process.argv[process.argv.indexOf('--case')+1],data=path.join(output,'data');
fs.mkdirSync(data,{recursive:true});const positionFile=path.join(data,'position.json');
if(['fresh','saved','small'].includes(scenario))fs.rmSync(positionFile,{force:true});
if(scenario==='corrupt')fs.writeFileSync(positionFile,'broken json');
process.argv.push('--data',data);const originalLoad=Module._load;
Module._load=function(name,parent,...args){
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}async refresh(){return this.snapshot;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};
  return originalLoad.call(this,name,parent,...args);
};
const filename=path.resolve(__dirname,'../desktop/main.cjs'),main=new Module(filename,module);main.filename=filename;main.paths=Module._nodeModulePaths(path.dirname(filename));main._compile(fs.readFileSync(filename,'utf8'),filename);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),read=()=>JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));
(async()=>{
  await app.whenReady();const deadline=Date.now()+8000;let bridge;
  while(!bridge){try{const value=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(value.pid===process.pid)bridge=value;}catch{}if(Date.now()>deadline)throw Error('No new bridge');await delay(20);}
  await delay(200);const beforeHost=read();
  if(scenario==='fresh'||scenario==='corrupt')assert.equal(beforeHost.widget,null,'first position must wait for host');
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise(r=>socket.once('connect',r));
  const small=scenario==='small',state={hostAlive:true,attached:true,visible:false,modal:false,dpi:96,bounds:{width:small?100:900,height:small?80:700}};
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state})+'\n');send();const heartbeat=setInterval(send,150);
  await delay(900);const win=BrowserWindow.getAllWindows()[0];
  if(scenario==='saved'){
    ipcMain.emit('gesture',{sender:win.webContents},{type:'drag',x:120,y:140});ipcMain.emit('gesture',{sender:win.webContents},{type:'end'});await delay(100);
  }
  if(scenario==='reset'){
    ipcMain.emit('gesture',{sender:win.webContents},{type:'drag',x:120,y:140});ipcMain.emit('gesture',{sender:win.webContents},{type:'end'});
    await win.webContents.executeJavaScript(`document.querySelector('#character-tab').click();document.querySelector('#position-reset').click();`);await delay(200);
  }
  const current=read(),r=current.region[0],saved=JSON.parse(fs.readFileSync(positionFile,'utf8'));
  const expected=['saved','restart-saved'].includes(scenario)?{x:120,y:140}:{x:Math.max(8,current.viewport.width-r.width-24),y:Math.max(8,current.viewport.height-r.height-24)};
  assert.deepEqual(current.widget,expected);assert.deepEqual(saved,expected);assert.equal(current.focused,false);assert.equal(win.isVisible(),false);
  if(small){assert.ok(r.x+r.width<=76);assert.ok(r.y+r.height<=56);}
  const result={scenario,pid:process.pid,beforeHost:beforeHost.widget,viewport:current.viewport,widget:current.widget,region:current.region,saved,expected,hidden:true,passed:true};
  fs.writeFileSync(path.join(output,scenario+'.json'),JSON.stringify(result,null,2));clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});
