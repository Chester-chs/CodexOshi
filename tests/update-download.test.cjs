const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const {promisify}=require('node:util');
const {prepareRelease}=require('../runtime/update-download.cjs');

const SHA='a'.repeat(40), API='https://api.github.com/repos/Chester-chs/CodexOshi';
const ARCHIVE=`https://codeload.github.com/Chester-chs/CodexOshi/zip/${SHA}`;
const realExec=promisify(cp.execFile);
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(entries){
  const local=[],central=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name),data=Buffer.from(entry.data||''),crc=crc32(data);
    const a=Buffer.alloc(30);a.writeUInt32LE(0x04034b50);a.writeUInt16LE(20,4);a.writeUInt16LE(0x800,6);a.writeUInt32LE(crc,14);a.writeUInt32LE(data.length,18);a.writeUInt32LE(entry.length??data.length,22);a.writeUInt16LE(name.length,26);
    local.push(a,name,data);
    const b=Buffer.alloc(46);b.writeUInt32LE(0x02014b50);b.writeUInt16LE(0x314,4);b.writeUInt16LE(20,6);b.writeUInt16LE(0x800,8);b.writeUInt32LE(crc,16);b.writeUInt32LE(data.length,20);b.writeUInt32LE(entry.length??data.length,24);b.writeUInt16LE(name.length,28);b.writeUInt32LE(entry.attributes??0,38);b.writeUInt32LE(offset,42);
    central.push(b,name);offset+=a.length+name.length+data.length;
  }
  const body=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(body.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,body,end]);
}
function files(version='0.2.0'){
  const values={
    'package.json':JSON.stringify({name:'codex-quota-widget',version}),
    'package-lock.json':JSON.stringify({name:'codex-quota-widget',version,lockfileVersion:3,packages:{'':{name:'codex-quota-widget',version}}}),
    '.codex-plugin/plugin.json':JSON.stringify({name:'codex-quota-widget',version:'0.1.0'}),
    '.mcp.json':'{}',
    'desktop/main.cjs':'main','desktop/supervisor.ps1':'supervisor','desktop/bridge-cleanup.ps1':'bridge cleanup','desktop/WidgetLauncher.cs':'launcher',
    'desktop/WindowApi.cs':'window api','desktop/updates.cjs':'update bridge',
    'scripts/start.ps1':'start','scripts/common.ps1':'common','scripts/apply-update.ps1':'apply',
    'scripts/stop.ps1':'stop','scripts/extract-update.ps1':'extract','runtime/mcp.cjs':'mcp',
    'runtime/update-service.cjs':'update service','runtime/update-download.cjs':'update download'
  };
  return Object.entries(values).map(([name,data])=>({name:`CodexOshi-${SHA}/${name}`,data}));
}
function metadata(version='0.2.0'){return {encoding:'base64',content:Buffer.from(JSON.stringify({name:'codex-quota-widget',version})).toString('base64')};}
function publicFetch(archive,version='0.2.0',seen=[]){return async(url,options)=>{
  seen.push(url);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);
  if(url===`${API}/releases/latest`)return Response.json({tag_name:`v${version}`,draft:false,prerelease:false});
  if(url===`${API}/commits/v${version}`)return Response.json({sha:SHA,html_url:`https://github.com/Chester-chs/CodexOshi/commit/${SHA}`});
  if(url===`${API}/contents/package.json?ref=${SHA}`)return Response.json(metadata(version));
  if(url===ARCHIVE)return new Response(archive);
  throw Error(`unexpected request: ${url}`);
};}
function job(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'codi-update-download-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return path.join(root,'job');}
const code=value=>error=>error.code===value;

test('update stages the latest published tag and never resolves main',async t=>{
  const jobDir=job(t),seen=[];
  const result=await prepareRelease({jobDir,currentVersion:'0.1.0',fetch:async(url,options)=>{
    seen.push(url);assert.equal(options.credentials,'omit');
    if(url===`${API}/releases/latest`)return Response.json({tag_name:'v0.2.0',draft:false,prerelease:false});
    if(url===`${API}/commits/v0.2.0`)return Response.json({sha:SHA,html_url:`https://github.com/Chester-chs/CodexOshi/commit/${SHA}`});
    if(url===`${API}/contents/package.json?ref=${SHA}`)return Response.json(metadata());
    if(url===ARCHIVE)return new Response(zip(files()));
    throw Error(`unexpected request: ${url}`);
  }});
  assert.equal(result.version,'0.2.0');
  assert.deepEqual(seen,[`${API}/releases/latest`,`${API}/commits/v0.2.0`,`${API}/contents/package.json?ref=${SHA}`,ARCHIVE]);
});
test('release pins metadata and extracted app to the published tag commit',async t=>{
  const jobDir=job(t),seen=[];
  const result=await prepareRelease({jobDir,currentVersion:'0.1.0',fetch:publicFetch(zip(files()),'0.2.0',seen)});
  assert.deepEqual(result,{version:'0.2.0',commit:SHA,appRoot:path.join(jobDir,'app')});
  assert.deepEqual(seen,[`${API}/releases/latest`,`${API}/commits/v0.2.0`,`${API}/contents/package.json?ref=${SHA}`,ARCHIVE]);
  assert.equal(fs.readFileSync(path.join(result.appRoot,'desktop/main.cjs'),'utf8'),'main');
  assert.equal(fs.existsSync(path.join(result.appRoot,'node_modules')),false);
});

test('same or older release stops before downloading or extracting',async t=>{
  for(const latest of ['0.1.0','0.0.9']){
    const seen=[];await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:publicFetch(zip(files(latest)),latest,seen)}),code('no_update'));
    assert.equal(seen.length,1);
  }
});

