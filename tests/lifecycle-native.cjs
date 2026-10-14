const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const data=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'codex-quota-widget');
const electron=process.env.CODI_TEST_ELECTRON||path.join(data,'desktop-runtime','node_modules','electron','dist','electron.exe');
assert.ok(fs.existsSync(electron),'Install the Electron runtime before native verification');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codioshi-lifecycle-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const results=[];
for(const scenario of ['external-hide','heartbeat-gap','slow-start','startup-work']){
  const output=path.join(root,scenario);fs.mkdirSync(output);
  const child=spawnSync(electron,[path.join(__dirname,'lifecycle-ui-smoke.cjs'),'--output',output,'--case',scenario],{env,windowsHide:true,encoding:'utf8',timeout:25000});
  let evidence=null;try{evidence=JSON.parse(fs.readFileSync(path.join(output,'result.json'),'utf8'));}catch{}
  let error=child.error?.message||child.stderr?.slice(-800)||null;try{error=fs.readFileSync(path.join(output,'error.txt'),'utf8');}catch{}
  results.push({scenario,passed:child.status===0&&evidence?.passed===true,exitCode:child.status,error,evidence});
}
console.log(JSON.stringify({output:root,results},null,2));
assert.ok(results.every(result=>result.passed),'Electron lifecycle regression failed');
