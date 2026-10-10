const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('inline color picker maps saturation/value positions and hue to exact user colors',()=>{
  // Loaded when present so this regression initially fails as a missing capability.
  const filename=path.resolve(__dirname,'../desktop/ui/color-picker-model.js');
  const sandbox={module:{exports:{}}};if(fs.existsSync(filename))vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox);
  const model=sandbox.module.exports;assert.equal(typeof model.toHex,'function');
  for(const [h,s,v,hex] of [[0,1,1,'#ff0000'],[120,1,1,'#00ff00'],[240,1,1,'#0000ff'],[60,1,1,'#ffff00'],[180,1,1,'#00ffff'],[0,0,1,'#ffffff'],[0,0,.5,'#808080'],[360,1,1,'#ff0000']])assert.equal(model.toHex({h,s,v}),hex);
  for(const hex of ['#102030','#e9e5df','#786c60','#ff0088','#ffffff','#000000'])assert.equal(model.toHex(model.fromHex(hex)),hex);
});
