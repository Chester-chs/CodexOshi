const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('installation caches the native API and source changes invalidate it',{skip:process.platform!=='win32'},()=>{
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'window-api-cache.ps1')],{encoding:'utf8',windowsHide:true,timeout:20000});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
