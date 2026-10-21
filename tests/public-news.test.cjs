const {test}=require('node:test'),assert=require('node:assert/strict');
const {compareVersions,checkVersion,readPublic,VERSION_API}=require('../runtime/public-news.cjs');
const {localTime}=require('../desktop/ui/news-model.js');

test('version comparison uses numeric components and prerelease ordering',()=>{
  assert.equal(compareVersions('1.10.0','1.9.9'),1);
  assert.equal(compareVersions('v2.0.0','2.0.0-beta.2'),1);
  assert.equal(compareVersions('2.0.0-beta.2','2.0.0-beta.10'),-1);
  assert.equal(compareVersions('0.1.0','0.1.0+build'),0);
  assert.throws(()=>compareVersions('latest','1.0.0'));
});
test('update timestamps follow system timezone and DST without changing the timestamp',()=>{
  const at=Date.parse('2026-10-12T17:00:00Z');
  assert.match(localTime(at,'en-US','Europe/London'),/18:00/);
  assert.match(localTime(at,'zh-CN','Asia/Shanghai'),/13.*01:00/);
  assert.match(localTime(Date.parse('2026-12-12T18:00:00Z'),'en-US','Europe/London'),/18:00/);
  const before=process.env.TZ;try{process.env.TZ='Asia/Tokyo';assert.match(localTime(at,'en-US'),/02:00/);process.env.TZ='America/New_York';assert.match(localTime(at,'en-US'),/13:00/);}finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});
test('version check follows the latest published release instead of an unreleased main version',async()=>{
  const result=await checkVersion('0.3.1',{fetch:async url=>{
    assert.equal(url,'https://api.github.com/repos/Chester-chs/CodexOshi/releases/latest');
    return Response.json({tag_name:'v0.3.2',draft:false,prerelease:false});
  }});
  assert.equal(result.latest,'0.3.2');
  assert.equal(result.status,'available');
});
test('public reads send no credentials, private GitHub fallback stays on the fixed repository',async()=>{
  const payload=JSON.stringify({tag_name:'v0.2.0',draft:false,prerelease:false});
  const result=await checkVersion('0.1.0',{fetch:async(url,options)=>{assert.equal(url,VERSION_API);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);return new Response('',{status:404});},execFile:async(command,args,options)=>{assert.equal(command,'gh');assert.deepEqual(args,['api','repos/Chester-chs/CodexOshi/releases/latest','--hostname','github.com']);assert.equal(options.windowsHide,true);return {stdout:payload};}});
  assert.equal(result.status,'available');assert.equal(result.latest,'0.2.0');
  await assert.rejects(()=>readPublic('https://example.com'),/unsupported-source/);
});