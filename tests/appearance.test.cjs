const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const theme=require('../desktop/ui/appearance-model.js');
const {AppearanceStore}=require('../runtime/appearance.cjs');
test('CSS color declarations use tokens and resources stay local',async()=>{
  const css=await fs.readFile(path.resolve(__dirname,'../desktop/ui/style.css'),'utf8');
  for(const match of css.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]+)/g))if(!match[1].startsWith('--'))assert.doesNotMatch(match[2],/#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(|\b(?:transparent|white|black)\b/i,match[0]);
  assert.match(css,/--font-system:[^;]*"Noto Sans SC"[^;]*sans-serif;/);
  assert.doesNotMatch(css,/@import|url\(|backdrop-filter/);assert.match(css,/:focus-visible/);assert.doesNotMatch(css,/prefers-color-scheme:dark/);
});
test('curated palettes reject arbitrary colors and obsolete display controls',()=>{
  assert.deepEqual(theme.validate({palette:'sage'}),{palette:'sage'});
  for(const patch of [{mode:'dark'},{accent:'#248a3d'},{palette:'unknown'},{surface:'image'},{path:'elsewhere'}])assert.throws(()=>theme.validate({...theme.defaults(),...patch}));
});
test('every paired palette keeps readable text including translucent resident host extremes',()=>{
  for(const palette of theme.palettes){const q=theme.resolve({palette:palette.id});for(const [f,backgrounds]of q.contrastPairs)for(const b of backgrounds)assert.ok(theme.contrast(f,b)>=4.5,`${palette.id}: ${f} on ${b}`);}
});
test('appearance persistence reloads independently, rejects corruption/links, and never changes character or position files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-appearance-'));
  try{
    const store=new AppearanceStore(root);assert.deepEqual(await store.read(),theme.defaults());
    await fs.writeFile(path.join(root,'position.json'),'{"x":100,"y":200}');await fs.mkdir(path.join(root,'characters'));await fs.writeFile(path.join(root,'characters','active.json'),'{"name":"preserve"}');
    const settings={palette:'forest'};await store.save(settings);assert.deepEqual(await new AppearanceStore(root).read(),settings);
    const custom={palette:'custom',base:'#112233',accent:'#ddccaa'};await store.save(custom);assert.deepEqual(await new AppearanceStore(root).read(),custom);await store.save(settings);
    assert.equal(await fs.readFile(path.join(root,'position.json'),'utf8'),'{"x":100,"y":200}');assert.equal(await fs.readFile(path.join(root,'characters','active.json'),'utf8'),'{"name":"preserve"}');
    await assert.rejects(store.save({palette:'invalid'}));assert.deepEqual(await store.read(),settings);
    const legacy='{"mode":"light","accent":"#248a3d","surface":"cream"}';await fs.writeFile(store.file,legacy);assert.deepEqual(await store.read(),{palette:'sage'});assert.equal(await fs.readFile(store.file,'utf8'),legacy);
    await fs.writeFile(store.file,'not JSON');assert.deepEqual(await store.read(),theme.defaults());
    await fs.writeFile(store.file,'x'.repeat(8192));assert.deepEqual(await store.read(),theme.defaults());
    await fs.unlink(store.file);await fs.symlink(path.join(root,'characters'),store.file,'junction');await assert.rejects(store.save(settings),/链接/);assert.equal(await fs.readFile(path.join(root,'position.json'),'utf8'),'{"x":100,"y":200}');
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
