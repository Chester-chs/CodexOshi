(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.quotaView=factory();})(globalThis,()=>{
  function countdown(resetAt,now=Date.now()){
    if(!Number.isFinite(resetAt))return '重置时间未知';
    const hours=Math.floor((resetAt*1000-now)/3600000);
    if(resetAt*1000<=now)return '等待更新';
    return Math.floor(hours/24)+' 天 '+hours%24+' 小时后重置';
  }
  const tone=p=>p===null?'unknown':p>20?'normal':p>10?'orange':'red';
  const percent=p=>p===null?'未知':Math.round(p)+'%';
  function present(quota,width,now=Date.now()){
    const windows=Array.isArray(quota?.windows)?quota.windows:[];
    const selected=windows.filter(w=>Number.isFinite(w.remainingPercent)).sort((a,b)=>a.remainingPercent-b.remainingPercent)[0] || windows[0];
    return {empty:windows.length?'':'暂无可用额度数据',showCompactBar:width>=120&&Number.isFinite(selected?.remainingPercent),
      compact:{label:selected?.label || '暂无可用额度数据',text:selected?percent(selected.remainingPercent):'暂无可用额度数据',remainingPercent:selected?.remainingPercent??null,tone:tone(selected?.remainingPercent??null)},
      cards:windows.map(w=>({...w,percentText:percent(w.remainingPercent),resetText:countdown(w.resetAt,now),tone:tone(w.remainingPercent)}))};
  }
  function presentTokens(tokens){
    const names={hours24:'最近 24 小时',days7:'最近 7 天',days30:'最近 30 天'},max=tokens?.values?.days30;
    const rows=Object.entries(names).map(([key,label])=>{
      const value=tokens?.values?.[key],known=Number.isSafeInteger(value)&&value>=0;
      return {label,text:known?new Intl.NumberFormat('en-US').format(value):'—',percent:known&&max>0?Math.min(100,value/max*100):0,known};
    });
    const label={indexing:'索引中',partial:'部分覆盖',complete:'完成'}[tokens?.coverage] || '索引中';
    return {rows,coverageText:label+' · '+(tokens?.filesIndexed || 0)+'/'+(tokens?.filesDiscovered || 0)+' 个文件'};
  }
  return {present,countdown,presentTokens};
});