test('malformed commit and a commit URL from another repository cannot select a release',async t=>{
  for(const payload of [{sha:'main'},{sha:SHA,html_url:`https://github.com/attacker/CodexOshi/commit/${SHA}`}]){
    await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:async url=>Response.json(url===`${API}/releases/latest`?{tag_name:'v0.2.0',draft:false,prerelease:false}:payload)}),code('invalid_release'));
  }
});

test('archive redirects reject other repositories, credentials, and protocols before requesting them',async t=>{
  for(const location of [`https://codeload.github.com/evil/CodexOshi/zip/${SHA}`,`https://github.com/Chester-chs/CodexOshi/archive/main.zip`,`https://evil.test/a.zip`,`http://codeload.github.com/Chester-chs/CodexOshi/zip/${SHA}`,`https://user@codeload.github.com/Chester-chs/CodexOshi/zip/${SHA}`]){
    const ordinary=publicFetch(zip(files()));let calls=0;
    await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:async(url,options)=>{calls++;return url===ARCHIVE?new Response(null,{status:302,headers:{location}}):ordinary(url,options);}}),code('invalid_release'));
    assert.equal(calls,4);
  }
});

test('archive redirects accept only pinned GitHub endpoints and stop at three hops',async t=>{
  const next=`https://codeload.github.com/Chester-chs/CodexOshi/legacy.zip/${SHA}`,ordinary=publicFetch(zip(files()));
  const accepted=await prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:async(url,options)=>url===ARCHIVE?new Response(null,{status:302,headers:{location:next}}):url===next?new Response(zip(files())):ordinary(url,options)});
  assert.equal(accepted.commit,SHA);
  let redirects=0;
  await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:async(url,options)=>url===ARCHIVE?(redirects++,new Response(null,{status:302,headers:{location:ARCHIVE}})):ordinary(url,options)}),code('network_error'));
  assert.equal(redirects,4);
});

test('public download enforces streamed and declared size limits before extraction',async t=>{
  for(const declared of [false,true]){
    const jobDir=job(t),ordinary=publicFetch(zip(files()));
    await assert.rejects(prepareRelease({jobDir,currentVersion:'0.1.0',maxDownloadBytes:64,fetch:async(url,options)=>url===ARCHIVE?new Response(Buffer.alloc(65),declared?{headers:{'content-length':'65'}}:{}):ordinary(url,options)}),code('download_too_large'));
    assert.equal(fs.existsSync(path.join(jobDir,'app')),false);
  }
});

test('private GitHub fallback uses existing gh authentication and streams the pinned archive',async t=>{
  const archive=zip(files()),jobDir=job(t),commands=[];
  const result=await prepareRelease({jobDir,currentVersion:'0.1.0',fetch:async()=>new Response(null,{status:404}),
    execFile:async(command,args,options)=>{if(command!=='gh')return realExec(command,args,options);commands.push(args);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);return {stdout:JSON.stringify(args[1].endsWith('/releases/latest')?{tag_name:'v0.2.0',draft:false,prerelease:false}:args[1].endsWith('/commits/v0.2.0')?{sha:SHA}:metadata())};},
    spawn:(command,args,options)=>{assert.equal(command,'gh');assert.deepEqual(args,['api',`repos/Chester-chs/CodexOshi/zipball/${SHA}`,'--hostname','github.com']);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);return cp.spawn(process.execPath,['-e','process.stdout.write(Buffer.from(process.argv[1],"base64"))',archive.toString('base64')],options);}
  });
  assert.equal(result.version,'0.2.0');assert.deepEqual(commands,[['api','repos/Chester-chs/CodexOshi/releases/latest','--hostname','github.com'],['api','repos/Chester-chs/CodexOshi/commits/v0.2.0','--hostname','github.com'],['api',`repos/Chester-chs/CodexOshi/contents/package.json?ref=${SHA}`,'--hostname','github.com']]);
});

