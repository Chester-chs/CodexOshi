const {test}=require('node:test'),assert=require('node:assert/strict');
const {compareVersions,parseTimeline,checkVersion,readTimeline,readPublic,VERSION_API,TIMELINE}=require('../runtime/public-news.cjs');
const {parseAnnouncement}=require('../runtime/reset-announcement.cjs');
const {NewsService}=require('../runtime/news-service.cjs');
const {localTime,recentNotice}=require('../desktop/ui/news-model.js');
test('version comparison uses numeric components and prerelease ordering',()=>{
  assert.equal(compareVersions('1.10.0','1.9.9'),1);
  assert.equal(compareVersions('v2.0.0','2.0.0-beta.2'),1);
  assert.equal(compareVersions('2.0.0-beta.2','2.0.0-beta.10'),-1);
  assert.equal(compareVersions('0.1.0','0.1.0+build'),0);
  assert.throws(()=>compareVersions('latest','1.0.0'));
});
test('local reset display follows system timezone and DST without changing the timestamp',()=>{
  const at=Date.parse('2026-10-12T17:00:00Z');
  assert.match(localTime(at,'en-US','Europe/London'),/18:00/);
  assert.match(localTime(at,'zh-CN','Asia/Shanghai'),/13.*01:00/);
  assert.match(localTime(Date.parse('2026-12-12T18:00:00Z'),'en-US','Europe/London'),/18:00/);
  const before=process.env.TZ;try{process.env.TZ='Asia/Tokyo';assert.match(localTime(at,'en-US'),/02:00/);process.env.TZ='America/New_York';assert.match(localTime(at,'en-US'),/13:00/);}finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});
