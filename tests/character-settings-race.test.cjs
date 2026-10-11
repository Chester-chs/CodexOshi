const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('an older settings acknowledgement cannot overwrite a newer local dimension edit',async()=>{
  const elements=new Map(),calls=[],sizes=[],timers=new Map(),resolvers=[];let listener,next=0;
  const element=()=>({value:'',dataset:{},disabled:false,append(){},replaceChildren(){},setAttribute(){}});
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const settings={zoom:1,x:0,y:0,background:true,targetHeight:300,targetWidth:200};
  const send=width=>listener({active:'sample',characters:[{name:'sample',settings:{...settings,targetWidth:width},image:'sample.png'}]});
  const document={activeElement:null,getElementById:get,createElement:element};
  const window={addEventListener(){},uiText:{t:v=>v,language:'zh-CN'},portraitGeometry:require('../desktop/ui/portrait-size.js'),widget:{ready(){},characters:fn=>listener=fn,characterSize:value=>sizes.push({...value}),characterAction:value=>{calls.push(structuredClone(value));return new Promise(resolve=>resolvers.push(resolve));}}};
  const context={document,window,characterView:{characterView:role=>({url:'character://sample',settings:role?.settings||settings})},LocalImagePlayer:class{resize(){}frame(){}load(){}},setTimeout:fn=>{const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/ui/character-settings.js'),'utf8'),context);
  const flushTimer=()=>{const [id,fn]=[...timers][0];timers.delete(id);fn();};
  send(200);get('character-width').value='360';get('character-width').oninput();flushTimer();assert.equal(calls[0].patch.targetWidth,360);
  get('character-width').value='240';get('character-width').oninput();send(360);
  assert.equal(Number(get('character-width').value),240);assert.equal(sizes.at(-1).targetWidth,240);
  resolvers[0]({ok:true});await new Promise(resolve=>setImmediate(resolve));send(360);assert.equal(Number(get('character-width').value),240);
  flushTimer();assert.equal(calls[1].patch.targetWidth,240);send(240);resolvers[1]({ok:true});await new Promise(resolve=>setImmediate(resolve));
  send(280);assert.equal(Number(get('character-width').value),280,'a fresh external snapshot is accepted once the latest edit is saved');
});
