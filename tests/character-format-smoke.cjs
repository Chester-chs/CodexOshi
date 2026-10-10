// Only self-drawn rectangles; actual IPC/store/protocol/renderer/Worker, no quota requests.
const {app,BrowserWindow,ipcMain,protocol,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {CharacterStore}=require('../runtime/characters.cjs'),{installCharacters}=require('../desktop/characters.cjs');
const {layout,shape}=require('../desktop/geometry.cjs');
const output=process.argv[process.argv.indexOf('--output')+1];
protocol.registerSchemesAsPrivileged([{scheme:'character',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setPath('userData',path.join(output,'chromium'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const store=new CharacterStore(path.join(output,'characters'));await store.init();for(const name of await store.names())await store.remove(name);await store.create('格式几何');
  const win=new BrowserWindow({show:false,width:720,height:480,frame:false,transparent:true,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const ready=new Promise(r=>ipcMain.once('ready',r));installCharacters(win,store);await win.loadFile(path.resolve(__dirname,'../desktop/ui/index.html'));await ready;
  const view=layout({x:400,y:40},720,480,false,1);win.setShape(shape(view.regions,720,480,view.sizes));win.webContents.send('layout',view);
  let selected,filter;dialog.showOpenDialog=async(_parent,options)=>{
    filter=options.filters;const extensions=filter[0].extensions;
    for(const ext of ['png','jpg','jpeg','webp','gif','bmp'])assert.ok(extensions.includes(ext),'dialog must expose .'+ext);
    assert.ok(!extensions.includes('heic'));assert.ok(filter.some(f=>f.extensions.includes('*')),'content-valid unfamiliar extensions need an all-files option');
    return {canceled:false,filePaths:[selected]};
  };
  async function invoke(file){
    selected=file;return win.webContents.executeJavaScript(`window.widget.characterAction(${JSON.stringify({action:'import',name:'格式几何'})})`);
  }
  // The IPC API name is checked at runtime, not a source-text assertion.
  const cases=[];
  await fs.copyFile(path.resolve(__dirname,'../assets/placeholder-ready.png'),path.join(output,'renamed.jpg'));
  await fs.copyFile(path.join(output,'renamed.jpg'),path.join(output,'unknown.dat'));
  await fs.writeFile(path.join(output,'text.png'),'not an image');
  const inputs=[['jpg',path.join(__dirname,'fixtures/geometry.jpg')],['jpeg',path.join(__dirname,'fixtures/geometry-progressive.jpeg')],['png',path.resolve(__dirname,'../assets/placeholder-ready.png')],['webp',path.join(__dirname,'fixtures/geometry.webp')],['gif',path.join(__dirname,'fixtures/geometry.gif')],['bmp',path.join(__dirname,'fixtures/geometry.bmp')],['PNG named JPG',path.join(output,'renamed.jpg')],['PNG named DAT',path.join(output,'unknown.dat')]];
  for(const [label,file]of inputs){
    const before=await fs.stat(file),bytes=await fs.readFile(file);const result=await invoke(file);assert.equal(result.ok,true,result.error);
    win.webContents.send('quota',{windows:[{remainingPercent:80}]});
    const expected=result.snapshot.characters[0].image.url;let display;
    const deadline=Date.now()+3000;do{await new Promise(r=>setTimeout(r,50));display=await win.webContents.executeJavaScript(`(()=>{const c=document.querySelector('#character-canvas');return {source:c.dataset.source,frames:Number(c.dataset.frames),pixels:[...c.getContext('2d').getImageData(0,0,c.width,c.height).data].filter((v,i)=>i%4===3&&v).length}})()`);}while(display.source!==expected&&Date.now()<deadline);
    assert.equal(display.source,expected,label+' must decode instead of placeholder fallback');assert.ok(display.pixels>0);
    assert.deepEqual(await fs.readFile(file),bytes);assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);cases.push({label,ok:result.ok,mime:(await store.asset('格式几何','portrait')).mime,display});
  }
  const chosen=await invoke(path.join(__dirname,'fixtures/geometry.jpg')),quotaCases=[];for(const remaining of [80,40,15,3]){
    assert.equal(chosen.ok,true);win.webContents.send('quota',{windows:[{remainingPercent:remaining}]});await new Promise(r=>setTimeout(r,250));
    const source=await win.webContents.executeJavaScript(`document.querySelector('#character-canvas').dataset.source`);assert.equal(source,chosen.snapshot.characters[0].image.url);quotaCases.push({remaining,source});
  }
  const invalid=await invoke(path.join(output,'text.png'));assert.equal(invalid.ok,false);assert.match(invalid.error,/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);
  selected=path.join(output,'text.png');await win.webContents.executeJavaScript(`document.querySelector('#character-tab').click();document.querySelector('.upload-character').click()`);await new Promise(r=>setTimeout(r,200));
  const visibleError=await win.webContents.executeJavaScript(`document.querySelector('#character-error').textContent`);assert.match(visibleError,/PNG.*JPG.*JPEG.*WebP.*GIF.*BMP/);
  const large=path.join(output,'large.jpg');await fs.writeFile(large,Buffer.alloc(10*1024*1024+1));const sizeError=await invoke(large);assert.equal(sizeError.ok,false);assert.match(sizeError.error,/10 MiB/);
  const giant=path.join(output,'giant.jpg');await fs.writeFile(giant,Buffer.from([255,216,255,192,0,11,8,0,47,16,1,1,1,17,0]));const dimensionError=await invoke(giant);assert.equal(dimensionError.ok,false);assert.match(dimensionError.error,/4096/);
  assert.equal((await invoke(path.join(__dirname,'fixtures/geometry.jpg'))).ok,true,'IPC must remain usable after invalid input');
  const bmpDecoderSupport=await win.webContents.executeJavaScript(`ImageDecoder.isTypeSupported('image/bmp')`);
  await fs.writeFile(path.join(output,'format-smoke.json'),JSON.stringify({filter,cases,quotaCases,invalid,visibleError,sizeError,dimensionError,bmpDecoderSupport},null,2));app.quit();
}).catch(e=>{process.stderr.write(e.stack||String(e));app.exit(1);});
