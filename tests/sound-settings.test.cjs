const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function fixture(initial={custom:null,preset:'wood',source:'preset'}){
  const elements=new Map(),layouts=[],volumes=[],previews=[],presets=[],sources=[],selections=[];let finishSave,finishPreset,receiveSound;
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'100',disabled:false,hidden:false,dataset:{},attributes:{},listeners:{},setAttribute(key,value){this.attributes[key]=value;},addEventListener(name,fn){this.listeners[name]=fn;}});return elements.get(id);};
  const PRESETS=[{id:'wood',label:'木琴轻点'},{id:'bubble',label:'水滴啵啵'},{id:'bell',label:'清透铃音'},{id:'sparkle',label:'星光双音'},{id:'tap',label:'柔和轻敲'}];
  const window={codiSound:{PRESETS,DEFAULT_PRESET:'wood',isPreset:id=>PRESETS.some(p=>p.id===id)},clickSoundPlayer:{setSource:value=>sources.push(value),setPreset:value=>presets.push(value),setVolume:value=>volumes.push(value),previewPreset:async value=>{previews.push(value);return true;},play:async()=>true},uiText:{t:value=>value},addEventListener(){},widget:{soundState:fn=>receiveSound=fn,soundRead:async()=>initial,soundPreset:id=>{selections.push(id);return new Promise(resolve=>finishPreset=resolve);},soundSelect:async id=>({ok:true,state:{...initial,source:'custom'}}),layout:fn=>layouts.push(fn),panelPreferencesRead:async()=>({clickSoundVolume:100}),panelSoundVolume:()=>new Promise(resolve=>finishSave=resolve)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/ui/sound-settings.js'),'utf8'),{window,document:{getElementById:get}});await Promise.resolve();
  return {get,layouts,volumes,previews,presets,sources,selections,receiveSound:value=>receiveSound(value),finish:result=>finishSave(result),finishPreset:result=>finishPreset(result)};
}
test('clearing a volume number keeps the field editable across layout refreshes',async()=>{
  const f=await fixture(),number=f.get('sound-volume-value');number.value='';number.listeners.input();
  for(const layout of f.layouts)layout({panelPreferences:{clickSoundVolume:100}});
  assert.equal(number.value,'');assert.equal(f.volumes.at(-1),100);
});

test('previewing another preset keeps the selected sound and never saves a selection',async()=>{
  const f=await fixture();await f.get('sound-preview-bell').listeners.click();
  assert.deepEqual(f.previews,['bell']);assert.deepEqual(f.selections,[]);assert.equal(f.presets.at(-1),'wood');
  assert.equal(f.get('sound-preset-wood').attributes['aria-pressed'],'true');
});

test('preset selection waits for persistence, blocks repeat changes and preserves selection on failure',async()=>{
  const f=await fixture();const save=f.get('sound-preset-bubble').listeners.click();
  assert.equal(f.get('sound-preset-wood').disabled,true);assert.equal(f.presets.at(-1),'wood');
  await f.get('sound-preset-tap').listeners.click();assert.deepEqual(f.selections,['bubble']);
  f.finishPreset({ok:false,error:'save failed'});await save;assert.equal(f.presets.at(-1),'wood');assert.equal(f.get('sound-preset-wood').disabled,false);
  const retry=f.get('sound-preset-bubble').listeners.click();f.finishPreset({ok:true,state:{custom:null,preset:'bubble',source:'preset'}});await retry;
  assert.equal(f.presets.at(-1),'bubble');assert.equal(f.get('sound-preset-bubble').attributes['aria-pressed'],'true');assert.equal(f.get('sound-filename').textContent,'水滴啵啵');
});

test('retained upload stays selectable while a preset is active; muted preview controls are disabled',async()=>{
  const custom={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'mine.wav',url:'sound://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
  const f=await fixture({custom,preset:'bell',source:'preset'});assert.equal(f.sources.at(-1),null);assert.equal(f.get('sound-custom-select').hidden,false);
  await f.get('sound-custom-select').listeners.click();assert.equal(f.sources.at(-1),custom.url);assert.equal(f.get('sound-filename').textContent,'mine.wav');
  for(const layout of f.layouts)layout({panelPreferences:{clickSoundEnabled:false,clickSoundVolume:100}});
  assert.equal(f.get('sound-preview-bell').disabled,true);await f.get('sound-preview-bell').listeners.click();assert.deepEqual(f.previews,[]);
});
test('an invalid edit while saving reconciles the completed saved volume without losing its warning',async()=>{
  const f=await fixture(),number=f.get('sound-volume-value');number.value='25';number.listeners.input();const save=number.listeners.change();
  number.value='';number.listeners.input();await number.listeners.change();assert.equal(number.value,'100');
  f.finish({ok:true});await save;
  assert.equal(number.value,'25');assert.equal(f.get('sound-volume').value,'25');assert.equal(f.volumes.at(-1),25);assert.equal(f.get('sound-message').textContent,'音量需为 0–100%。');
});
