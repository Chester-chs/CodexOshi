// Original geometric robot wearing a white outlined dress; no user artwork or quota reads.
const {app,BrowserWindow,ipcMain,protocol}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {CharacterStore}=require('../runtime/characters.cjs'),{installCharacters}=require('../desktop/characters.cjs');
const {layout,shape}=require('../desktop/geometry.cjs');
const output=process.argv[process.argv.indexOf('--output')+1],before=process.argv.includes('--before');
protocol.registerSchemesAsPrivileged([{scheme:'character',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setPath('userData',path.join(output,'chromium'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});const store=new CharacterStore(path.join(output,'characters'));await store.init();for(const name of await store.names())await store.remove(name);await store.create('白裙几何');
  await store.importFile('白裙几何','ready',path.join(__dirname,'fixtures/portrait-white.png'));
  const win=new BrowserWindow({show:false,width:900,height:700,frame:false,transparent:true,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const ready=new Promise(r=>ipcMain.once('ready',r));let current={width:160,height:112},currentContent=null;
  function update(expanded=true,count=2){const v=layout({x:550,y:60},900,700,expanded,count,current);assert.deepEqual(shape(v.regions,900,700,v.sizes),v.regions);win.setShape(v.regions);win.webContents.send('layout',v);}
  ipcMain.on('character-size',(_event,data)=>{if(before)return;currentContent=data;current=require('../desktop/ui/portrait-size.js').portraitSize(data.contentWidth,data.contentHeight,data.targetHeight,data.zoom>1);if(data.targetWidth!==undefined)current={width:data.targetWidth,height:data.targetHeight};update();});
  installCharacters(win,store);ipcMain.handle('dialogue-read',()=>require('../desktop/ui/dialogue-model.js').defaults());ipcMain.handle('panel-preferences-read',()=>({width:480,height:560,language:'zh-CN'}));await win.loadFile(path.resolve(__dirname,'../desktop/ui/index.html'));await ready;
  win.webContents.send('characters',await store.snapshot());win.webContents.send('quota',{windows:[{remainingPercent:80}]});update();await new Promise(r=>setTimeout(r,500));
  async function metrics(){return win.webContents.executeJavaScript(`(()=>{const w=document.querySelector('#widget'),c=document.querySelector('#character-stage'),p=document.querySelector('.compact-line'),r=w.getBoundingClientRect(),a=c.getBoundingClientRect(),b=p.getBoundingClientRect();return {width:r.width,height:r.height,characterHeight:a.height,background:getComputedStyle(w).backgroundColor,barPosition:getComputedStyle(p).position,barBackground:getComputedStyle(p).backgroundColor,barInside:b.bottom<=r.bottom&&b.top>r.top,status:document.querySelector('#status').textContent,source:document.querySelector('#character-canvas').dataset.source,slider:document.querySelector('#character-size')?.value}})()`);}
  async function capture(file){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,80));await fs.writeFile(path.join(output,file),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
  const initial=await metrics();await capture(before?'before.png':'after.png');
  if(before){await fs.writeFile(path.join(output,'before.json'),JSON.stringify(initial,null,2));app.quit();return;}
  assert.ok(initial.height>=270&&initial.height<=290,'default role must reach 280 DIP');assert.ok(initial.characterHeight>=220);assert.ok(initial.width<initial.height);assert.equal(initial.background,'rgba(0, 0, 0, 0)');assert.equal(initial.barPosition,'absolute');assert.equal(initial.barInside,true);assert.equal(initial.status,'80%');assert.match(initial.source,/local/);
  const frameProbe=await win.webContents.executeJavaScript(`(()=>{const c=document.querySelector('#character-canvas'),ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{const [x,y,width,height]=args.length===9?args.slice(5):args.slice(1);window.lastPortraitDraw={x,y,width,height,canvasWidth:c.width,canvasHeight:c.height,...(args.length===9?{source:args.slice(1,5)}:{})};draw(...args)};return true})()`);assert.equal(frameProbe,true);
  const portraitFrames=[];
  for(const h of [180,280,420]){
    await store.settings('白裙几何',{targetHeight:h,zoom:1.55,x:-.025,y:.756});win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,200));
    const frame=await win.webContents.executeJavaScript(`window.lastPortraitDraw`);assert.ok(frame.x>=0&&frame.y>=0);assert.ok(frame.x+frame.width<=frame.canvasWidth+.001);assert.ok(frame.y+frame.height<=frame.canvasHeight+.001);
    assert.equal(frame.source[0],0);assert.equal(frame.source[1],0);assert.equal(frame.source[2],631);assert.ok(Math.abs(frame.source[3]-882/1.55)<.001);
    const clearance=await win.webContents.executeJavaScript(`(()=>{const stage=document.querySelector('#character-stage').getBoundingClientRect(),bar=document.querySelector('.compact-line').getBoundingClientRect();return bar.top-stage.bottom})()`);assert.ok(clearance>=0,'progress footer must not cover the dress');portraitFrames.push({height:h,frame,clearance});
  }
  await store.settings('白裙几何',{targetHeight:280,zoom:2,x:-.025,y:.756});win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,200));update(false);await capture('upper-body-complete.png');const upperBody=await metrics();assert.ok(upperBody.width>350);update();
  await win.webContents.executeJavaScript(`document.querySelector('#character-zoom').value=4;document.querySelector('#character-zoom').dispatchEvent(new Event('input'));`);await new Promise(r=>setTimeout(r,350));const closeup=await metrics();assert.equal(closeup.height,280);assert.equal(closeup.width,upperBody.width,'framing must retain the prior explicit width');assert.equal((await store.read('白裙几何')).zoom,4);const closeFrame=await win.webContents.executeJavaScript('window.lastPortraitDraw');assert.deepEqual(closeFrame.source,[0,0,631,220.5]);update(false);await capture('portrait-chest-closeup.png');update();
  const metadataPath=path.join(store.root,'白裙几何','settings.json'),metadata=JSON.parse(await fs.readFile(metadataPath,'utf8'));delete metadata.targetWidth;await fs.writeFile(metadataPath,JSON.stringify(metadata));
  await store.settings('白裙几何',{targetHeight:280,zoom:1,x:0,y:0});win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,200));
  await win.webContents.executeJavaScript(`document.querySelector('#character-tab').click()`);
  // Commit the newly selected tab to the hidden window's hit-test surface.
  await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  await new Promise(r=>setTimeout(r,80));
  const wheelPoint=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('#panel-body'),r=p.getBoundingClientRect();return {x:Math.round(r.x+4),y:Math.round(r.y+r.height/2),top:p.scrollTop}})()`);
  win.webContents.sendInputEvent({type:'mouseWheel',x:wheelPoint.x,y:wheelPoint.y,deltaY:-120,deltaX:0,wheelTicksY:-1,canScroll:true});
  for(let i=0;i<4;i++){await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(r=>setTimeout(r,100));}
  const nativeWheel=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('#panel-body');return {top:p.scrollTop,max:p.scrollHeight-p.clientHeight,focused:document.hasFocus()};})()`);
  await fs.writeFile(path.join(output,'inactive-wheel-characterization.json'),JSON.stringify({before:wheelPoint,after:nativeWheel},null,2));
  assert.ok(nativeWheel.max>0,'character controls must extend beyond the card for this scroll test');assert.ok(nativeWheel.top>=Math.min(100,nativeWheel.max),'inactive character panel must accept native wheel input');assert.equal(nativeWheel.focused,false);
  const whiteGarment=await win.webContents.executeJavaScript(`(()=>{const c=document.querySelector('#character-canvas');return [...c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data]})()`);assert.deepEqual(whiteGarment,[255,255,255,255]);
  const sizes=[];
  for(const h of [180,281,420]){
    await win.webContents.executeJavaScript(`(()=>{const s=document.querySelector('#character-size');s.value='${h}';s.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,350));
    const m=await metrics();assert.ok(Math.abs(m.height-h)<=1);assert.equal(m.slider,String(h));assert.equal((await store.read('白裙几何')).targetHeight,h);sizes.push(m);
  }
  await store.create('另一个');win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,200));await store.select('白裙几何');win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,350));assert.equal((await metrics()).slider,'420');
  const panels=[];for(const [count,height]of [[0,560],[1,560],[2,560]]){update(true,count);await win.webContents.executeJavaScript(`document.querySelector('#character-tab').click()`);await new Promise(r=>setTimeout(r,100));const p=await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('#details'),body=document.querySelector('#panel-body');body.scrollTop=body.scrollHeight;const a=body.getBoundingClientRect(),b=document.querySelector('#character-notice').getBoundingClientRect();return {width:p.offsetWidth,height:p.offsetHeight,noticeVisible:b.bottom<=a.bottom+1&&b.top>=a.top,top:body.scrollTop,client:body.clientHeight,heightBody:body.scrollHeight,body:a.toJSON(),notice:b.toJSON()}})()`);assert.equal(p.width,480);assert.equal(p.height,height);assert.equal(p.noticeVisible,true,JSON.stringify(p));panels.push(p);}
  const extremes=[];await store.settings('白裙几何',{targetHeight:280});
  for(const [file,width,height]of [['portrait-wide.png',448,48],['portrait-narrow.png',126,420]]){
    await store.importFile('白裙几何','ready',path.join(__dirname,'fixtures',file));win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,350));const m=await metrics();assert.equal(m.width,width);assert.equal(m.height,height);assert.equal(m.barInside,true);extremes.push(m);
  }
  await store.importFile('白裙几何','ready',path.join(__dirname,'fixtures/portrait-white.png'));win.webContents.send('characters',await store.snapshot());await new Promise(r=>setTimeout(r,350));update(false);await capture('after-resident.png');
  await win.webContents.executeJavaScript(`window.heavyRenders=0;window.originalRender=window.render;window.render=(...args)=>{window.heavyRenders++;return window.originalRender(...args)};undefined`);
  for(let i=0;i<120;i++)win.webContents.send('layout',{...layout({x:550-i,y:60},900,700,false,2,current),dragging:true});
  await new Promise(r=>setTimeout(r,80));
  const draggingUI=await win.webContents.executeJavaScript(`({renders:window.heavyRenders,left:document.querySelector('#widget').style.left})`);
  assert.equal(draggingUI.renders,0,'drag layout must only move UI, not rebuild quota cards');assert.equal(draggingUI.left,'431px');update(false);
  await new Promise(r=>setTimeout(r,50));assert.ok(await win.webContents.executeJavaScript('window.heavyRenders')>0,'end layout must resume full render');
  await fs.writeFile(path.join(output,'portrait-ui-smoke.json'),JSON.stringify({initial,portraitFrames,closeup,closeFrame,sizes,panels,whiteGarment,extremes,content:currentContent,draggingUI},null,2));app.quit();
}).catch(e=>{process.stderr.write(e.stack||String(e));app.exit(1);});
