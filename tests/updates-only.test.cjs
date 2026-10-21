const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {NewsService}=require('../runtime/news-service.cjs');
const {installNews,safeUrl}=require('../desktop/news.cjs');
const {readPublic,REPO}=require('../runtime/public-news.cjs');

test('removed announcement source is rejected without reading the timeline',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-updates-'));let calls=0;
  const service=new NewsService({data,version:'0.3.8',readTimeline:async()=>{calls++;return [];}});
  try{await assert.rejects(()=>service.check('tibo',true),/invalid-source/);assert.equal(calls,0);}finally{service.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('old announcement cache is ignored while update preferences and cache survive',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-updates-')),now=Date.now();
  fs.writeFileSync(path.join(data,'news-state.json'),JSON.stringify({enabled:false,version:{current:'0.3.8',latest:'0.3.9',status:'available',checkedAt:now},tibo:{status:'ok',notice:{id:'123',text:'Codex resets in 2 hours.',createdAt:now}},seen:['tibo:123','version:0.3.9']}));
  const service=new NewsService({data,version:'0.3.8',now:()=>now});
  try{
    const state=service.snapshot();assert.equal(state.enabled,false);assert.equal(state.version.latest,'0.3.9');assert.equal(state.version.status,'available');assert.equal('tibo' in state,false);
    service.configure(true);const saved=JSON.parse(fs.readFileSync(path.join(data,'news-state.json'),'utf8'));assert.equal('tibo' in saved,false);assert.deepEqual(saved.seen,['version:0.3.9']);
  }finally{service.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('desktop polling checks only releases and rejects removed IPC and links',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-updates-')),handlers={},opened=[];let reads=0;
  const sender={send(){}},win={webContents:sender,isDestroyed:()=>false},originalFetch=global.fetch;
  global.fetch=async url=>{reads++;assert.equal(url,'https://api.github.com/repos/Chester-chs/CodexOshi/releases/latest');return Response.json({tag_name:'v99.0.0',draft:false,prerelease:false});};
  const news=installNews({win,data,ipcMain:{handle:(name,fn)=>handlers[name]=fn},Notification:{isSupported:()=>false},shell:{openExternal:async url=>opened.push(url)},isActive:()=>true,language:()=> 'en-US'});
  try{
    await news.poll();assert.equal(reads,1);await news.poll();assert.equal(reads,1);
    assert.deepEqual(await handlers['news-check']({sender},'tibo'),{ok:false});assert.deepEqual(await handlers['news-open']({sender},'tibo'),{ok:false});
    assert.deepEqual(await handlers['news-open']({sender},'version'),{ok:true});assert.deepEqual(opened,[REPO]);
    assert.equal(safeUrl('https://x.com/thsottiaux'),false);assert.equal(safeUrl('https://x.com/thsottiaux/status/123'),false);
  }finally{news.close();global.fetch=originalFetch;fs.rmSync(data,{recursive:true,force:true});}
});

test('public reader no longer accepts the reset announcement endpoint',async()=>{
  let called=false;await assert.rejects(()=>readPublic('https://syndication.twitter.com/srv/timeline-profile/screen-name/thsottiaux',{fetch:async()=>{called=true;return new Response('');}}),/unsupported-source/);assert.equal(called,false);
});

test('settings contain only the update card',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../desktop/ui/index.html'),'utf8');
  assert.doesNotMatch(html,/tibo-|Tibo/);assert.match(html,/id="version-check"/);assert.match(html,/id="version-update"/);
});

test('release cache keeps cooldown, deduplicates notifications and persists automatic checking',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-updates-'));let now=Date.now(),calls=0,active=false,fail=false,notices=0;
  const options={data,version:'0.3.8',now:()=>now,checkVersion:async()=>{calls++;if(fail)throw Object.assign(Error('rate-limited'),{retryMs:3600000});return {current:'0.3.8',latest:'0.3.9',status:'available'};},onNotice:()=>{if(!active)return false;notices++;return true;}};
  let service=new NewsService(options);
  try{
    await service.check('version');assert.equal(calls,1);assert.equal(notices,0);active=true;await service.check('version');assert.equal(calls,1);assert.equal(notices,1);
    service.close();service=new NewsService(options);await service.check('version',true);assert.equal(calls,1);assert.equal(notices,1);
    now+=61000;fail=true;await service.check('version',true);assert.equal(service.snapshot().version.status,'rate-limited');assert.equal(service.snapshot().version.latest,'0.3.9');const count=calls;
    now+=61000;await service.check('version',true);assert.equal(calls,count);service.configure(false);service.close();now+=7*3600000;
    service=new NewsService(options);await service.check('version');assert.equal(calls,count);service.configure(true);fail=false;await service.check('version');assert.equal(calls,count+1);assert.equal(notices,1);
  }finally{service.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('release requests coalesce and shutdown discards late network results',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-updates-'));let resolve,calls=0,notified=false;
  const service=new NewsService({data,version:'0.3.8',checkVersion:()=>{calls++;return new Promise(done=>resolve=done);},onNotice:()=>notified=true});
  try{
    const first=service.check('version',true),second=service.check('version',true);assert.equal(calls,1);service.close();resolve({latest:'0.3.9',status:'available'});await Promise.all([first,second]);
    assert.equal(notified,false);assert.equal(fs.existsSync(path.join(data,'news-state.json')),false);
  }finally{service.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('release reader retains rate limits and response size limits',async()=>{
  const url='https://api.github.com/repos/Chester-chs/CodexOshi/releases/latest';
  await assert.rejects(()=>readPublic(url,{fetch:async()=>new Response('',{status:429,headers:{'retry-after':'3600'}})}),e=>e.message==='rate-limited'&&e.retryMs===3600000);
  await assert.rejects(()=>readPublic(url,{fetch:async()=>new Response('x'.repeat(2*1024*1024+1))}),/response-too-large/);
});
