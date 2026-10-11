const {test}=require('node:test'),assert=require('node:assert/strict');
const {mainHarness}=require('./main-harness.cjs');
test('minimize placeholder bounds never clamp or persist the remembered position',async()=>{
  const h=await mainHarness();const socket=h.socket();
  const send=state=>socket.emit('data',JSON.stringify({token:h.bridgeInfo.token,state})+'\n');
  send({attached:true,visible:false,hostAlive:true,dpi:96,bounds:{width:160,height:28}});
  assert.equal(h.run('widget.x'),300);assert.equal(h.run('widget.y'),200);
  assert.equal(h.writes.filter(w=>w.file==='position.json').length,0);
  send({attached:true,visible:true,hostAlive:true,dpi:96,bounds:{width:800,height:600}});
  assert.equal(h.run('widget.x'),300);assert.equal(h.run('widget.y'),200);
});
test('portrait always opens first speech; only bubble clicks cycle and gear opens settings',async()=>{
  const h=await mainHarness();
  h.gesture({type:'click'});assert.equal(h.run('expanded'),false);assert.equal(h.run('speechIndex'),0);
  const g=require('../desktop/geometry.cjs');let v=h.run('viewLayout');assert.deepEqual(JSON.parse(JSON.stringify(g.shape(v.regions,800,600,v.sizes))),JSON.parse(JSON.stringify(v.regions)));
  h.gesture({type:'click'});assert.equal(h.run('speechIndex'),0);
  h.gesture({type:'speech-next'});assert.equal(h.run('speechIndex'),1);
  h.gesture({type:'speech-next'});assert.equal(h.run('speechIndex'),0);
  h.gesture({type:'speech-next'});assert.equal(h.run('speechIndex'),1);
  h.gesture({type:'click'});assert.equal(h.run('speechIndex'),0);assert.equal(h.run('clicks'),3);
  h.ipc('open-settings');assert.equal(h.run('expanded'),true);assert.equal(h.run('speechVisible'),false);
  h.gesture({type:'speech-next'});assert.equal(h.run('expanded'),true);assert.equal(h.run('speechVisible'),false);
  const socket=h.socket();socket.emit('data',JSON.stringify({token:h.bridgeInfo.token,state:{attached:true,visible:true,hostAlive:true,dpi:96,bounds:{width:800,height:600},outsideClick:true}})+'\n');
  assert.equal(h.run('expanded'),false);
});
for(const previousClicks of [1,2])test(`outside dismissal of speech ${previousClicks} starts again with reset information`,async()=>{
  const h=await mainHarness(),socket=h.socket();
  h.gesture({type:'click'});if(previousClicks===2)h.gesture({type:'speech-next'});
  socket.emit('data',JSON.stringify({token:h.bridgeInfo.token,state:{attached:true,visible:true,hostAlive:true,dpi:96,bounds:{width:800,height:600},outsideClick:true}})+'\n');
  assert.equal(h.run('speechVisible'),false);
  h.gesture({type:'speech-next'});assert.equal(h.run('speechVisible'),false,'A hidden bubble cannot reopen itself');
  h.gesture({type:'click'});assert.equal(h.run('speechIndex'),0,'A closed bubble must begin a fresh dialogue');
  h.gesture({type:'speech-next'});assert.equal(h.run('speechIndex'),1,'A bubble click advances to the reminder');
  h.ipc('collapse');h.gesture({type:'click'});assert.equal(h.run('speechIndex'),0);
  h.ipc('open-settings');h.ipc('collapse');h.gesture({type:'click'});assert.equal(h.run('speechIndex'),0);
  assert.equal(h.run('clicks'),4,'Only portrait gestures count as portrait clicks');
});
test('dialogues have exactly two bounded plain-text templates and safe substitutions',()=>{
  const m=require('../desktop/ui/dialogue-model.js');const d=m.defaults();assert.equal(d.lines.length,2);
  assert.throws(()=>m.validate({...d,lines:['a']}));assert.throws(()=>m.validate({...d,address:'x'.repeat(33)}));
  assert.throws(()=>m.validate({...d,lines:new Array(2)}));
  const quota={windows:[{label:'每周限额',remainingPercent:51,resetAt:100+3661}]};
  const text=m.present({...d,address:'主人',lines:['{称呼}，{剩余额度}，{重置时间}，{重置卡次数}','第二段']},0,quota,100000);
  assert.match(text.line,/主人/);assert.match(text.line,/51%/);assert.match(text.line,/1小时1分钟/);assert.match(text.line,/未知/);
  assert.equal(m.present(d,0,{windows:[]},100000).reset,'重置时间未知');
});
test('presets with a literal salutation still explain unknown or elapsed reset times',()=>{
  const m=require('../desktop/ui/dialogue-model.js');
  for(const language of ['zh-CN','en-US']){const line=m.presets(language)[0][0].template.replace('{称呼}','老板'),value={address:'老板',lines:[line,'加油']};
    assert.doesNotMatch(m.present(value,0,{windows:[]},100000,language).line,/未知|Unknown/);
    assert.match(m.present(value,0,{windows:[{resetAt:99}]},100000,language).line,language==='zh-CN'?/等我更新/:/refresh the quota/);
  }
});
test('reset placeholder is duration only, while the standalone reset label stays a sentence',()=>{
  const m=require('../desktop/ui/dialogue-model.js'),d=m.defaults(),q=seconds=>({windows:[{remainingPercent:49,resetAt:100+seconds}]});
  const v=m.present(d,0,q(3*86400+21*3600+23*60),100000);
  assert.equal(v.resetDuration,'3天21小时');assert.equal(v.line,'主人，再过3天21小时，额度就重置啦。');assert.match(v.reset,/后重置$/);
  assert.equal(m.present(d,0,q(61*60),100000).resetDuration,'1小时1分钟');
  assert.equal(m.present(d,0,q(23),100000).resetDuration,'23秒');
  assert.equal(m.present(d,0,q(3*86400+21*3600),100000,'en-US').resetDuration,'3d 21h');
  assert.doesNotMatch(m.present(d,0,{},100000).line,/再过未知|再过重置时间未知/);
  assert.match(m.present(d,0,q(0),100000).line,/等我更新/);
});
test('dialogue presets are bounded, localized and encouragement does not invent quota or reset facts',()=>{
  const m=require('../desktop/ui/dialogue-model.js');
  for(const locale of ['zh-CN','en-US']){const p=m.presets(locale);assert.equal(p.length,2);assert.equal(p[0].length,3);assert.equal(p[1].length,4);
    for(const [i,rows]of p.entries())for(const item of rows){assert.ok(item.id&&item.label&&item.template);const d=m.defaults();d.lines[i]=item.template;assert.doesNotThrow(()=>m.validate(d));if(i===1)assert.doesNotMatch(item.template,/\{(剩余额度|重置时间|重置卡次数)\}/);}
  }
  assert.match(m.defaults().lines[1],/每一步都算数/);
});
test('legacy default dialogues upgrade on read without rewriting the file or changing custom text',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{DialoguePreferencesStore}=require('../runtime/dialogue-preferences.cjs'),m=require('../desktop/ui/dialogue-model.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-dialogue-migration-'));
  try{const store=new DialoguePreferencesStore(root),old={address:'老板',lines:['{称呼}，{重置时间}。','{称呼}，额度消耗好快呀，记得歇一歇。']};const bytes=JSON.stringify(old);await fs.writeFile(store.file,bytes);assert.deepEqual(await store.read(),{address:'老板',lines:m.defaults().lines});assert.notEqual((await store.read()).lines[0],old.lines[0]);assert.equal(await fs.readFile(store.file,'utf8'),bytes);old.lines[1]='这是我的自定义句子';await fs.writeFile(store.file,JSON.stringify(old));assert.equal((await store.read()).lines[1],old.lines[1]);}
  finally{await fs.rm(root,{recursive:true,force:true});}
});
test('official reset count is retained, zero is valid, and bad values stay unknown',()=>{
  const {normalize}=require('../runtime/quota.cjs');
  assert.equal(normalize({rateLimitResetCredits:{availableCount:2,credits:[{id:'private-id'}]}},'rpc',100).resetCredits.availableCount,2);
  assert.equal(normalize({rateLimitResetCredits:{availableCount:0}},'rpc',100).resetCredits.availableCount,0);
  assert.equal(normalize({rateLimitResetCredits:{availableCount:-1}},'rpc',100).resetCredits,null);
});
test('reset count uses allowed RPC at most every five minutes even with fresh HTTP; failures mark cache stale',async()=>{
  const {QuotaReader,normalize}=require('../runtime/quota.cjs');let now=100000,calls=0,fail=false;
  const reader=new QuotaReader({readResetCredits:true,now:()=>now,http:async()=>normalize({rate_limit:{primary_window:{used_percent:49}}},'http',now),rpc:async()=>{calls++;if(fail)throw Error('offline');return normalize({rateLimitResetCredits:{availableCount:2}},'rpc',now);}});
  await reader.refresh();assert.equal(reader.snapshot.resetCredits.availableCount,2);assert.equal(reader.snapshot.windows[0].remainingPercent,51);
  now+=30000;await reader.refresh();assert.equal(calls,1);assert.equal(reader.snapshot.resetCredits.availableCount,2);
  fail=true;now+=300000;await reader.refresh();assert.equal(calls,2);assert.equal(reader.snapshot.resetCredits.stale,true);
});
test('dialogue preferences persist locally, malformed files fall back, and user data is preserved',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{DialoguePreferencesStore}=require('../runtime/dialogue-preferences.cjs'),m=require('../desktop/ui/dialogue-model.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-dialogue-'));
  try{const store=new DialoguePreferencesStore(root),value={address:'老板',lines:['{称呼}：{剩余额度}','<b>不会作为 HTML 执行</b>']};await store.save(value);assert.deepEqual(await new DialoguePreferencesStore(root).read(),value);await fs.writeFile(store.file,'bad');assert.deepEqual(await store.read(),m.defaults());assert.deepEqual(await fs.readdir(root),['dialogue-preferences.json']);}
  finally{await fs.rm(root,{recursive:true,force:true});}
});
