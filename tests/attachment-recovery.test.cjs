const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('supervisor retries failed hooks on the same host with bounded backoff',{skip:process.platform!=='win32'},()=>{
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'attachment-recovery.ps1')],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
