(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.tokenChart=api;})(globalThis,()=>{
  function compact(value){return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value);}
  function presentSeries(snapshot,key='hours24',language='zh-CN'){
    const view=snapshot?.series?.[key],bins=view?.bins;
    if(!Array.isArray(bins)||!bins.length||bins.length>30||!bins.every((b,i)=>Number.isFinite(b.start)&&Number.isFinite(b.end)&&b.end>=b.start&&Number.isSafeInteger(b.value)&&b.value>=0&&(!i||b.start>=bins[i-1].end)))return {known:false,bins:[]};
    const total=bins.reduce((sum,b)=>sum+b.value,0);if(!Number.isSafeInteger(total)||total!==view.total)return {known:false,bins:[]};
    const max=Math.max(1,...bins.map(b=>b.value)),power=10**Math.floor(Math.log10(max)),scale=[1,2,5,10].find(n=>n*power>=max)*power;
    const formatter=new Intl.DateTimeFormat(language,view.period==='hour'?{hour:'2-digit',minute:'2-digit',hour12:false}:{month:'numeric',day:'numeric'});
    const full=new Intl.DateTimeFormat(language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'});
    const exact=n=>new Intl.NumberFormat(language).format(n);
    return {known:true,total:exact(total),number:compact(total),scale,ticks:[0,.25,.5,.75,1].map(n=>({percent:n*100,label:compact(scale*n)})),
      bins:bins.map(b=>({...b,label:formatter.format(new Date(b.start)),percent:b.value/scale*100,tooltip:full.format(new Date(b.start))+' – '+full.format(new Date(b.end))+' · '+exact(b.value)+' tokens'}))};
  }
  return {presentSeries,compact};
});
