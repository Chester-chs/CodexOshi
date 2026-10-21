const test=require('node:test'),assert=require('node:assert/strict');
const {mainHarness}=require('./main-harness.cjs');

for(const first of ['panel-dock','widget-enabled','panel-compact-only']){
  test(`pending ${first} and a language change both survive restart`,async()=>{
    const h=await mainHarness(undefined,{savedPanel:{width:480,height:560,language:'zh-CN',dockBottomRight:false,widgetEnabled:true}});
    h.run('globalThis.originalSave=panelStore.save.bind(panelStore);globalThis.releaseFirst=null;let first=true;panelStore.save=value=>{const saved=originalSave(value);if(!first)return saved;first=false;return new Promise(resolve=>{globalThis.releaseFirst=()=>saved.then(resolve);});};');
    const value=first!=='widget-enabled',pending=h.ipc(first,value);await Promise.resolve();
    const language=h.ipc('panel-language','en-US');await Promise.resolve();
    h.run('globalThis.releaseFirst();');
    for(const result of await Promise.all([pending,language]))assert.equal(result.ok,true);
    const live=JSON.parse(JSON.stringify(await h.ipc('panel-preferences-read')));
    const disk=JSON.parse(h.writes.filter(w=>w.file==='panel-preferences.json').at(-1).value);
    const key={'panel-dock':'dockBottomRight','widget-enabled':'widgetEnabled','panel-compact-only':'compactOnly'}[first];
    assert.equal(live[key],value);assert.equal(disk[key],value);
    assert.equal(live.language,'en-US');assert.equal(disk.language,'en-US');
  });
}

test('a failed language save restores the actual persisted language',async()=>{
  const h=await mainHarness();
  h.run('panelStore.save=async()=>{throw Error("read-only");};');
  assert.equal((await h.ipc('panel-language','en-US')).ok,false);
  assert.equal((await h.ipc('panel-preferences-read')).language,'zh-CN');
});

test('a resize during a pending dock save retains both the dock setting and dimensions',async()=>{
  const h=await mainHarness(undefined,{savedPanel:{width:480,height:560,language:'zh-CN',dockBottomRight:false,widgetEnabled:true}});
  h.run('globalThis.originalSave=panelStore.save.bind(panelStore);globalThis.releaseFirst=null;let first=true;panelStore.save=value=>{const saved=originalSave(value);if(!first)return saved;first=false;return new Promise(resolve=>{globalThis.releaseFirst=()=>saved.then(resolve);});};');
  const pending=h.ipc('panel-dock',true);await Promise.resolve();
  h.ipc('open-settings');h.ipc('panel-resize',{type:'begin'});
  h.ipc('panel-resize',{type:'update',width:620,height:700});h.ipc('panel-resize',{type:'end'});
  h.run('globalThis.releaseFirst();');await pending;await new Promise(resolve=>setImmediate(resolve));
  const disk=JSON.parse(h.writes.filter(w=>w.file==='panel-preferences.json').at(-1).value);
  assert.equal(disk.dockBottomRight,true);assert.equal(disk.width,620);assert.equal(disk.height,700);
});
