// Real Electron main/window/shape and real writes to an isolated local folder.
// Account reader and token Worker are replaced: no account/network/model reads.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),{EventEmitter}=require('node:events'),{execFileSync}=require('node:child_process');
const output=process.argv[process.argv.indexOf('--output')+1],before=process.argv.includes('--before');
const baseline=process.argv.includes('--baseline')?process.argv[process.argv.indexOf('--baseline')+1]:'bab3619';
const data=path.join(output,before?'before':'after');fs.mkdirSync(data,{recursive:true});process.argv.push('--data',data);
const writes=[],originalWrite=fs.writeFileSync,originalLoad=Module._load;
fs.writeFileSync=function(file,value,...args){if(path.dirname(String(file))===data)writes.push(path.basename(String(file)));return originalWrite.call(this,file,value,...args);};
Module._load=function(name,parent,...args){
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}async refresh(){return this.snapshot;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};
  return originalLoad.call(this,name,parent,...args);
};
const filename=path.resolve(__dirname,'../desktop/main.cjs');
const source=before?execFileSync('git',['show',baseline+':desktop/main.cjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}):fs.readFileSync(filename,'utf8');
const main=new Module(filename,module);main.filename=filename;main.paths=Module._nodeModulePaths(path.dirname(filename));BrowserWindow.prototype.showInactive=function(){};main._compile(source,filename);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await app.whenReady();const deadline=Date.now()+8000;
  let bridge;
  while(!bridge){try{const value=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(value.pid===process.pid)bridge=value;}catch{}if(Date.now()>deadline)throw Error('Main bridge unavailable');await delay(20);}
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,modal:false,dpi:144,bounds:{width:1350,height:1050}}})+'\n');await delay(120);
  const win=BrowserWindow.getAllWindows()[0],event={sender:win.webContents},rows=[];
  for(const edge of [false,true]){
    writes.length=0;const start=performance.now();
    for(let i=0;i<120;i++)ipcMain.emit('gesture',event,{type:'drag',x:edge?(i%2?9999:-9999):250+i,y:edge?(i%2?9999:-9999):150});
    const moving={events:120,elapsedMs:performance.now()-start,positionWrites:writes.filter(f=>f==='position.json').length,diagnosticWrites:writes.filter(f=>f==='window-state.json').length};
    ipcMain.emit('gesture',event,{type:'end'});
    const position=JSON.parse(fs.readFileSync(path.join(data,'position.json'),'utf8'));
    rows.push({case:edge?'viewport-edge':'inside-viewport',moving,totalAfterEnd:writes.filter(f=>['position.json','window-state.json'].includes(f)).length,position});
  }
  const result={revision:before?baseline:'working-tree',hidden:!win.isVisible(),rows};
  if(!before&&rows.some(r=>r.moving.positionWrites||r.moving.diagnosticWrites))throw Error('Real main still writes during drag');
  originalWrite(path.join(output,before?'before.json':'after.json'),JSON.stringify(result,null,2));socket.destroy();app.quit();
})().catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});
