const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function fixture(){
  const elements=new Map(),layouts=[],volumes=[];let finishSave;
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'100',disabled:false,hidden:false,dataset:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});return elements.get(id);};
  const window={clickSoundPlayer:{setSource(){},setVolume:value=>volumes.push(value)},uiText:{t:value=>value},addEventListener(){},widget:{soundState(){},soundRead:async()=>({custom:null}),layout:fn=>layouts.push(fn),panelPreferencesRead:async()=>({clickSoundVolume:100}),panelSoundVolume:()=>new Promise(resolve=>finishSave=resolve)}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/ui/sound-settings.js'),'utf8'),{window,document:{getElementById:get}});await Promise.resolve();
  return {get,layouts,volumes,finish:result=>finishSave(result)};
}
test('clearing a volume number keeps the field editable across layout refreshes',async()=>{
  const f=await fixture(),number=f.get('sound-volume-value');number.value='';number.listeners.input();
  for(const layout of f.layouts)layout({panelPreferences:{clickSoundVolume:100}});
  assert.equal(number.value,'');assert.equal(f.volumes.at(-1),100);
});
test('an invalid edit while saving reconciles the completed saved volume without losing its warning',async()=>{
  const f=await fixture(),number=f.get('sound-volume-value');number.value='25';number.listeners.input();const save=number.listeners.change();
  number.value='';number.listeners.input();await number.listeners.change();assert.equal(number.value,'100');
  f.finish({ok:true});await save;
  assert.equal(number.value,'25');assert.equal(f.get('sound-volume').value,'25');assert.equal(f.volumes.at(-1),25);assert.equal(f.get('sound-message').textContent,'音量需为 0–100%。');
});
