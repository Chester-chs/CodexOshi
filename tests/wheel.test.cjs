const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
// Exercise actual main routing without starting its app, network or Workers.
const filename=path.resolve(__dirname,'../desktop/main.cjs'),localRequire=createRequire(filename);
const context=vm.createContext({process:{argv:['node','main','--data','C:/wheel-fixture']},Buffer,console,require:name=>{
  if(name==='electron')return {app:{setPath(){},disableHardwareAcceleration(){},commandLine:{appendSwitch(){}},whenReady(){return {then(){}};},on(){}},protocol:{registerSchemesAsPrivileged(){}}};
  if(name==='node:fs')return {readFileSync(){throw Error('No quota');}};
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}}};
  if(name==='./characters.cjs')return {installCharacters(){}};return localRequire(name);
}});
vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename});
test('native wheel coordinates scale from physical client pixels and preserve wheel units without activation',()=>{
  assert.equal(vm.runInContext('typeof wheelInput',context),'function','main needs a bounded wheel input route');
  context.args=[{x:300,y:450,delta:-120,shift:true,control:false},{dpi:144},[{x:180,y:280,width:100,height:100}]];
  const event=vm.runInContext('wheelInput(...args)',context);
  assert.deepEqual(JSON.parse(JSON.stringify(event)),{type:'mouseWheel',x:200,y:300,deltaX:0,deltaY:-120,wheelTicksY:-1,modifiers:['shift'],canScroll:true});
});
test('wheel route rejects invalid metadata and points outside the current shape',()=>{
  assert.equal(vm.runInContext('typeof wheelInput',context),'function');
  const host={dpi:144},region=[{x:100,y:100,width:100,height:100}];
  for(const wheel of [null,{}, {x:150,y:150,delta:Infinity},{x:-1,y:150,delta:120},{x:40000,y:150,delta:120},{x:300,y:300,delta:120},{x:149,y:150,delta:120},{x:150,y:150,delta:32768}]){
    context.args=[wheel,host,region];assert.equal(vm.runInContext('wheelInput(...args)',context),null);
  }
  context.args=[{x:150,y:150,delta:120},{dpi:0},region];assert.equal(vm.runInContext('wheelInput(...args)',context),null);
});
