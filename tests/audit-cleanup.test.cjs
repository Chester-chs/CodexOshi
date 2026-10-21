const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {NewsService}=require('../runtime/news-service.cjs');
const {UpdateService}=require('../runtime/update-service.cjs');

async function directory(t){const root=await fsp.mkdtemp(path.join(os.tmpdir(),'codexoshi-audit-io-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());return fsp.rm(root,{recursive:true,force:true});});return root;}

test('failed announcement preference save restores the previous enabled choice',async t=>{
  const root=await directory(t),service=new NewsService({data:root,version:'0.3.7'});
  const rename=fs.renameSync;
  fs.renameSync=()=>{throw Error('read-only');};
  try{assert.throws(()=>service.configure(false),/read-only/);assert.equal(service.snapshot().enabled,true);}
  finally{fs.renameSync=rename;service.close();}
});

test('failed update state replacement does not leave a partial temporary file',async t=>{
  const root=await directory(t),service=new UpdateService({data:root,appRoot:root,currentVersion:'0.3.7'});
  const rename=fs.renameSync;
  fs.renameSync=()=>{throw Error('read-only');};
  try{
    assert.equal(service.start().ok,false);
    assert.deepEqual((await fsp.readdir(root)).filter(name=>name.endsWith('.tmp')),[]);
  }finally{fs.renameSync=rename;service.close();}
});
