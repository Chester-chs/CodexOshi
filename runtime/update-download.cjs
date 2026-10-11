const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const childProcess=require('node:child_process');
const {promisify}=require('node:util');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {compareVersions,publishedVersion}=require('./public-news.cjs');

const REPOSITORY='Chester-chs/Codi';
const API=`https://api.github.com/repos/${REPOSITORY}`;
const DOWNLOAD_LIMIT=128*1024*1024, METADATA_LIMIT=2*1024*1024, DOWNLOAD_TIMEOUT=120000;
const execFile=promisify(childProcess.execFile);
const MESSAGES={
  network_error:'The update could not be downloaded.',
  authentication_required:'GitHub CLI access to the Codi repository is required.',
  invalid_release:'The release metadata or application files are invalid.',
  archive_unsafe:'The release archive failed safety validation.',
  download_too_large:'The release archive exceeds the download size limit.',
  no_update:'No newer Codi version is available.'
};
function failure(code){return Object.assign(new Error(MESSAGES[code]),{code});}
function scopedSignal(signal,timeout){return signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);}
function checkAborted(signal){if(signal?.aborted)throw failure('network_error');}
function parseJson(raw){try{return JSON.parse(raw);}catch{throw failure('invalid_release');}}

// Every URL is constructed here. Redirects cannot change the repository, commit,
// protocol or endpoint, even when another URL happens to use a GitHub hostname.
async function requestPinned(url,allowed,options,signal){
  for(let hops=0;;hops++){
    if(!allowed.has(url))throw failure('invalid_release');
    checkAborted(signal);
    let response;
    try{response=await (options.fetch||globalThis.fetch)(url,{
      method:'GET',redirect:'manual',credentials:'omit',signal,
      headers:{'User-Agent':'Codi','Accept':'application/vnd.github+json'}
    });}catch{throw failure('network_error');}
    if(response.redirected||(response.url&&response.url!==url)){
      await response.body?.cancel().catch(()=>{});throw failure('invalid_release');
    }
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      await response.body?.cancel().catch(()=>{});
      if(hops>=3)throw failure('network_error');
      let next;try{next=new URL(location,url);}catch{throw failure('invalid_release');}
      if(!location||next.username||next.password||next.hash||!allowed.has(next.href))throw failure('invalid_release');
      url=next.href;continue;
    }
    return response;
  }
}
async function readBody(response,limit,oversize,consume){
  const declared=response.headers.get('content-length');
  if(declared&&/^\d+$/.test(declared)&&BigInt(declared)>BigInt(limit)){
    await response.body?.cancel().catch(()=>{});throw failure(oversize);
  }
  if(!response.body)throw failure('network_error');
  const reader=response.body.getReader();let size=0;
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>limit)throw failure(oversize);
      await consume(Buffer.from(value));
    }
  }catch(error){throw error.code in MESSAGES?error:failure('network_error');}
  finally{await reader.cancel().catch(()=>{});}
}
async function readMetadata(endpoint,options){
  const url=`https://api.github.com/${endpoint}`,signal=scopedSignal(options.signal,15000);
  const response=await requestPinned(url,new Set([url]),options,signal);
  if(response.status===401||response.status===404){
    await response.body?.cancel().catch(()=>{});
    let result;
    try{
      result=await (options.execFile||execFile)('gh',['api',endpoint,'--hostname','github.com'],{
        shell:false,windowsHide:true,timeout:15000,maxBuffer:METADATA_LIMIT,signal
      });
    }catch{throw failure(signal.aborted?'network_error':'authentication_required');}
    if(typeof result.stdout!=='string'&&!Buffer.isBuffer(result.stdout))throw failure('invalid_release');
    if(Buffer.byteLength(result.stdout)>METADATA_LIMIT)throw failure('invalid_release');
    return parseJson(result.stdout.toString());
  }
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw failure('network_error');}
  const chunks=[];await readBody(response,METADATA_LIMIT,'invalid_release',chunk=>chunks.push(chunk));
  return parseJson(Buffer.concat(chunks).toString('utf8'));
}
async function downloadPrivate(commit,archivePath,options,signal,limit){
  let child;
  try{
    child=(options.spawn||childProcess.spawn)('gh',['api',`repos/${REPOSITORY}/zipball/${commit}`,'--hostname','github.com'],{
      shell:false,windowsHide:true,stdio:['ignore','pipe','ignore'],signal
    });
  }catch{throw failure(signal.aborted?'network_error':'authentication_required');}
  const exited=new Promise((resolve,reject)=>{
    child.once('error',()=>reject(failure(signal.aborted?'network_error':'authentication_required')));
    child.once('close',code=>code===0?resolve():reject(failure(signal.aborted?'network_error':'authentication_required')));
  });
  // Consume rejection immediately while pipeline is starting, then await both.
  exited.catch(()=>{});
  let size=0;
  const bounded=new Transform({transform(chunk,encoding,callback){
    size+=chunk.length;callback(size>limit?failure('download_too_large'):null,chunk);
  }});
  try{
    await Promise.all([pipeline(child.stdout,bounded,fs.createWriteStream(archivePath,{flags:'wx'}),{signal}),exited]);
  }catch(error){
    child.kill();await exited.catch(()=>{});
    throw error.code in MESSAGES?error:failure('network_error');
  }
}
async function downloadArchive(commit,archivePath,options){
  const limit=Math.min(DOWNLOAD_LIMIT,options.maxDownloadBytes??DOWNLOAD_LIMIT);
  if(!Number.isSafeInteger(limit)||limit<1)throw failure('invalid_release');
  const signal=scopedSignal(options.signal,DOWNLOAD_TIMEOUT);
  const url=`https://codeload.github.com/${REPOSITORY}/zip/${commit}`;
  const allowed=new Set([url,`${API}/zipball/${commit}`,
    `https://codeload.github.com/${REPOSITORY}/legacy.zip/${commit}`,
    `https://github.com/${REPOSITORY}/archive/${commit}.zip`]);
  const response=await requestPinned(url,allowed,options,signal);
  if(response.status===401||response.status===404){
    await response.body?.cancel().catch(()=>{});
    return downloadPrivate(commit,archivePath,options,signal,limit);
  }
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw failure('network_error');}
  const file=await fsp.open(archivePath,'wx');
  try{await readBody(response,limit,'download_too_large',chunk=>file.writeFile(chunk));}
  finally{await file.close();}
}

