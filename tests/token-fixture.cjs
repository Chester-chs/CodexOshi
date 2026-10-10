const {timeSeries}=require('../runtime/tokens.cjs');
module.exports=function fixture(now=Date.now()){
  const increments=[];for(let days=29;days>=0;days--)for(let hour=0;hour<24;hour++){
    const d=new Date(now);d.setHours(hour,0,0,0);d.setDate(d.getDate()-days);
    if(d.getTime()<=now)increments.push({at:d.getTime(),value:(hour%7+1)*(days%5+1)*13540});
  }
  return {series:timeSeries([{increments}],now),coverage:'complete',filesIndexed:12,filesDiscovered:12,observedAt:now};
};
