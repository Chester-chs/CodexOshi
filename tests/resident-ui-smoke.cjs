// Real hidden Electron application; geometric artwork and synthetic data only.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]),data=path.join(output,'data'),restart=process.argv.includes('--restart'),role=path.join(data,'characters','几何角色');fs.mkdirSync(role,{recursive:true});
if(!restart){fs.copyFileSync(path.join(__dirname,'fixtures/portrait-white.png'),path.join(role,'tired.png'));fs.writeFileSync(path.join(role,'settings.json'),JSON.stringify({images:{tired:'tired.png'},targetHeight:300}));fs.writeFileSync(path.join(data,'characters','active.json'),'{"name":"几何角色"}');fs.writeFileSync(path.join(data,'position.json'),'{"x":90,"y":100}');try{fs.unlinkSync(path.join(data,'panel-preferences.json'));}catch(e){if(e.code!=='ENOENT')throw e;}}
process.argv.push('--data',data);const load=Module._load;Module._load=function(name,parent,...args){if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[{remainingPercent:55,label:'每周限额'}]};}async refresh(){return this.snapshot;}}};if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};return load.call(this,name,parent,...args);};
BrowserWindow.prototype.showInactive=function(){};require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),state=()=>JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));
(async()=>{
  await app.whenReady();let bridge;for(let i=0;i<250&&!bridge;i++){try{const b=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(b.pid===process.pid)bridge=b;}catch{}await delay(20);}assert.ok(bridge);
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});let dimensions={width:1600,height:1000},revision=0;
  const send=extra=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,revision:++revision,bounds:dimensions,...extra}})+'\n');send();const heartbeat=setInterval(()=>send(),150);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  async function waitFor(code){const deadline=Date.now()+4000;while(!(await js(code))){if(Date.now()>deadline)throw Error('UI condition timed out: '+code);await delay(25);}}
  let restartedOff=false;
  if(restart){
    await waitFor(`!document.querySelector('#codi-launcher').hidden`);await delay(100);assert.equal(state().widgetEnabled,false);assert.deepEqual(state().region,[{x:1456,y:934,width:120,height:42}]);restartedOff=true;
    await js(`document.querySelector('#codi-launcher').click()`);
  }
  await waitFor(`document.querySelector('#character-canvas').dataset.source?.includes('tired.png')`);await delay(250);
  async function metrics(){return js(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {widget:rect('#widget'),bar:rect('.compact-line'),stage:rect('#character-stage'),gear:rect('#settings-open'),transform:getComputedStyle(document.querySelector('#resident-content')).transform,zoom:document.querySelector('#character-zoom').value,widthInput:document.querySelector('#character-width').value};})()`);}
  async function checkPlacement(){const r=state().region[0],v=state().viewport,m=await metrics();assert.equal(r.x+r.width,v.width-24);assert.equal(r.y+r.height,v.height-24);assert.ok(m.bar.bottom<=r.y+r.height+.5);assert.ok(m.bar.y>=m.stage.bottom);assert.ok(m.widget.right<=v.width-24+.5);return {viewport:v,region:r,metrics:m};}
  async function resize(width,height){dimensions={width,height};send();await delay(250);return checkPlacement();}
  if(restart){const q=await checkPlacement();assert.equal(state().region[0].width,240);assert.equal((await js('window.widget.panelPreferencesRead()')).dockBottomRight,true);assert.equal((JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8'))).targetWidth,240);fs.writeFileSync(path.join(output,'restart.json'),JSON.stringify({passed:true,restartedOff,restoredViaVisibleSwitch:true,...q},null,2));clearInterval(heartbeat);socket.destroy();app.quit();return;}
  const full=await checkPlacement(),small=await resize(800,600),restored=await resize(1600,1000);assert.ok(small.region.height<full.region.height*.7);assert.deepEqual(restored.region,full.region);assert.ok(Math.abs(small.metrics.bar.height/full.metrics.bar.height-small.region.height/full.region.height)<.02);
  const originalPosition=fs.readFileSync(path.join(data,'position.json'),'utf8');for(let i=0;i<120;i++)await js(`window.widget.gesture({type:'drag',x:${i},y:${i}})`);await js(`window.widget.gesture({type:'end'})`);assert.equal(fs.readFileSync(path.join(data,'position.json'),'utf8'),originalPosition);assert.deepEqual(state().region[0],full.region);
  await js(`window.widget.openSettings();document.querySelector('#character-tab').click()`);await delay(120);assert.equal(await js(`document.querySelector('#character-zoom').type`),'number');
  const panelBefore=state().region[1];
  assert.equal(await js(`document.querySelector('#character-size').closest('label').nextElementSibling===document.querySelector('#character-width').closest('label')`),true);
  await js(`document.querySelector('#character-width').value=360;document.querySelector('#character-width').dispatchEvent(new Event('input'));`);await delay(300);assert.equal(state().region[0].width,360);assert.deepEqual(state().region[1],panelBefore);
  assert.equal(await js(`document.querySelectorAll('[data-framing],#character-framing').length`),0);
  await js(`document.querySelector('#character-zoom').value=3;document.querySelector('#character-zoom').dispatchEvent(new Event('input'))`);await delay(300);assert.equal(state().region[0].width,360);assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8')).zoom,3);
  await js(`document.querySelector('#character-zoom-plus').click()`);await delay(300);assert.equal(state().region[0].width,360);assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8')).zoom,3.1);
  await js(`document.querySelector('#character-zoom').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);await delay(80);assert.match(win.getTitle(),/Text editing/);await js(`document.querySelector('#character-zoom').select()`);await win.webContents.insertText('3.2');await delay(250);assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8')).zoom,3.2);assert.equal(state().region[0].width,360);await js(`document.querySelector('#character-width').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);await delay(80);assert.equal(win.getTitle(),'Codex Quota Widget');
  await js(`document.querySelector('#character-width').value=240;document.querySelector('#character-width').dispatchEvent(new Event('input'))`);await delay(300);assert.equal(state().region[0].width,240);assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8')).targetWidth,240);
  for(const [id,key,value,min,max]of [['character-width-value','targetWidth',280,126,672],['character-size-value','targetHeight',320,180,420]]){
    assert.equal(await js(`document.querySelector('#${id}').type`),'number');
    await js(`document.querySelector('#${id}').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);await delay(60);assert.match(win.getTitle(),/Text editing/);
    await js(`document.querySelector('#${id}').select()`);await win.webContents.insertText(String(value));await delay(300);
    assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8'))[key],value);assert.deepEqual(state().region[1],panelBefore);
    for(const invalid of ['',String(min-1),String(max+1),'200.5']){
      await js(`document.querySelector('#${id}').value=${JSON.stringify(invalid)};document.querySelector('#${id}').dispatchEvent(new Event('input'))`);await delay(180);
      assert.equal(JSON.parse(fs.readFileSync(path.join(role,'settings.json'),'utf8'))[key],value);assert.deepEqual(state().region[1],panelBefore);
    }
    await js(`document.querySelector('#${id}').blur()`);assert.equal(await js(`document.querySelector('#${id}').value`),String(value));
  }
  for(const width of [126,672,240]){await js(`document.querySelector('#character-width').value=${width};document.querySelector('#character-width').dispatchEvent(new Event('input'))`);await delay(220);assert.deepEqual(state().region[1],panelBefore);}
  await js(`document.querySelector('#character-size').value=300;document.querySelector('#character-size').dispatchEvent(new Event('input'))`);await delay(220);assert.deepEqual(state().region[1],panelBefore);
  await js(`document.querySelector('#resident-dock').checked=false;document.querySelector('#resident-dock').dispatchEvent(new Event('change'))`);await delay(250);assert.deepEqual(state().widget,{x:90,y:100});
  await js(`document.querySelector('#resident-dock').checked=true;document.querySelector('#resident-dock').dispatchEvent(new Event('change'))`);await delay(250);assert.equal(JSON.parse(fs.readFileSync(path.join(data,'panel-preferences.json'),'utf8')).dockBottomRight,true);await checkPlacement();
  const enabledRegion={...state().region[0]};
  await js(`document.querySelector('#codi-power').click()`);await delay(200);
  assert.equal(state().widgetEnabled,false);assert.equal(state().expanded,false);assert.equal(state().speechVisible,false);assert.deepEqual(state().region,[{x:1456,y:934,width:120,height:42}]);
  assert.equal(await js(`document.querySelector('#widget').hidden&&!document.querySelector('#codi-launcher').hidden`),true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'panel-preferences.json'),'utf8')).widgetEnabled,false);
  await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});fs.writeFileSync(path.join(output,'switch-off.png'),(await win.webContents.capturePage({x:1456,y:934,width:120,height:42},{stayHidden:true,stayAwake:true})).toPNG());
  const launcher={x:1516,y:955};for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...launcher,button:'left',clickCount:1});await delay(200);
  assert.equal(state().widgetEnabled,true);assert.deepEqual(state().region[0],enabledRegion);assert.equal(await js(`document.querySelector('#codi-launcher').hidden&&!document.querySelector('#widget').hidden`),true);
  await js(`window.widget.openSettings()`);await delay(100);
  await js(`document.querySelector('#character-width').scrollIntoView({block:'center'})`);await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});const panel=state().region[1];fs.writeFileSync(path.join(output,'controls.png'),(await win.webContents.capturePage({x:panel.x,y:panel.y,width:panel.width,height:panel.height},{stayHidden:true,stayAwake:true})).toPNG());
  await js(`document.querySelector('#close').click()`);await delay(150);const reduced=await resize(800,600);await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});fs.writeFileSync(path.join(output,'small.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await resize(1600,1000);
  const gear=await js(`(()=>{const r=document.querySelector('#settings-open').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...gear,button:'left',clickCount:1});await delay(180);assert.equal(state().expanded,true);assert.equal(BrowserWindow.getAllWindows().length,1);
  await js(`document.querySelector('#codi-power').click()`);await delay(200);assert.equal(JSON.parse(fs.readFileSync(path.join(data,'panel-preferences.json'),'utf8')).widgetEnabled,false);
  const result={passed:true,full,small,restored,reduced,widthControls:{sizeAndWidthAdjacent:true,multiplierOnly:true,microAdjust:true,widthIndependent:true,persisted:240,numericWidthAndSize:true,invalidInputRejected:true,settingsPanelStable:true,panelBefore},codiSwitch:{visible:true,offRegion:{width:120,height:42},persisted:true,pointerRestore:true,originalDimensionsRestored:true},originalFreePositionPreserved:true,scaledGearClickable:true};fs.writeFileSync(path.join(output,'resident-ui.json'),JSON.stringify(result,null,2));clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});
