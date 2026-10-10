// Actual main/preload/renderer and geometric white-dress fixture; no account reads.
const {app,BrowserWindow,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const output=process.argv[process.argv.indexOf('--output')+1],data=path.join(output,'data'),role=path.join(data,'characters','白裙几何');fs.mkdirSync(role,{recursive:true});
const fixture=path.resolve(__dirname,'fixtures/portrait-white.png');fs.copyFileSync(fixture,path.join(role,'tired.png'));
fs.writeFileSync(path.join(role,'settings.json'),JSON.stringify({background:true,zoom:1,x:0,y:0,targetHeight:280,images:{tired:'tired.png'},notes:'preserve legacy'}));fs.writeFileSync(path.join(data,'characters','active.json'),'{"name":"白裙几何"}');
// Start every run with the tired-only legacy fixture, not a previously uploaded portrait.
process.argv.push('--data',data);const originalLoad=Module._load;
Module._load=function(name,parent,...args){if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[{remainingPercent:80,label:'每周限额'}]};}async refresh(){return this.snapshot;}}};if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};return originalLoad.call(this,name,parent,...args);};
const shapes=[],nativeShape=BrowserWindow.prototype.setShape;BrowserWindow.prototype.setShape=function(value){shapes.push(JSON.stringify(value));return nativeShape.call(this,value);};
const filename=path.resolve(__dirname,'../desktop/main.cjs'),main=new Module(filename,module);main.filename=filename;main.paths=Module._nodeModulePaths(path.dirname(filename));BrowserWindow.prototype.showInactive=function(){};main._compile(fs.readFileSync(filename,'utf8'),filename);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),state=()=>JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));
(async()=>{
  await app.whenReady();let bridge;const deadline=Date.now()+8000;while(!bridge){try{const q=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(q.pid===process.pid)bridge=q;}catch{}if(Date.now()>deadline)throw Error('No new bridge');await delay(20);}
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,modal:false,dpi:96,bounds:{width:900,height:700}}})+'\n');send();let heartbeat=setInterval(send,150);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  async function capture(name){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await delay(60);fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
  await delay(700);await js(`document.querySelector('#character-tab').click()`);
  const decodedDeadline=Date.now()+4000;while(!(await js(`document.querySelector('#character-canvas').dataset.source||''`)).includes('tired.png')&&Date.now()<decodedDeadline)await delay(40);
  const initial=await js(`({source:document.querySelector('#character-canvas').dataset.source,uploads:document.querySelectorAll('.upload-character').length,pixels:document.querySelector('#character-canvas').toDataURL(),filter:getComputedStyle(document.querySelector('#character-canvas')).filter})`);
  fs.writeFileSync(path.join(output,'initial-debug.json'),JSON.stringify({...initial,pixels:undefined,roles:await js(`document.querySelector('#character-list').textContent`),error:await js(`document.querySelector('#character-error').textContent`),processing:await js(`document.querySelector('#character-processing').textContent`)},null,2));
  assert.match(initial.source,/tired\.png/,'tired-only legacy portrait must really decode');assert.equal(initial.uploads,1);
  const quotaCases=[];for(const [remaining,tone]of [[80,'normal'],[20,'orange'],[11,'orange'],[10,'red'],[0,'red']]){
    win.webContents.send('quota',{windows:[{remainingPercent:remaining,label:'每周限额'}]});await delay(80);
    const q=await js(`({source:document.querySelector('#character-canvas').dataset.source,pixels:document.querySelector('#character-canvas').toDataURL(),filter:getComputedStyle(document.querySelector('#character-canvas')).filter,tone:document.querySelector('#compact-track').className,text:document.querySelector('#status').textContent})`);
    assert.equal(q.source,initial.source);assert.equal(q.pixels,initial.pixels);assert.equal(q.filter,initial.filter);assert.ok(q.tone.includes(tone));assert.equal(q.text,remaining+'%');quotaCases.push({remaining,tone:q.tone,source:q.source});
  }
  win.webContents.send('quota',{windows:[]});await delay(80);assert.equal(await js(`document.querySelector('#character-canvas').dataset.source`),initial.source);
  win.webContents.send('quota',{windows:[{remainingPercent:80,label:'每周限额'}]});
  // Click feedback must use actual pointer events and preserve the normal toggle.
  await capture('resident-before.png');clearInterval(heartbeat);heartbeat=null;
  const before=state(),r=before.region[0];win.webContents.sendInputEvent({type:'mouseDown',x:r.x+r.width/2,y:r.y+r.height/2,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:r.x+r.width/2,y:r.y+r.height/2,button:'left',clickCount:1});
  await delay(40);const animation=await js(`(()=>{const c=document.querySelector('#character-canvas'),a=c.getAnimations()[0];return {present:!!a,duration:a?.effect.getTiming().duration,keyframes:a?.effect.getKeyframes(),transform:getComputedStyle(c).transform}})()`);assert.equal(animation.present,true);assert.equal(animation.duration,220);
  const during=state(),shapeStart=shapes.length;assert.equal(during.clicks,before.clicks+1);assert.equal(during.expanded,!before.expanded);await capture('resident-feedback.png');
  for(let i=0;i<4;i++){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await delay(60);}
  const after=state(),restored=await js(`({transform:getComputedStyle(document.querySelector('#character-canvas')).transform,running:document.querySelector('#character-canvas').getAnimations().length})`),shapeCallsDuringAnimation=shapes.length-shapeStart;assert.equal(restored.transform,'none');assert.equal(restored.running,0);assert.deepEqual(after.region,during.region);assert.equal(shapeCallsDuringAnimation,0,'animation itself must not call setShape');
  send();heartbeat=setInterval(send,150);
  // Keep all existing settings; exercise the actual single upload button/dialog/IPC.
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});await js(`document.querySelector('#character-tab').click();document.querySelector('.upload-character').click();`);await delay(400);
  const settings=[];for(const h of [180,280,420]){await js(`(()=>{const s=document.querySelector('#character-size');s.value='${h}';s.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(500);assert.equal(state().region[0].height,h);assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8')).targetHeight,h);settings.push(h);}
  await js(`(()=>{const b=document.querySelector('#character-background');b.checked=false;b.dispatchEvent(new Event('change'));})()`);await delay(500);
  await js(`(()=>{const z=document.querySelector('#character-zoom');z.value='1.3';z.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(500);
  const metadata=JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8'));assert.equal(metadata.background,false);assert.equal(metadata.zoom,1.3);assert.equal(metadata.targetHeight,420);assert.equal(metadata.images.tired,'tired.png');assert.equal(metadata.notes,'preserve legacy');assert.ok(metadata.portrait);assert.deepEqual(fs.readFileSync(path.join(role,'tired.png')),fs.readFileSync(fixture));
  const previewPoint=await js(`(()=>{const c=document.querySelector('#character-processed');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  win.webContents.sendInputEvent({type:'mouseDown',...previewPoint,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:previewPoint.x+20,y:previewPoint.y+10,button:'left'});win.webContents.sendInputEvent({type:'mouseUp',x:previewPoint.x+20,y:previewPoint.y+10,button:'left',clickCount:1});await delay(500);
  const pan=JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8'));assert.ok(pan.x>0&&pan.y>0,'real preview drag must persist framing');
  await js(`document.querySelector('#character-reset').click()`);await delay(500);
  await js(`(()=>{const s=document.querySelector('#character-size');s.value='280';s.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(500);assert.equal(state().region[0].height,280);
  await js(`(()=>{const b=document.querySelector('#character-background');b.checked=true;b.dispatchEvent(new Event('change'));})()`);await delay(500);
  await js(`document.querySelector('#position-reset').click()`);await delay(80);const reset=state();assert.equal(reset.widget.x,900-reset.region[0].width-24);assert.equal(reset.widget.y,700-reset.region[0].height-24);
  // Screenshot presents the single settings panel using only the free geometric fixture.
  await js(`document.querySelector('#details').scrollTop=0`);await capture('single-settings.png');await js(`document.querySelector('#details').scrollTop=document.querySelector('#details').scrollHeight`);await capture('single-settings-bottom.png');
  const result={initial:{source:initial.source,uploads:initial.uploads},quotaCases,animation,beforeRegion:before.region,duringRegion:during.region,afterRegion:after.region,restored,shapeCallsDuringAnimation,settings,metadata,pan:{x:pan.x,y:pan.y},reset:reset.widget,hidden:!win.isVisible(),passed:true};
  fs.writeFileSync(path.join(output,'single-character-ui.json'),JSON.stringify(result,null,2));clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});
