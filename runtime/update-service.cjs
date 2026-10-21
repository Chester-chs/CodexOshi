const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const BUSY=new Set(['preparing','downloading','installing','restarting']);
const ERRORS=new Set(['network_error','authentication_required','invalid_release','archive_unsafe','download_too_large','prepare_failed','install_failed','rollback_failed','unsupported_installation','update_in_progress','no_update']);
const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch{return false;}}
function sameDependencies(a,b){
  const normalize=value=>{const copy=structuredClone(value);delete copy.version;if(copy.packages?.[''])delete copy.packages[''].version;return JSON.stringify(copy);};
  return !!a&&!!b&&normalize(a)===normalize(b);
}
function fail(code){return Object.assign(Error(code),{code});}
async function findInstallNode(data,execute){
  const bundled=path.join(data,'node-runtime','node.exe');
  const hasNpm=node=>fs.existsSync(node)&&fs.existsSync(path.join(path.dirname(node),'node_modules/npm/bin/npm-cli.js'));
  if(hasNpm(bundled))return bundled;
  const paths=(await execute('where.exe',['node.exe'],{windowsHide:true,timeout:10000})).stdout.trim().split(/\r?\n/);
  return paths.find(hasNpm);
}
async function prepareRuntime({data,jobDir,appRoot,signal,execute=promisify(execFile)}){
  const current=path.join(data,'desktop-runtime'),electron='node_modules/electron/dist/electron.exe';
  const candidateLock=read(path.join(appRoot,'package-lock.json'));
  if(!candidateLock)throw fail('invalid_release');
  if(sameDependencies(candidateLock,read(path.join(current,'package-lock.json')))&&fs.existsSync(path.join(current,electron)))return null;
  const node=await findInstallNode(data,execute);
  if(!node)throw fail('prepare_failed');
  const major=Number((await execute(node,['-p','process.versions.node.split(".")[0]'],{windowsHide:true,timeout:10000,signal})).stdout.trim());
  if(major<24||!Number.isFinite(major))throw fail('prepare_failed');
  const runtime=path.join(jobDir,'runtime');await fsp.mkdir(runtime);
  for(const file of ['package.json','package-lock.json'])await fsp.copyFile(path.join(appRoot,file),path.join(runtime,file));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await execute(node,[path.join(path.dirname(node),'node_modules/npm/bin/npm-cli.js'),'--prefix',runtime,'--cache',path.join(data,'npm-cache'),'ci','--ignore-scripts','--no-audit','--no-fund'],{windowsHide:true,timeout:300000,maxBuffer:2*1024*1024,signal,env});
  await execute(node,[path.join(runtime,'node_modules/electron/install.js')],{windowsHide:true,timeout:300000,maxBuffer:1024*1024,signal,env});
  if(!fs.existsSync(path.join(runtime,electron)))throw fail('prepare_failed');
  return runtime;
}
class UpdateService {
  constructor(options){
    this.options=options;this.data=path.resolve(options.data);this.file=path.join(this.data,'update-state.json');this.task=null;this.controller=new AbortController();
    this.state=read(this.file)||{status:'idle',updatedAt:0};
    if(BUSY.has(this.state.status)&&!alive(this.state.ownerPid)&&!fs.existsSync(path.join(this.data,'update-pending.json'))){try{this.set({status:'failed',error:['preparing','downloading'].includes(this.state.status)?'prepare_failed':'install_failed'});}catch{}}
  }
  snapshot(){
    // The native worker writes the same state while it restarts the desktop process.
    const saved=read(this.file),state=saved&&(!this.stateWriteFailed||saved.updatedAt>this.state.updatedAt)?saved:this.state;
    return {status:BUSY.has(state.status)||['complete','failed'].includes(state.status)?state.status:'idle',...(typeof state.version==='string'?{version:state.version}:{}),...(ERRORS.has(state.error)?{error:state.error}:{}),updatedAt:Number(state.updatedAt)||0};
  }
  recover(){
    // If the native worker dies after starting this UI, let the launcher replay
    // its journal. Otherwise the UI would remain on "restarting" until next login.
    const state=read(this.file),pending=read(path.join(this.data,'update-pending.json'));
    const recoverable=BUSY.has(state?.status)||state?.status==='complete'||(state?.status==='failed'&&state.error==='install_failed');
    if(this.recoveryRequested||this.task||!recoverable||alive(state.ownerPid)||!pending?.jobDir)return;
    const launcher=read(path.join(this.data,'launcher-state.json'));
    if(launcher?.updateHandoff!==1||!alive(launcher.pid))return;
    if(path.dirname(path.resolve(pending.jobDir))!==path.join(this.data,'updates'))return;
    try{fs.writeFileSync(path.join(this.data,'stop.request'),'update');this.recoveryRequested=true;}
    catch{try{this.set({status:'failed',error:'install_failed',version:state.version});}catch{}}
  }
  set(value){
    this.state={...value,ownerPid:process.pid,updatedAt:Date.now()};
    try{atomic(this.file,this.state);this.stateWriteFailed=false;}
    catch(error){this.state={...this.state,status:'failed',error:'prepare_failed'};this.stateWriteFailed=true;throw error;}
    finally{this.options.onChange?.(this.snapshot());}
  }
  start(){
    if(this.controller.signal.aborted)return {ok:false,error:'prepare_failed'};
    this.recover();
    if(this.task||BUSY.has(this.snapshot().status)||fs.existsSync(path.join(this.data,'update-pending.json')))return {ok:false,error:'update_in_progress',state:this.snapshot()};
    try{this.set({status:'preparing'});}catch{return {ok:false,error:'prepare_failed'};}
    this.task=this.run().catch(()=>{}).finally(()=>{this.task=null;});
    return {ok:true,state:this.snapshot()};
  }
  async run(){
    let jobDir,handedOff=false;
    try{
      const receipt=read(path.join(this.data,'installation.json')),launcher=read(path.join(this.data,'launcher-state.json'));
      if((this.options.platform||process.platform)!=='win32'||!receipt||!/^[-\w]+$/.test(receipt.marketplace)||!path.isAbsolute(receipt.sourceRoot||'')||launcher?.updateHandoff!==1||!alive(launcher.pid))throw fail('unsupported_installation');
      const cache=path.join(path.dirname(this.data),'plugins/cache',receipt.marketplace,'codex-quota-widget/0.1.0');
      const roots=[receipt.sourceRoot,cache];if(receipt.activeRoot&&path.resolve(receipt.activeRoot).startsWith(path.join(this.data,'releases')+path.sep))roots.push(receipt.activeRoot);
      if(!roots.some(root=>path.resolve(launcher.script||'').toLowerCase()===path.join(root,'desktop/supervisor.ps1').toLowerCase()))throw fail('unsupported_installation');
      jobDir=path.join(this.data,'updates',crypto.randomUUID());await fsp.mkdir(jobDir,{recursive:true});
      this.set({status:'downloading'});
      const prepare=this.options.prepareRelease||require('./update-download.cjs').prepareRelease;
      const release=await prepare({jobDir,currentVersion:this.options.currentVersion,signal:this.controller.signal});
      this.set({status:'preparing',version:release.version});
      const runtimeRoot=await (this.options.prepareRuntime||prepareRuntime)({data:this.data,jobDir,appRoot:release.appRoot,signal:this.controller.signal});
      this.controller.signal.throwIfAborted();
      // A user may close the host during download; only hand off to the exact original launcher.
      const latestLauncher=read(path.join(this.data,'launcher-state.json'));
      if(latestLauncher?.pid!==launcher.pid||!alive(launcher.pid))throw fail('prepare_failed');
      atomic(path.join(jobDir,'plan.json'),{version:release.version,commit:release.commit,previousVersion:this.options.currentVersion,previousAppRoot:path.dirname(path.dirname(launcher.script)),appRoot:release.appRoot,runtimeRoot,cacheRoot:fs.existsSync(cache)?cache:null,oldLauncherPid:launcher.pid});
      this.set({status:'installing',version:release.version});
      atomic(path.join(this.data,'update-request.json'),{jobDir});
      fs.writeFileSync(path.join(this.data,'stop.request'),'update');handedOff=true;
    }catch(error){
      this.set({status:'failed',error:ERRORS.has(error.code)?error.code:'prepare_failed',...(this.state.version?{version:this.state.version}:{})});
    }finally{
      if(jobDir&&!handedOff){
        const request=path.join(this.data,'update-request.json');
        if(read(request)?.jobDir===jobDir)await fsp.unlink(request).catch(()=>{});
        // Never remove user data: this path is generated here, beneath the dedicated updates directory.
        const parent=path.join(this.data,'updates');
        if(path.dirname(jobDir)===parent)await fsp.rm(jobDir,{recursive:true,force:true}).catch(()=>{});
      }
    }
  }
  close(){this.controller.abort();}
}
module.exports={UpdateService,prepareRuntime,sameDependencies,findInstallNode};
