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

test('custom card colors persist exactly while derived text remains readable on light and dark surfaces',()=>{
  for(const [base,accent] of [['#fafafa','#eeeeee'],['#101010','#181818'],['#ff0000','#00ff00'],['#808080','#808080']]){
    const value={palette:'custom',base,accent},theme=model.resolve(value);
    assert.deepEqual(theme.settings,value);assert.equal(theme.variables['--bg-base'],base);
    for(const [text,backgrounds] of theme.contrastPairs)for(const background of backgrounds)assert.ok(model.contrast(text,background)>=4.5);
  }
  for(const value of [{palette:'custom',base:'red',accent:'#ffffff'},{palette:'custom',base:'#ffffff',accent:'url(x)'},{palette:'custom',base:'#ffffff'},{palette:'oat',base:'#ffffff',accent:'#000000'}])assert.throws(()=>model.validate(value));
});
