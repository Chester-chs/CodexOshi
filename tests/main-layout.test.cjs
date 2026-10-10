const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
test('real main relayout saves viewport-clamped position instead of retaining an out-of-bounds file',()=>{
  const filename=path.resolve(__dirname,'../desktop/main.cjs'),localRequire=createRequire(filename),writes=new Map();
  // Do not start app/network/worker lifecycles: exercise the real relayout body.
  const electron={app:{setPath(){},disableHardwareAcceleration(){},commandLine:{appendSwitch(){}},whenReady(){return {then(){}};},on(){}},protocol:{registerSchemesAsPrivileged(){}}};
  const context=vm.createContext({process:{argv:['node','main','--data','C:/widget-test-data']},Buffer,console,setInterval,clearInterval,setTimeout,clearTimeout,require:name=>{
    if(name==='electron')return electron;
    if(name==='node:fs')return {readFileSync(){throw Error('No saved quota');},writeFileSync(file,value){writes.set(path.basename(file),value);}};
    if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[]};}}};
    if(name==='./characters.cjs')return {installCharacters(){}};
    return localRequire(name);
  }});
  const source=process.env.WIDGET_LAYOUT_BASELINE?require('node:child_process').execFileSync('git',['show','78122d3:desktop/main.cjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}):fs.readFileSync(filename,'utf8');
  vm.runInContext(source,context,{filename});context.testWindow={setShape(){},webContents:{send(){}}};
  vm.runInContext(`win=testWindow;ready=true;host={attached:true,bounds:{width:800,height:600}};dip={width:800,height:600};widget={x:900,y:700};if(typeof defaultPlacement!=='undefined')defaultPlacement=false;characterSize={width:199,height:280};updateShape();`,context);
  assert.ok(writes.has('position.json'),'viewport clamping must update persisted position');assert.deepEqual(JSON.parse(writes.get('position.json')),{x:577,y:296});
});
