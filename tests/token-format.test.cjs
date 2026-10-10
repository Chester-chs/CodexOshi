const {test}=require('node:test'),assert=require('node:assert/strict');
const {presentTokens}=require('../desktop/ui/view-model.js');
test('token overview abbreviates large counts while preserving exact counts and comparison ratios',()=>{
  const v=presentTokens({values:{hours24:127082579,days7:349858297,days30:721904248}});
  assert.deepEqual(v.rows.map(r=>[r.number,r.unit,r.text]),[['127.1','M','127,082,579'],['349.9','M','349,858,297'],['721.9','M','721,904,248']]);
  assert.equal(v.rows[2].percent,100);assert.ok(Math.abs(v.rows[0].percent-17.60380033)<0.000001);
});
test('compact units round across boundaries and keep zero distinct from missing or invalid tokens',()=>{
  for(const [count,number,unit]of [[0,'0',''],[999,'999',''],[1200,'1.2','K'],[999949,'999.9','K'],[999950,'1.0','M'],[1000000,'1.0','M'],[999950000,'1.0','B'],[Number.MAX_SAFE_INTEGER,'9007199.3','B']]){
    const row=presentTokens({values:{hours24:count}}).rows[0];assert.equal(row.number,number);assert.equal(row.unit,unit);assert.equal(row.known,true);
  }
  for(const count of [null,undefined,-1,NaN,Infinity,12.5,Number.MAX_SAFE_INTEGER+1]){const row=presentTokens({values:{hours24:count}}).rows[0];assert.equal(row.number,'—');assert.equal(row.unit,'');assert.equal(row.known,false);assert.equal(row.text,'—');}
});
