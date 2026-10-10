const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../desktop/ui/appearance-model.js');
test('one palette controls the card and accent together and is independent of system appearance',()=>{
  assert.deepEqual(model.defaults(),{palette:'oat'});
  const oat=model.resolve({palette:'oat'}),sage=model.resolve({palette:'sage'});
  assert.notEqual(oat.variables['--bg-base'],sage.variables['--bg-base']);assert.notEqual(oat.variables['--accent'],sage.variables['--accent']);
  assert.deepEqual(model.resolve({palette:'sage'},false),model.resolve({palette:'sage'},true));
  for(const value of [{palette:'unknown'},{palette:'sage',mode:'dark'},{palette:'url(file:///x)'},null])assert.throws(()=>model.validate(value));
});
test('legacy appearance maps to a curated palette without rewriting the input',()=>{
  const old={mode:'light',accent:'#248a3d',surface:'cream'},copy=JSON.stringify(old);
  assert.deepEqual(model.migrate(old),{palette:'sage'});assert.equal(JSON.stringify(old),copy);
  assert.deepEqual(model.migrate({mode:'dark',accent:'#007aff',surface:'theme'}),{palette:'midnight'});
  assert.deepEqual(model.migrate({palette:'rose'}),{palette:'rose'});
});
