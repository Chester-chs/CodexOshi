// Hidden real application, fixed local geometry art and synthetic quota/token snapshots.
const {app,BrowserWindow,nativeTheme,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{execFileSync}=require('node:child_process');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]),data=path.join(output,'data'),restart=process.argv.includes('--restart'),role=path.join(data,'characters','白裙几何'),source=path.resolve(__dirname,'..');fs.mkdirSync(role,{recursive:true});
fs.copyFileSync(path.join(__dirname,'fixtures/portrait-white.png'),path.join(role,'tired.png'));fs.writeFileSync(path.join(role,'settings.json'),JSON.stringify({images:{tired:'tired.png'},targetHeight:280}));fs.writeFileSync(path.join(data,'characters','active.json'),'{"name":"白裙几何"}');
if(!restart)try{fs.unlinkSync(path.join(data,'appearance.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
const quota={windows:[{remainingPercent:72,label:'5 小时限额',resetAt:Date.now()/1000+7200},{remainingPercent:55,label:'每周限额',resetAt:Date.now()/1000+86400*3}],planType:'plus',source:'http',observedAt:Date.now()};
const tokenData={values:{hours24:246800,days7:1456000,days30:6200000},coverage:'complete',filesIndexed:12,filesDiscovered:12,observedAt:Date.now()};
process.argv.push('--data',data);const originalLoad=Module._load;
Module._load=function(name,parent,...args){if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot=quota;}async refresh(){return this.snapshot;}}};if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){queueMicrotask(()=>this.emit('message',{type:'tokens',value:tokenData}));}terminate(){}}};return originalLoad.call(this,name,parent,...args);};
const shapes=[],nativeShape=BrowserWindow.prototype.setShape;BrowserWindow.prototype.setShape=function(value){shapes.push(JSON.stringify(value));return nativeShape.call(this,value);};
const handlers=new Map(),nativeHandle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,callback)=>{handlers.set(name,callback);nativeHandle(name,callback);};
const filename=path.join(source,'desktop/main.cjs'),main=new Module(filename,module);main.filename=filename;main.paths=Module._nodeModulePaths(path.dirname(filename));BrowserWindow.prototype.showInactive=function(){};main._compile(fs.readFileSync(filename,'utf8'),filename);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),state=()=>JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));
(async()=>{
  await app.whenReady();let bridge;const deadline=Date.now()+6000;while(!bridge){try{const q=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(q.pid===process.pid)bridge=q;}catch{}if(Date.now()>deadline)throw Error('No new bridge');await delay(20);}
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  let revision=0;
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,revision:++revision,bounds:{width:900,height:700}}})+'\n');send();let heartbeat=setInterval(send,150);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code),current=path.join(source,'desktop/ui/index.html');
  async function waitFor(code){const deadline=Date.now()+4000;while(!(await js(code))){if(Date.now()>deadline)throw Error('UI condition timed out: '+code);await delay(40);}}
  await waitFor(`document.querySelector('#character-canvas').dataset.source?.includes('tired.png')`);await delay(350);
  await waitFor(`document.querySelectorAll('button[data-palette]').length===6`);
  const actual=await js(`window.widget.appearanceRead()`);
  assert.equal(await handlers.get('appearance-read')({sender:{}}),null);assert.equal((await handlers.get('appearance-save')({sender:{}},{palette:'forest'})).ok,false);
  if(restart){assert.deepEqual(actual,{palette:'forest'});await waitFor(`document.documentElement.dataset.palette==='forest'`);fs.writeFileSync(path.join(output,'restart.json'),JSON.stringify({pid:process.pid,settings:actual,passed:true},null,2));clearInterval(heartbeat);socket.destroy();app.quit();return;}
  await js(`window.widget.openSettings();document.querySelector('#appearance-tab').click()`);await delay(150);
  assert.equal(await js(`document.querySelectorAll('[data-mode],[data-surface],#accent-custom').length`),0);
  const model=require('../desktop/ui/appearance-model.js'),rows=[],stableRegion=state().region;clearInterval(heartbeat);let shapeCallsForTheme=0;
  async function capture(name){const r=state().region[1];await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await delay(60);fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage({x:r.x,y:r.y,width:r.width,height:r.height},{stayHidden:true,stayAwake:true})).toPNG());}
  for(const p of model.palettes){
    send();await waitFor(`document.readyState==='complete'`);while(state().host.revision!==revision)await delay(5);const before=shapes.length;
    await js(`document.querySelector('#appearance-tab').click();document.querySelector('button[data-palette="${p.id}"]').click();document.querySelector('#details').scrollTop=0`);await delay(180);
    const colors=await js(`(()=>{const ids=['#details','#metadata','.palette-choice strong','.palette-pair','#character-upload','.token-column','.token-scale'];return Object.fromEntries(ids.map(s=>{const c=getComputedStyle(document.querySelector(s));return [s,{color:c.color,background:c.backgroundColor}]}))})()`);
    const q=model.resolve({palette:p.id}),hex=c=>'#'+c.match(/[\d.]+/g).slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
    assert.equal(await js(`document.documentElement.hasAttribute('aria-pressed')`),false);const check=await js(`(()=>{const c=getComputedStyle(document.querySelector('button[data-palette="${p.id}"]'),'::after');return {color:c.color,background:c.backgroundColor}})()`);assert.ok(model.contrast(hex(check.color),hex(check.background))>=4.5);assert.equal(hex(colors['#details'].background),p.base);assert.equal(hex(colors['.token-column'].background),p.elevated);assert.equal(hex(colors['#character-upload'].background),q.variables['--accent']);assert.equal(hex(colors['.palette-choice strong'].color),q.variables['--text-primary']);assert.equal(hex(colors['.palette-pair'].color),q.variables['--text-secondary']);assert.equal(hex(colors['.token-scale'].color),q.variables['--text-secondary']);
    const minimum=Math.min(...q.contrastPairs.flatMap(([f,bs])=>bs.map(b=>model.contrast(f,b))));assert.ok(minimum>=4.5);assert.equal(shapes.length,before);assert.deepEqual(state().region,stableRegion);
    nativeTheme.themeSource='light';await delay(40);const light=await js(`getComputedStyle(document.querySelector('#details')).backgroundColor`);nativeTheme.themeSource='dark';await delay(40);const dark=await js(`getComputedStyle(document.querySelector('#details')).backgroundColor`);assert.equal(light,dark);
    await capture('palette-'+p.id+'.png');await js(`document.querySelector('#token-tab').click()`);await capture('token-'+p.id+'.png');rows.push({palette:p.id,base:p.base,accent:q.variables['--accent'],minimum,systemIndependent:true});
  }
  heartbeat=setInterval(send,150);await js(`document.querySelector('#appearance-tab').click();document.querySelector('button[data-palette="forest"]').click()`);await delay(350);
  const persisted=JSON.parse(fs.readFileSync(path.join(data,'appearance.json'),'utf8'));assert.deepEqual(persisted,{palette:'forest'});
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('DOM.enable');await win.webContents.debugger.sendCommand('CSS.enable');const doc=await win.webContents.debugger.sendCommand('DOM.getDocument');const {nodeId}=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'button[data-palette="forest"]'});await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['focus','focus-visible']});
  const focusRing=await js(`getComputedStyle(document.querySelector('button[data-palette="forest"]')).outlineWidth`);assert.equal(focusRing,'2px');win.webContents.debugger.detach();
  const result={passed:true,palettes:rows.length,minimumContrast:Math.min(...rows.map(r=>r.minimum)),shapeCallsForTheme,stableRegion,persisted,focusRing,rows};fs.writeFileSync(path.join(output,'appearance-ui.json'),JSON.stringify(result,null,2));clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});