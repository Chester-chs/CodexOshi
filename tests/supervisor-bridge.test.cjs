const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{spawnSync}=require('node:child_process');

test('a disconnected Electron pipe cannot stop supervisor bridge cleanup',()=>{
  const script=path.join(__dirname,'supervisor-bridge.ps1');
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/bridge cleanup continued/);
});
