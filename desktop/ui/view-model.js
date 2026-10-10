(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./i18n.js'));else root.quotaView=factory(root.uiText);})(globalThis,(i18n)=>{
  function countdown(resetAt,now=Date.now(),language='zh-CN'){
    if(!Number.isFinite(resetAt))return i18n.t('重置时间未知',{},language);
    const hours=Math.floor((resetAt*1000-now)/3600000);
    if(resetAt*1000<=now)return i18n.t('等待更新',{},language);
    return i18n.t('{days} 天 {hours} 小时后重置',{days:Math.floor(hours/24),hours:hours%24},language);
  }
  const tone=p=>p===null?'unknown':p>20?'normal':p>10?'orange':'red';
  const percent=p=>p===null?'未知':Math.round(p)+'%';
  function present(quota,width,now=Date.now(),language='zh-CN'){
    const text=value=>i18n.t(value,{},language),displayPercent=p=>p===null?text('未知'):percent(p);
    const windows=Array.isArray(quota?.windows)?quota.windows:[];
    const selected=windows.filter(w=>Number.isFinite(w.remainingPercent)).sort((a,b)=>a.remainingPercent-b.remainingPercent)[0] || windows[0];
    return {empty:windows.length?'':text('暂无可用额度数据'),showCompactBar:width>=120&&Number.isFinite(selected?.remainingPercent),
      compact:{label:text(selected?.label || '暂无可用额度数据'),text:selected?displayPercent(selected.remainingPercent):text('暂无可用额度数据'),remainingPercent:selected?.remainingPercent??null,tone:tone(selected?.remainingPercent??null)},
      cards:windows.map(w=>({...w,label:text(w.label),percentText:displayPercent(w.remainingPercent),resetText:countdown(w.resetAt,now,language),tone:tone(w.remainingPercent)}))};
  }
  function presentTokens(tokens,language='zh-CN'){
    const names={hours24:'最近 24 小时',days7:'最近 7 天',days30:'最近 30 天'},max=tokens?.values?.days30;
    const rows=Object.entries(names).map(([key,label])=>{
      const value=tokens?.values?.[key],known=Number.isSafeInteger(value)&&value>=0;
      const divisor=known?(value>=999950000?1e9:value>=999950?1e6:value>=1000?1e3:1):1;
      return {label:i18n.t(label,{},language),text:known?new Intl.NumberFormat('en-US').format(value):'—',number:known?(divisor===1?String(value):(value/divisor).toFixed(1)):'—',unit:{1000:'K',1000000:'M',1000000000:'B'}[divisor]||'',percent:known&&max>0?Math.min(100,value/max*100):0,known};
    });
    const label={indexing:'索引中',partial:'部分覆盖',complete:'完成'}[tokens?.coverage] || '索引中';
    return {rows,coverageText:i18n.t('{state} · {indexed}/{total} 个文件',{state:i18n.t(label,{},language),indexed:tokens?.filesIndexed||0,total:tokens?.filesDiscovered||0},language)};
  }
  return {present,countdown,presentTokens};
});
