const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const electron=process.env.CODI_TEST_ELECTRON||path.join(process.env.USERPROFILE,'.codex/codex-quota-widget/desktop-runtime/node_modules/electron/dist/electron.exe');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'oshi-responsive-pin-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(electron,[path.join(__dirname,'responsive-pin-ui.cjs'),'--output',output],{env,windowsHide:true,timeout:20000});
let evidence,error=result.error?.message;
try{evidence=JSON.parse(fs.readFileSync(path.join(output,'result.json'),'utf8'));}catch{}
try{error=fs.readFileSync(path.join(output,'error.txt'),'utf8');}catch{}
console.log(JSON.stringify({output,passed:evidence?.passed===true,exitCode:result.status,error},null,2));
assert.ok(result.status===0&&evidence?.passed===true,'Responsive pin UI failed');
