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
test('portrait alternates two speeches; only gear opens settings and outside click dismisses',async()=>{
  const h=await mainHarness();
  h.gesture({type:'click'});assert.equal(h.run('expanded'),false);assert.equal(h.run('speechIndex'),0);
  const g=require('../desktop/geometry.cjs');let v=h.run('viewLayout');assert.deepEqual(JSON.parse(JSON.stringify(g.shape(v.regions,800,600,v.sizes))),JSON.parse(JSON.stringify(v.regions)));
  h.gesture({type:'click'});assert.equal(h.run('speechIndex'),1);
  h.gesture({type:'click'});assert.equal(h.run('speechIndex'),0);assert.equal(h.run('clicks'),3);
  h.ipc('open-settings');assert.equal(h.run('expanded'),true);assert.equal(h.run('speechVisible'),false);
  const socket=h.socket();socket.emit('data',JSON.stringify({token:h.bridgeInfo.token,state:{attached:true,visible:true,hostAlive:true,dpi:96,bounds:{width:800,height:600},outsideClick:true}})+'\n');
  assert.equal(h.run('expanded'),false);
});
test('dialogues have exactly two bounded plain-text templates and safe substitutions',()=>{
  const m=require('../desktop/ui/dialogue-model.js');const d=m.defaults();assert.equal(d.lines.length,2);
  assert.throws(()=>m.validate({...d,lines:['a']}));assert.throws(()=>m.validate({...d,address:'x'.repeat(33)}));
  assert.throws(()=>m.validate({...d,lines:new Array(2)}));
  const quota={windows:[{label:'每周限额',remainingPercent:51,resetAt:100+3661}]};
  const text=m.present({...d,address:'主人',lines:['{称呼}，{剩余额度}，{重置时间}，{重置卡次数}','第二段']},0,quota,100000);
  assert.match(text.line,/主人/);assert.match(text.line,/51%/);assert.match(text.line,/1 小时 1 分钟/);assert.match(text.line,/未知/);
  assert.equal(m.present(d,0,{windows:[]},100000).reset,'重置时间未知');
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
