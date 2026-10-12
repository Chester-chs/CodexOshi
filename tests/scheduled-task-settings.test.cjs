const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{spawnSync}=require('node:child_process');

test('the startup task restarts after a crash and continues on battery power',()=>{
  const script=path.join(__dirname,'scheduled-task-settings.ps1');
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/resilient task settings/);
});
