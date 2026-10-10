const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const theme=require('../desktop/ui/appearance-model.js');
const {AppearanceStore}=require('../runtime/appearance.cjs');
test('CSS color declarations use tokens and resources stay local',async()=>{
  const css=await fs.readFile(path.resolve(__dirname,'../desktop/ui/style.css'),'utf8');
  for(const match of css.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]+)/g))if(!match[1].startsWith('--'))assert.doesNotMatch(match[2],/#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(|\b(?:transparent|white|black)\b/i,match[0]);
  assert.match(css,/-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif/);
  assert.doesNotMatch(css,/@import|url\(|backdrop-filter/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-color-scheme:dark/);
});
test('appearance defaults follow the system and reject unsafe color/settings values',()=>{
  assert.deepEqual(theme.defaults(),{mode:'system',accent:'#007aff',surface:'theme'});
  assert.equal(theme.validate({mode:'dark',accent:'#AbCdEf',surface:'cream'}).accent,'#abcdef');
  for(const patch of [{mode:'auto'},{accent:'red'},{accent:'url(file:///x)'},{accent:'#fff'},{surface:'image'},{path:'elsewhere'}])assert.throws(()=>theme.validate({...theme.defaults(),...patch}));
});
test('all system/manual modes, surfaces and accents keep readable text including transparent host extremes',()=>{
  for(const mode of ['system','light','dark'])for(const dark of [false,true])for(const surface of theme.surfaces)for(const preset of theme.accents){
    const resolved=theme.resolve({mode,accent:preset.color,surface:surface.id},dark);
    assert.equal(resolved.mode,mode==='system'?(dark?'dark':'light'):mode);
    for(const [foreground,backgrounds]of resolved.contrastPairs)for(const background of backgrounds)assert.ok(theme.contrast(foreground,background)>=4.5,`${mode}/${surface.id}/${preset.id} ${foreground} on ${background}`);
  }
  for(const accent of ['#ffffff','#000000','#ffff00','#00ffff','#808080','#ff00ff','#f5f5f7','#242426'])for(const dark of [false,true]){
    const q=theme.resolve({mode:'system',accent,surface:'translucent'},dark);
    for(const [foreground,backgrounds]of q.contrastPairs)for(const background of backgrounds)assert.ok(theme.contrast(foreground,background)>=4.5);
  }
});
test('appearance persistence reloads independently, rejects corruption/links, and never changes character or position files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'widget-appearance-'));
  try{
    const store=new AppearanceStore(root);assert.deepEqual(await store.read(),theme.defaults());
    await fs.writeFile(path.join(root,'position.json'),'{"x":100,"y":200}');await fs.mkdir(path.join(root,'characters'));await fs.writeFile(path.join(root,'characters','active.json'),'{"name":"preserve"}');
    const settings={mode:'dark',accent:'#ba45cf',surface:'cream'};await store.save(settings);assert.deepEqual(await new AppearanceStore(root).read(),settings);
    assert.equal(await fs.readFile(path.join(root,'position.json'),'utf8'),'{"x":100,"y":200}');assert.equal(await fs.readFile(path.join(root,'characters','active.json'),'utf8'),'{"name":"preserve"}');
    await assert.rejects(store.save({...settings,accent:'invalid'}));assert.deepEqual(await store.read(),settings);
    await fs.writeFile(store.file,'not JSON');assert.deepEqual(await store.read(),theme.defaults());
    await fs.writeFile(store.file,'x'.repeat(8192));assert.deepEqual(await store.read(),theme.defaults());
    await fs.unlink(store.file);await fs.symlink(path.join(root,'characters'),store.file,'junction');await assert.rejects(store.save(settings),/链接/);assert.equal(await fs.readFile(path.join(root,'position.json'),'utf8'),'{"x":100,"y":200}');
  }finally{assert.equal(path.dirname(root),os.tmpdir());await fs.rm(root,{recursive:true,force:true});}
});