test('cached reset notice stops being visible after seven days even without a new fetch',()=>{
  const now=Date.parse('2026-10-19T18:00:00Z'),notice={id:'123',createdAt:now-8*86400000};
  assert.equal(recentNotice(notice,now),null);
  assert.equal(recentNotice({...notice,createdAt:now-6*86400000},now).id,'123');
});
test('announcement cache deduplicates across restart and preserves known results on rate limit',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-news-'));let now=Date.parse('2026-10-11T18:00:00Z'),calls=0,fail=false;
  const notifications=[],options={data:dir,version:'0.1.0',now:()=>now,readTimeline:async()=>{calls++;if(fail)throw Object.assign(Error('rate-limited'),{retryMs:3600000});return [{id:'123',url:'https://x.com/thsottiaux/status/123',text:'Codex resets tomorrow at 10am PT.',createdAt:now-1000}];},checkVersion:async()=>({current:'0.1.0',latest:'0.2.0',status:'available'}),onNotice:n=>notifications.push(n)};
  try{
    let service=new NewsService(options);await service.check('tibo',true);assert.equal(service.state.tibo.notice.resetAt,Date.parse('2026-10-12T17:00:00Z'));assert.equal(notifications.length,1);
    await service.check('tibo',true);assert.equal(calls,1);
    service=new NewsService(options);now+=61000;await service.check('tibo',true);assert.equal(notifications.length,1);
    fail=true;now+=61000;await service.check('tibo',true);assert.equal(service.state.tibo.status,'rate-limited');assert.equal(service.state.tibo.notice.id,'123');const count=calls;
    now+=61000;await service.check('tibo',true);assert.equal(calls,count);
    await service.check('version',true);assert.equal(service.state.version.status,'available');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('an unavailable timeline does not keep displaying an eight-day-old reset notice',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-news-'));
  let now=Date.parse('2026-10-11T18:00:00Z'),unavailable=false;
  const service=new NewsService({data:dir,version:'0.1.0',now:()=>now,readTimeline:async()=>{
    if(unavailable)throw Error('timeline-unavailable');
    return [{id:'123',url:'https://x.com/thsottiaux/status/123',text:'Codex resets tomorrow at 10am PT.',createdAt:now}];
  }});
  try{
    await service.check('tibo',true);assert.equal(service.snapshot().tibo.notice.id,'123');
    now+=8*86400000;unavailable=true;await service.check('tibo',true);
    assert.equal(service.snapshot().tibo.status,'timeline-unavailable');
    assert.equal(service.snapshot().tibo.notice,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('old posts do not notify, unrelated posts do not replace a recent reset, and in-flight requests coalesce',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-news-')),now=Date.parse('2026-10-11T18:00:00Z');let resolve,calls=0;const notifications=[];
  const service=new NewsService({data:dir,version:'0.1.0',now:()=>now,readTimeline:()=>{calls++;return new Promise(r=>resolve=r);},onNotice:n=>notifications.push(n)});
  try{const first=service.check('tibo',true),second=service.check('tibo',true);resolve([{id:'old',text:'Codex reset tomorrow at 10am PT.',createdAt:now-10*86400000}]);await Promise.all([first,second]);assert.equal(calls,1);assert.equal(service.state.tibo.notice,null);assert.equal(notifications.length,0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
const tweet=(text,extra={})=>({id_str:'123456789',full_text:text,created_at:'2026-10-11T17:00:00Z',user:{screen_name:'thsottiaux'},...extra});
const html=entries=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{timeline:{entries:entries.map(tweet=>({type:'tweet',content:{tweet}}))}}}})+'</script>';
test('timeline keeps only original Tibo posts, validates ids and rejects missing timeline',()=>{
  const posts=parseTimeline(html([tweet('Codex reset tomorrow at 10am PT.'),tweet('Other',{user:{screen_name:'other'}}),tweet('RT quote',{retweeted_status:{}}),tweet('bad',{id_str:'../evil'})]));
  assert.equal(posts.length,1);assert.equal(posts[0].url,'https://x.com/thsottiaux/status/123456789');
  assert.throws(()=>parseTimeline('<html>Sign in</html>'));
});
test('version check follows the latest published release instead of an unreleased main version',async()=>{
  const result=await checkVersion('0.3.1',{fetch:async url=>{
    assert.equal(url,'https://api.github.com/repos/Chester-chs/Codi/releases/latest');
    return Response.json({tag_name:'v0.3.2',draft:false,prerelease:false});
  }});
  assert.equal(result.latest,'0.3.2');
  assert.equal(result.status,'available');
});
test('public reads send no credentials, private GitHub fallback stays on the fixed repository',async()=>{
  const payload=JSON.stringify({tag_name:'v0.2.0',draft:false,prerelease:false});
  const result=await checkVersion('0.1.0',{fetch:async(url,options)=>{assert.equal(url,VERSION_API);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);return new Response('',{status:404});},execFile:async(command,args,options)=>{assert.equal(command,'gh');assert.deepEqual(args,['api','repos/Chester-chs/Codi/releases/latest','--hostname','github.com']);assert.equal(options.windowsHide,true);return {stdout:payload};}});
  assert.equal(result.status,'available');assert.equal(result.latest,'0.2.0');
  await assert.rejects(()=>readPublic('https://example.com'),/unsupported-source/);
  await assert.rejects(()=>readTimeline({fetch:async(url)=>{assert.equal(url,TIMELINE);return new Response('',{status:429,headers:{'retry-after':'3600'}});}}),e=>e.message==='rate-limited'&&e.retryMs===3600000);
  await assert.rejects(()=>readTimeline({fetch:async()=>new Response('x'.repeat(2*1024*1024+1))}),/response-too-large/);
});
test('service stops accepting late network results after shutdown',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-news-'));let resolve,notified=false;
  const service=new NewsService({data:dir,version:'0.1.0',readTimeline:()=>new Promise(r=>resolve=r),onNotice:()=>notified=true});
  try{const pending=service.check('tibo',true);service.close();resolve([]);await pending;assert.equal(notified,false);assert.equal(fs.existsSync(path.join(dir,'news-state.json')),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('explicit reset times respect source timezone, date rollover and Pacific DST',()=>{
  for(const [text,createdAt,want] of [
    ['Codex limits reset tomorrow at 10am PT.','2026-10-11T17:00:00Z','2026-10-12T17:00:00.000Z'],
    ['Codex limits reset tomorrow at 10am PT.','2026-12-11T18:00:00Z','2026-12-12T18:00:00.000Z'],
    ['Codex limits reset today at 11:30pm UTC.','2026-10-11T17:00:00Z','2026-10-11T23:30:00.000Z'],
    ['We will reset Codex limits on October 12 at 10 AM PDT.','2026-10-11T17:00:00Z','2026-10-12T17:00:00.000Z'],
    ['Codex limits will reset in 2 hours.','2026-10-11T17:00:00Z','2026-10-11T19:00:00.000Z'],
    ['Codex limits will reset in 1 hour and 30 minutes.','2026-10-11T17:00:00Z','2026-10-11T18:30:00.000Z'],
    ['Codex limits will reset in 1 hour, 30 minutes.','2026-10-11T17:00:00Z','2026-10-11T18:30:00.000Z'],
    ['Codex limits reset on May 12 at 10am PT.','2026-05-11T17:00:00Z','2026-05-12T17:00:00.000Z'],
    ['Tomorrow at 10am PT, we will reset Codex limits.','2026-10-11T17:00:00Z','2026-10-12T17:00:00.000Z'],
    ['Codex limits reset at 2026-10-12T10:00:00-07:00.','2026-10-11T17:00:00Z','2026-10-12T17:00:00.000Z']
  ]) assert.equal(new Date(parseAnnouncement({text,createdAt:Date.parse(createdAt)}).resetAt).toISOString(),want,text);
});
test('weekday and abbreviated month announcements resolve explicit dates while approximate wording is retained',()=>{
  assert.equal(parseAnnouncement({text:'Codex limits reset on Monday at 10am PT.',createdAt:Date.parse('2026-10-11T17:00:00Z')}).resetAt,Date.parse('2026-10-12T17:00:00Z'));
  assert.equal(parseAnnouncement({text:'Codex limits reset Oct 12 at 10am PT.',createdAt:Date.parse('2026-10-11T17:00:00Z')}).resetAt,Date.parse('2026-10-12T17:00:00Z'));
  assert.equal(parseAnnouncement({text:'Codex limits reset tomorrow around 10am PT.',createdAt:Date.parse('2026-10-11T17:00:00Z')}).approximate,true);
  assert.equal(parseAnnouncement({text:'Codex limits reset at 2026-02-30T10:00:00Z.',createdAt:Date.parse('2026-02-28T17:00:00Z')}).resetAt,null);
});
test('vague, conflicting, cancelled and DST-ambiguous notices do not invent an exact reset',()=>{
  for(const text of ['Codex limits reset tomorrow morning.','Codex resets tomorrow at 10am.','Codex will not reset tomorrow at 10am PT.','Codex reset moved from today at 10am PT to tomorrow at 11am PT.','Codex limits reset on November 1 at 1:30am PT.','Should Codex reset tomorrow at 10am PT?','Codex might reset tomorrow at 10am PT.','If testing passes, Codex resets tomorrow at 10am PT.','Codex reset is coming. Join our livestream tomorrow at 10am PT.','Codex resets in 1 hour and 30 seconds.']){
    assert.equal(parseAnnouncement({text,createdAt:Date.parse('2026-10-11T17:00:00Z')}).resetAt,null,text);
  }
  assert.equal(parseAnnouncement({text:'A lovely morning!',createdAt:Date.now()}),null);
  assert.equal(parseAnnouncement({text:'We have reset Codex usage limits across all plans.',createdAt:Date.now()}).kind,'announced');
});
test('temporarily hidden host defers a notice until delivery is accepted without another network request',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-news-'));let active=false,shown=0,calls=0;
  const service=new NewsService({data:dir,version:'0.1.0',readTimeline:async()=>{calls++;return [{id:'123',url:'https://x.com/thsottiaux/status/123',text:'Codex resets in 2 hours.',createdAt:Date.now()}];},onNotice:()=>{if(!active)return false;shown++;return true;}});
  try{await service.check('tibo',true);assert.equal(shown,0);assert.equal(service.state.seen.length,0);active=true;await service.check('tibo');assert.equal(shown,1);assert.equal(calls,1);await service.check('tibo');assert.equal(shown,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('automatic checks observe their separate intervals and the persisted off switch',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'codi-news-'));let now=Date.parse('2026-10-11T18:00:00Z'),versions=0,timelines=0;
  const options={data:dir,version:'0.1.0',now:()=>now,readTimeline:async()=>{timelines++;return [];},checkVersion:async()=>{versions++;return {current:'0.1.0',latest:'0.1.0',status:'current'};}};
  try{let service=new NewsService(options);await service.check('version');await service.check('tibo');now+=29*60000;await service.check('tibo');assert.equal(timelines,1);now+=60000;await service.check('tibo');assert.equal(timelines,2);await service.check('version');assert.equal(versions,1);service.configure(false);now+=6*3600000;service=new NewsService(options);await service.check('version');await service.check('tibo');assert.equal(versions,1);assert.equal(timelines,2);service.configure(true);await service.check('version');assert.equal(versions,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
