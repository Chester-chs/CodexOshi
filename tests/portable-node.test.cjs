const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('runtime updates prefer the bundled Node installation without a system Node',async t=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'codi-portable-node-'));
  t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
  const node=path.join(data,'node-runtime','node.exe');
  const npm=path.join(data,'node-runtime','node_modules','npm','bin','npm-cli.js');
  fs.mkdirSync(path.dirname(npm),{recursive:true});
  fs.writeFileSync(node,'fixture');
  fs.writeFileSync(npm,'fixture');
  const {findInstallNode}=require('../runtime/update-service.cjs');
  const found=await findInstallNode(data,async()=>{throw Error('where.exe must not be needed');});
  assert.equal(found,node);
});