test('missing private-repository credentials are reported without leaking CLI output',async t=>{
  await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:async()=>new Response(null,{status:401}),execFile:async()=>{throw Error('secret CLI stderr');}}),error=>error.code==='authentication_required'&&!error.message.includes('secret'));
});

test('private archive size limit kills its stream and leaves no application',async t=>{
  const jobDir=job(t),ordinary=publicFetch(zip(files()));
  await assert.rejects(prepareRelease({jobDir,currentVersion:'0.1.0',maxDownloadBytes:64,fetch:async(url,options)=>url===ARCHIVE?new Response(null,{status:404}):ordinary(url,options),spawn:(command,args,options)=>cp.spawn(process.execPath,['-e','process.stdout.write(Buffer.alloc(65))'],options)}),code('download_too_large'));
  assert.equal(fs.existsSync(path.join(jobDir,'app')),false);
});

test('untrusted ZIP paths are rejected before any entry is extracted',async t=>{
  for(const name of ['../outside','root/../../outside','root\\..\\outside','/absolute','C:/drive','root/CON.txt','root/CONIN$','root/CONOUT$','root/COM\u00b9.txt','root/file:stream','root/trailing.','root/../outside','another/file']){
    const jobDir=job(t),entries=[{name:'root/first.txt',data:'must not extract'},{name,data:'bad'}];
    await assert.rejects(prepareRelease({jobDir,currentVersion:'0.1.0',fetch:publicFetch(zip(entries))}),code('archive_unsafe'),name);
    assert.equal(fs.existsSync(path.join(jobDir,'app')),false,name);
    assert.equal(fs.existsSync(path.join(jobDir,'unpacked','root','first.txt')),false,name);
  }
});

test('ZIP symlinks, case-colliding paths, and oversized expansion are rejected',async t=>{
  for(const entries of [
    [{name:'root/link',data:'target',attributes:0xa1ff0000}],
    [{name:'root/A.txt',data:'a'},{name:'root/a.txt',data:'b'}],
    [{name:'root/A',data:'a'},{name:'root/a/file',data:'b'}],
    [{name:'root/huge',data:'x',length:128*1024*1024+1}]
  ])await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:publicFetch(zip(entries))}),code('archive_unsafe'));
});

test('extracted metadata must match the resolved version and compatible plugin identity',async t=>{
  const badVersion=files('0.3.0'),badPlugin=files(),missingFile=files().filter(file=>!file.name.endsWith('desktop/main.cjs'));
  badPlugin.find(file=>file.name.endsWith('plugin.json')).data=JSON.stringify({name:'another-plugin',version:'0.1.0'});
  for(const entries of [badVersion,badPlugin,missingFile])await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:publicFetch(zip(entries))}),code('invalid_release'));
});

test('ZIP entry count and total declared expansion are bounded before extraction',async t=>{
  const cases=[Array.from({length:10001},(_,i)=>({name:`root/${i}`})),Array.from({length:5},(_,i)=>({name:`root/${i}`,length:128*1024*1024}))];
  for(const entries of cases){
    const jobDir=job(t);
    await assert.rejects(prepareRelease({jobDir,currentVersion:'0.1.0',fetch:publicFetch(zip(entries))}),code('archive_unsafe'));
    assert.equal(fs.existsSync(path.join(jobDir,'unpacked')),false);
  }
});

test('cancellation stops metadata reads without attempting private authentication',async t=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',signal:controller.signal,fetch:async()=>{calls++;throw Error('unexpected');}}),code('network_error'));
  assert.equal(calls,0);
  const active=new AbortController();let ghCalls=0;
  await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',signal:active.signal,fetch:async()=>{active.abort();throw new DOMException('cancelled','AbortError');},execFile:async()=>{ghCalls++;}}),code('network_error'));
  assert.equal(ghCalls,0);
});

test('existing job contents are never overwritten by staging',async t=>{
  const jobDir=job(t);fs.mkdirSync(jobDir);fs.writeFileSync(path.join(jobDir,'release.zip'),'keep');
  await assert.rejects(prepareRelease({jobDir,currentVersion:'0.1.0',fetch:publicFetch(zip(files()))}),code('invalid_release'));
  assert.equal(fs.readFileSync(path.join(jobDir,'release.zip'),'utf8'),'keep');
});

test('release must include monitor controls and its own next-update runtime',async t=>{
  for(const missing of ['.mcp.json','scripts/stop.ps1','desktop/WindowApi.cs','desktop/bridge-cleanup.ps1','desktop/updates.cjs','runtime/update-service.cjs','runtime/update-download.cjs','scripts/extract-update.ps1']){
    const entries=files().filter(file=>!file.name.endsWith('/'+missing));
    await assert.rejects(prepareRelease({jobDir:job(t),currentVersion:'0.1.0',fetch:publicFetch(zip(entries))}),code('invalid_release'),missing);
  }
});
