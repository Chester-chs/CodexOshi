const {test}=require('node:test');const assert=require('node:assert/strict');
const {present,countdown}=require('../desktop/ui/view-model.js');
test('0/1/2 actual windows render and compact chooses the limiting window',()=>{
  assert.equal(present({windows:[]},160,0).empty,'暂无可用额度数据');
  const q={windows:[{id:'primary',label:'每周限额',remainingPercent:65,resetAt:90000}]};
  assert.equal(present(q,160,0).compact.label,'每周限额');assert.equal(present(q,160,0).cards.length,1);
  q.windows.push({id:'secondary',label:'5 小时限额',remainingPercent:18,resetAt:18000});
  const v=present(q,160,0);assert.equal(v.cards.length,2);assert.equal(v.compact.remainingPercent,18);
});
test('remaining thresholds and narrow-width downgrade use real remaining values',()=>{
  for(const [percent,tone] of [[21,'normal'],[20,'orange'],[11,'orange'],[10,'red'],[0,'red']]) {
    const v=present({windows:[{remainingPercent:percent}]},119,0);assert.equal(v.compact.tone,tone);assert.equal(v.showCompactBar,false);
  }
  assert.equal(present({windows:[{remainingPercent:65}]},120,0).showCompactBar,true);
});
test('countdown decreases and an expired deadline never restores quota',()=>{
  assert.equal(countdown(90000,0),'1 天 1 小时后重置');assert.equal(countdown(90000,3600000),'1 天 0 小时后重置');
  const v=present({windows:[{remainingPercent:3,resetAt:1}]},160,2000);
  assert.equal(v.cards[0].resetText,'等待更新');assert.equal(v.cards[0].remainingPercent,3);
});
