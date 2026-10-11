const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const model=require('../desktop/ui/panel-model.js'),{PanelPreferencesStore}=require('../runtime/panel-preferences.cjs'),{mainHarness}=require('./main-harness.cjs');

test('click sound accepts only optional booleans and survives preference persistence',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codi-click-sound-'));
  try{
    const store=new PanelPreferencesStore(root),base={width:620,height:700,language:'en-US',dockBottomRight:false,widgetEnabled:true};
    assert.equal(model.validate(base).clickSoundEnabled!==false,true,'older preferences keep sound enabled');
    for(const value of [false,true]){
      await store.save({...base,clickSoundEnabled:value});
      assert.deepEqual(await new PanelPreferencesStore(root).read(),{...base,clickSoundEnabled:value});
    }
    for(const value of [null,0,1,'false',{},[]])await assert.rejects(store.save({...base,clickSoundEnabled:value}));
    assert.equal((await store.read()).clickSoundEnabled,true,'invalid input cannot overwrite saved preferences');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('sound volume persists from zero to full volume and rejects out-of-range or nonnumeric input',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'codi-click-volume-'));
  try{const store=new PanelPreferencesStore(root),base=model.defaults();
    for(const clickSoundVolume of [0,25,100]){await store.save({...base,clickSoundVolume});assert.equal((await new PanelPreferencesStore(root).read()).clickSoundVolume,clickSoundVolume);}
    for(const clickSoundVolume of [-1,101,2.5,'25',null,NaN])await assert.rejects(store.save({...base,clickSoundVolume}));
    const h=await mainHarness();assert.equal(h.hasHandler('panel-sound-volume'),true);
    for(const value of [-1,101,'25',null])assert.equal((await h.ipc('panel-sound-volume',value)).ok,false);
    assert.equal((await h.ipc('panel-sound-volume',25)).ok,true);
    assert.equal((await h.ipc('panel-preferences-read')).clickSoundVolume,25);
    assert.equal(JSON.parse(h.writes.filter(w=>w.file==='panel-preferences.json').at(-1).value).clickSoundVolume,25);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('click sound IPC rejects invalid senders and values before saving or broadcasting',async()=>{
  const h=await mainHarness();assert.equal(h.hasHandler('panel-click-sound'),true);
  for(const value of [undefined,null,0,1,'false',{},[]])assert.equal((await h.ipc('panel-click-sound',value))?.ok,false);
  h.run('globalThis.originalContents=win.webContents;win.webContents={};');
  assert.equal((await h.ipc('panel-click-sound',false))?.ok,false);
  h.run('win.webContents=globalThis.originalContents;');
  assert.equal(h.writes.length,0);assert.equal(h.layouts.length,0);
});

test('click sound saves, broadcasts and restores without changing other settings',async()=>{
  const base={width:620,height:700,language:'en-US',dockBottomRight:false,widgetEnabled:true},h=await mainHarness(undefined,{savedPanel:base});
  assert.equal((await h.ipc('panel-click-sound',false))?.ok,true);
  const saved=JSON.parse(h.writes.find(w=>w.file==='panel-preferences.json').value);
  assert.deepEqual(saved,{...base,clickSoundEnabled:false});
  assert.equal(h.layouts.at(-1).value.panelPreferences.clickSoundEnabled,false);
  const restart=await mainHarness(undefined,{savedPanel:saved});
  assert.equal((await restart.ipc('panel-preferences-read')).clickSoundEnabled,false);
  assert.equal((await restart.ipc('panel-click-sound',true))?.ok,true);
  assert.equal(restart.layouts.at(-1).value.panelPreferences.clickSoundEnabled,true);
});

test('a pending click sound save preserves concurrent language changes and its persisted choice',async()=>{
  const h=await mainHarness();assert.equal(h.hasHandler('panel-click-sound'),true);
  h.run('globalThis.originalSave=panelStore.save.bind(panelStore);globalThis.releaseSound=null;panelStore.save=value=>{const saved=originalSave(value);return value.language==="zh-CN"?new Promise(resolve=>{globalThis.releaseSound=()=>saved.then(resolve);}):saved;};');
  const pending=h.ipc('panel-click-sound',false);
  await Promise.resolve();
  assert.equal((await h.ipc('panel-language','en-US')).ok,true);
  const languageSave=JSON.parse(h.writes.filter(w=>w.file==='panel-preferences.json').at(-1).value);
  assert.equal(languageSave.clickSoundEnabled,false,'concurrent preference snapshots include the sound choice');
  h.run('globalThis.releaseSound();');await pending;
  assert.equal((await h.ipc('panel-preferences-read')).language,'en-US');
  assert.equal((await h.ipc('panel-preferences-read')).clickSoundEnabled,false);
});

test('failed click sound saves restore the previous setting and report the failure',async()=>{
  const h=await mainHarness();assert.equal(h.hasHandler('panel-click-sound'),true);
  h.run('panelStore.save=async()=>{throw Error("read-only");};');
  const result=await h.ipc('panel-click-sound',false);
  assert.equal(result.ok,false);assert.ok(result.error);
  assert.equal((await h.ipc('panel-preferences-read')).clickSoundEnabled!==false,true);
  assert.equal(h.layouts.at(-1).value.panelPreferences.clickSoundEnabled!==false,true);
});

test('overlapping dock, power and sound saves preserve all choices and later language and size edits',async()=>{
  for(const first of ['panel-dock','widget-enabled']){
    const h=await mainHarness(undefined,{savedPanel:{width:480,height:560,language:'zh-CN',dockBottomRight:false,widgetEnabled:true}});
    h.run('globalThis.originalSave=panelStore.save.bind(panelStore);globalThis.releaseFirst=null;let first=true;panelStore.save=value=>{const saved=originalSave(value);if(!first)return saved;first=false;return new Promise(resolve=>{globalThis.releaseFirst=()=>saved.then(resolve);});};');
    const pending=h.ipc(first,first==='panel-dock');await Promise.resolve();
    const other=h.ipc(first==='panel-dock'?'widget-enabled':'panel-dock',first!=='panel-dock'),sound=h.ipc('panel-click-sound',false),volume=h.ipc('panel-sound-volume',25);
    await h.ipc('panel-language','en-US');
    h.ipc('open-settings');h.ipc('panel-resize',{type:'begin'});h.ipc('panel-resize',{type:'update',width:620,height:700});h.ipc('panel-resize',{type:'end'});
    h.run('globalThis.releaseFirst();');
    for(const result of await Promise.all([pending,other,sound,volume]))assert.equal(result.ok,true);
    const expected={width:620,height:700,language:'en-US',dockBottomRight:true,widgetEnabled:false,clickSoundEnabled:false,clickSoundVolume:25};
    assert.deepEqual(JSON.parse(JSON.stringify(await h.ipc('panel-preferences-read'))),expected);
    assert.deepEqual(JSON.parse(h.writes.filter(w=>w.file==='panel-preferences.json').at(-1).value),expected);
  }
});

test('a failed boolean save does not poison queued sound and docking saves',async()=>{
  const h=await mainHarness(undefined,{savedPanel:{width:480,height:560,language:'zh-CN',dockBottomRight:false,widgetEnabled:true}});
  h.run('globalThis.originalSave=panelStore.save.bind(panelStore);globalThis.rejectFirst=null;let first=true;panelStore.save=value=>{if(!first)return originalSave(value);first=false;return new Promise((_resolve,reject)=>{globalThis.rejectFirst=()=>reject(Error("read-only"));});};');
  const power=h.ipc('widget-enabled',false);await Promise.resolve();
  const sound=h.ipc('panel-click-sound',false),dock=h.ipc('panel-dock',true);
  h.run('globalThis.rejectFirst();');
  assert.equal((await power).ok,false);assert.equal((await sound).ok,true);assert.equal((await dock).ok,true);
  const expected={width:480,height:560,language:'zh-CN',dockBottomRight:true,widgetEnabled:true,clickSoundEnabled:false};
  assert.deepEqual(JSON.parse(JSON.stringify(await h.ipc('panel-preferences-read'))),expected);
  assert.deepEqual(JSON.parse(h.writes.filter(w=>w.file==='panel-preferences.json').at(-1).value),expected);
});

test('click sound control loads saved state, sends changes and recovers after save errors',async()=>{
  const elements=new Map(),layouts=[],calls=[];let finishSave,finishRead;
  const get=id=>{if(!elements.has(id))elements.set(id,{checked:true,disabled:false,dataset:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},querySelectorAll(){return [];},setAttribute(){}});return elements.get(id);};
  const window={panelModel:model,uiText:{setLanguage(){},t:v=>v,apply(){}},widget:{layout:fn=>layouts.push(fn),panelError(){},panelPreferencesRead:()=>new Promise(resolve=>finishRead=resolve),panelClickSound:value=>{calls.push(value);return new Promise(resolve=>finishSave=resolve);}}};
  vm.runInNewContext(await fs.readFile(path.join(__dirname,'../desktop/ui/panel-settings.js'),'utf8'),{window,document:{getElementById:get}});
  const sound=get('click-sound-enabled');
  finishRead({width:480,height:560,language:'zh-CN',clickSoundEnabled:false});await Promise.resolve();
  assert.equal(sound.checked,false);
  sound.checked=true;assert.equal(typeof sound.listeners.change,'function');const save=sound.listeners.change();
  assert.equal(sound.disabled,true);assert.deepEqual(calls,[true]);finishSave({ok:false,error:'save failed'});await save;
  assert.equal(sound.checked,false);assert.equal(sound.disabled,false);assert.equal(get('panel-error').textContent,'save failed');
  for(const fn of layouts)fn({panelPreferences:{width:480,height:560,language:'zh-CN'}});
  assert.equal(sound.checked,true,'an older preference format defaults to enabled');
});
