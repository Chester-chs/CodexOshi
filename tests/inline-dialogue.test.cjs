const {test}=require('node:test'),assert=require('node:assert/strict'),{mainHarness}=require('./main-harness.cjs');
test('inline editing is permitted only while settings are open, and ends on dismissal or portrait click',async()=>{
  const h=await mainHarness();h.run('win.setTitle=value=>win.title=value;win.focus=()=>{}');
  assert.equal((await h.ipc('dialogue-focus',true)).ok,false);h.ipc('open-settings');
  assert.equal((await h.ipc('dialogue-focus',true)).ok,true);assert.equal(h.run('textEditing'),true);assert.match(h.run('win.title'),/Text editing/);
  h.ipc('collapse');assert.equal(h.run('textEditing'),false);assert.equal(h.run('win.title'),'Codex Quota Widget');
  h.ipc('open-settings');await h.ipc('dialogue-focus',true);h.gesture({type:'click'});assert.equal(h.run('textEditing'),false);
  assert.equal(h.hasHandler('dialogue-edit'),false,'No secondary editor launch route');
});