async function validateApplication(appRoot,version){
  const required=['desktop/main.cjs','desktop/supervisor.ps1','desktop/WidgetLauncher.cs','desktop/WindowApi.cs','desktop/updates.cjs',
    'scripts/start.ps1','scripts/stop.ps1','scripts/common.ps1','scripts/apply-update.ps1','scripts/extract-update.ps1',
    'runtime/mcp.cjs','runtime/update-service.cjs','runtime/update-download.cjs',
    'package.json','package-lock.json','.codex-plugin/plugin.json','.mcp.json'];
  try{
    for(const name of required){const stat=await fsp.lstat(path.join(appRoot,name));if(!stat.isFile()||stat.isSymbolicLink())throw failure('invalid_release');}
    const read=async name=>{
      const target=path.join(appRoot,name);if((await fsp.stat(target)).size>METADATA_LIMIT)throw failure('invalid_release');
      return parseJson(await fsp.readFile(target,'utf8'));
    };
    const pkg=await read('package.json'),lock=await read('package-lock.json'),plugin=await read('.codex-plugin/plugin.json');
    if(pkg.name!=='codex-quota-widget'||pkg.version!==version||lock.name!==pkg.name||lock.version!==version||
      lock.packages?.['']?.version!==version||plugin.name!=='codex-quota-widget'||plugin.version!=='0.1.0')throw failure('invalid_release');
  }catch{throw failure('invalid_release');}
}
async function prepareRelease(options={}){
  const {jobDir,currentVersion}=options;
  if(typeof jobDir!=='string'||!path.isAbsolute(jobDir))throw failure('invalid_release');
  try{compareVersions(currentVersion,currentVersion);}catch{throw failure('invalid_release');}
  checkAborted(options.signal);
  const release=await readMetadata(`repos/${REPOSITORY}/releases/latest`,options);
  let version;try{version=publishedVersion(release);}catch{throw failure('invalid_release');}
  if(compareVersions(version,currentVersion)<=0)throw failure('no_update');
  const info=await readMetadata(`repos/${REPOSITORY}/commits/${release.tag_name}`,options),commit=info?.sha;
  if(typeof commit!=='string'||!/^[0-9a-f]{40}$/.test(commit)||
    (info.html_url!==undefined&&info.html_url!==`https://github.com/${REPOSITORY}/commit/${commit}`))throw failure('invalid_release');
  const encoded=await readMetadata(`repos/${REPOSITORY}/contents/package.json?ref=${commit}`,options);
  if(encoded?.encoding!=='base64'||typeof encoded.content!=='string'||encoded.content.length>METADATA_LIMIT||
    !/^[A-Za-z0-9+/=\r\n]+$/.test(encoded.content))throw failure('invalid_release');
  const pkg=parseJson(Buffer.from(encoded.content,'base64').toString('utf8'));
  if(pkg?.name!=='codex-quota-widget'||pkg.version!==version)throw failure('invalid_release');
  checkAborted(options.signal);
  await fsp.mkdir(jobDir,{recursive:true});
  const stat=await fsp.lstat(jobDir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(await fsp.readdir(jobDir)).length)throw failure('invalid_release');
  const archivePath=path.join(jobDir,'release.zip'),appRoot=path.join(jobDir,'app');
  await downloadArchive(commit,archivePath,options);
  checkAborted(options.signal);
  const powershell=path.join(process.env.SystemRoot||process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  try{
    await (options.execFile||execFile)(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
      '-File',path.resolve(__dirname,'../scripts/extract-update.ps1'),'-ArchivePath',archivePath,'-JobDir',jobDir],
    {shell:false,windowsHide:true,timeout:DOWNLOAD_TIMEOUT,maxBuffer:16384,signal:options.signal});
  }catch{throw failure(options.signal?.aborted?'network_error':'archive_unsafe');}
  checkAborted(options.signal);
  await validateApplication(appRoot,version);
  return {version,commit,appRoot};
}

module.exports={prepareRelease};
