const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {layout,shape}=require('../desktop/geometry.cjs');
const {mainHarness}=require('./main-harness.cjs');
test('resized cards use their own bounded profile and still clamp to the host viewport',()=>{
  const large=layout({x:850,y:50},1200,1000,true,1,{width:199,height:280},{width:700,height:740});assert.equal(large.regions[1].width,700);assert.equal(large.regions[1].height,740);assert.deepEqual(shape(large.regions,1200,1000,large.sizes),large.regions);
  const small=layout(null,320,250,true,1,{width:199,height:280},{width:700,height:740});assert.equal(small.regions[1].width,288);assert.equal(small.regions[1].height,218);assert.deepEqual(shape(small.regions,320,250,small.sizes),small.regions);
  assert.deepEqual(shape([{x:8,y:8,width:199,height:280},{x:300,y:8,width:761,height:800}],1200,1000,[{width:199,height:280},{width:761,height:800}]),[{x:0,y:0,width:1,height:1}]);
});
test('card resize updates do not write; release saves size and language survives a later resize',async()=>{
  const h=await mainHarness();h.ipc('open-settings');h.reset();assert.ok(h.hasHandler('panel-resize'));h.ipc('panel-resize',{type:'begin'});
  for(let n=0;n<120;n++)h.ipc('panel-resize',{type:'update',width:500+n,height:580+n});assert.equal(h.writes.length,0);assert.equal(h.stringifies,0);h.ipc('panel-resize',{type:'end'});await Promise.resolve();assert.equal(h.writes.filter(w=>w.file==='panel-preferences.json').length,1);
  await h.ipc('panel-language','en-US');h.reset();h.ipc('panel-resize',{type:'begin'});h.ipc('panel-resize',{type:'update',width:620,height:700});h.ipc('panel-resize',{type:'end'});await Promise.resolve();assert.equal(JSON.parse(h.writes.find(w=>w.file==='panel-preferences.json').value).language,'en-US');
});
test('saved card size loads before the first expanded layout and invalid IPC cannot enlarge the shape',async()=>{
  const h=await mainHarness(undefined,{savedPanel:{width:700,height:740,language:'en-US'}});h.ipc('open-settings');assert.equal(h.shapes.at(-1)[1].width,700);assert.equal(h.shapes.at(-1)[1].height,568);h.reset();h.ipc('panel-resize',{type:'begin'});h.ipc('panel-resize',{type:'update',width:99999,height:99999});h.ipc('panel-resize',{type:'end'});await Promise.resolve();assert.equal(JSON.parse(h.writes.find(w=>w.file==='panel-preferences.json').value).width,700);
});
test('card preferences persist independently and reject malformed, oversized and linked files',async()=>{
  const {PanelPreferencesStore}=require('../runtime/panel-preferences.cjs'),root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-panel-prefs-'));
  try{const store=new PanelPreferencesStore(root);await fs.writeFile(path.join(root,'appearance.json'),'{"palette":"sage"}');await store.save({width:700,height:740,language:'en-US'});assert.deepEqual(await new PanelPreferencesStore(root).read(),{width:700,height:740,language:'en-US'});await assert.rejects(store.save({width:800,height:800,language:'en-US'}));assert.equal(await fs.readFile(path.join(root,'appearance.json'),'utf8'),'{"palette":"sage"}');await fs.writeFile(store.file,'x'.repeat(8192));assert.deepEqual(await store.read(),{width:480,height:560,language:'zh-CN'});await fs.unlink(store.file);await fs.mkdir(path.join(root,'target'));await fs.symlink(path.join(root,'target'),store.file,'junction');await assert.rejects(store.save({width:500,height:600,language:'zh-CN'}));}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('English quota and token labels keep the original numbers and thresholds',()=>{
  const view=require('../desktop/ui/view-model.js');const q=view.present({windows:[{label:'每周限额',remainingPercent:10,resetAt:100000}]},200,0,'en-US');assert.equal(q.cards[0].label,'Weekly limit');assert.equal(q.cards[0].percentText,'10%');assert.equal(q.cards[0].tone,'red');assert.equal(q.cards[0].resetText,'Resets in 1d 3h');const tokens=view.presentTokens({values:{hours24:1000,days7:2000,days30:3000},coverage:'complete',filesIndexed:1,filesDiscovered:1},'en-US');assert.equal(tokens.rows[0].label,'Last 24 hours');assert.equal(tokens.rows[0].number,'1.0');assert.equal(tokens.coverageText,'Complete · 1/1 files');
});
test('unknown translated labels remain literal, including names inherited by ordinary objects',()=>{
  const {t}=require('../desktop/ui/i18n.js');for(const value of ['Custom window','constructor','toString','__proto__'])assert.equal(t(value,{},'en-US'),value);assert.equal(t(undefined,{},'en-US'),'');
});
test('the portrait height label has an English translation',()=>{
  const {t}=require('../desktop/ui/i18n.js');assert.equal(t('高度',{},'en-US'),'Height');
});
