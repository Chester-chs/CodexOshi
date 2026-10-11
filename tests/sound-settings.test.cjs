const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function fixture(initial={custom:null,preset:'sparkle',source:'preset'}){
  const elements=new Map(),layouts=[],volumes=[],previews=[],sources=[],selections=[];let finishSave,finishSelection,receiveSound;
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'100',disabled:false,hidden:false,dataset:{},attributes:{},listeners:{},setAttribute(key,value){this.attributes[key]=value;},addEventListener(name,fn){this.listeners[name]=fn;}});return elements.get(id);};
  const window={clickSoundPlayer:{setSource:value=>sources.push(value),setVolume:value=>volumes.push(value),play:async()=>{previews.push('current');return true;}},uiText:{t:value=>value},addEventListener(){},widget:{soundState:fn=>receiveSound=fn,soundRead:async()=>initial,soundSelect:id=>{selections.push(id);return new Promise(resolve=>finishSelection=resolve);},layout:fn=>layouts.push(fn),panelPreferencesRead:async()=>({clickSoundVolume:100}),panelSoundVolume:()=>new Promise(resolve=>finishSave=resolve)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/ui/sound-settings.js'),'utf8'),{window,document:{getElementById:get}});await Promise.resolve();
  return {get,layouts,volumes,previews,sources,selections,receiveSound:value=>receiveSound(value),finish:result=>finishSave(result),finishSelection:result=>finishSelection(result)};
}
test('clearing a volume number keeps the field editable across layout refreshes',async()=>{
  const f=await fixture(),number=f.get('sound-volume-value');number.value='';number.listeners.input();
  for(const layout of f.layouts)layout({panelPreferences:{clickSoundVolume:100}});
  assert.equal(number.value,'');assert.equal(f.volumes.at(-1),100);
});

test('the sole default is starlight, preview never saves and old selection metadata cannot change it',async()=>{
  const f=await fixture({custom:null,preset:'wood',source:'preset'});await f.get('sound-preview').listeners.click();
  assert.deepEqual(f.previews,['current']);assert.deepEqual(f.selections,[]);assert.equal(f.sources.at(-1),null);
  assert.equal(f.get('sound-filename').textContent,'星光双音');assert.equal(f.get('sound-builtin-select').hidden,true);
});

test('switching to the default retains custom audio and changes playback only after a successful save',async()=>{
  const custom={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'mine.wav',url:'sound://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
  const f=await fixture({custom,preset:'sparkle',source:'custom'});assert.equal(f.get('sound-builtin-select').hidden,false);
  const save=f.get('sound-builtin-select').listeners.click();assert.equal(f.get('sound-builtin-select').disabled,true);
  await f.get('sound-builtin-select').listeners.click();assert.deepEqual(f.selections,['builtin']);assert.equal(f.sources.at(-1),custom.url);
  f.finishSelection({ok:false,error:'save failed'});await save;assert.equal(f.sources.at(-1),custom.url);
  const retry=f.get('sound-builtin-select').listeners.click();f.finishSelection({ok:true,state:{custom,preset:'sparkle',source:'preset'}});await retry;
  assert.equal(f.sources.at(-1),null);assert.equal(f.get('sound-filename').textContent,'星光双音');assert.equal(f.get('sound-custom-select').hidden,false);assert.equal(f.get('sound-builtin-select').hidden,true);
});

test('retained upload stays selectable while the default is active; muted preview controls are disabled',async()=>{
  const custom={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'mine.wav',url:'sound://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
  const f=await fixture({custom,preset:'bell',source:'preset'});assert.equal(f.sources.at(-1),null);assert.equal(f.get('sound-custom-select').hidden,false);
  const save=f.get('sound-custom-select').listeners.click();f.finishSelection({ok:true,state:{custom,preset:'sparkle',source:'custom'}});await save;assert.equal(f.sources.at(-1),custom.url);assert.equal(f.get('sound-filename').textContent,'mine.wav');
  for(const layout of f.layouts)layout({panelPreferences:{clickSoundEnabled:false,clickSoundVolume:100}});
  assert.equal(f.get('sound-preview').disabled,true);await f.get('sound-preview').listeners.click();assert.deepEqual(f.previews,[]);
});
test('an invalid edit while saving reconciles the completed saved volume without losing its warning',async()=>{
  const f=await fixture(),number=f.get('sound-volume-value');number.value='25';number.listeners.input();const save=number.listeners.change();
  number.value='';number.listeners.input();await number.listeners.change();assert.equal(number.value,'100');
  f.finish({ok:true});await save;
  assert.equal(number.value,'25');assert.equal(f.get('sound-volume').value,'25');assert.equal(f.volumes.at(-1),25);assert.equal(f.get('sound-message').textContent,'音量需为 0–100%。');
});
