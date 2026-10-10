(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.dialogueModel=factory();})(globalThis,()=>{
  const defaults=()=>({address:'主人',lines:['{称呼}，{重置时间}。','{称呼}，额度消耗好快呀，记得歇一歇。']});
  function validate(v){
    if(!v||Object.keys(v).some(k=>!['address','lines'].includes(k))||typeof v.address!=='string'||!v.address.trim()||v.address.length>32||!Array.isArray(v.lines)||v.lines.length!==2||[0,1].some(i=>typeof v.lines[i]!=='string'||!v.lines[i].trim()||v.lines[i].length>240))throw Error('请填写称呼和两段对话；称呼最多 32 字，对话每段最多 240 字。');
    return {address:v.address.trim(),lines:v.lines.map(s=>s.trim())};
  }
  function present(v,index,quota,now=Date.now(),language='zh-CN'){
    const en=language==='en-US',unknown=en?'Unknown':'未知';
    const windows=Array.isArray(quota?.windows)?quota.windows:[];
    const selected=windows.filter(w=>Number.isFinite(w.remainingPercent)).sort((a,b)=>a.remainingPercent-b.remainingPercent)[0]||windows[0];
    const seconds=Number.isFinite(selected?.resetAt)?Math.max(0,Math.ceil(selected.resetAt-now/1000)):null;
    const days=seconds===null?0:Math.floor(seconds/86400),hours=seconds===null?0:Math.floor(seconds%86400/3600),minutes=seconds===null?0:Math.floor(seconds%3600/60);
    const reset=seconds===null?(en?'Reset time unknown':'重置时间未知'):seconds===0?(en?'Waiting for update':'等待更新'):en?`Resets in ${days?days+'d ':''}${hours}h ${minutes}m`:`${days?days+' 天 ':''}${hours} 小时 ${minutes} 分钟后重置`;
    const remaining=Number.isFinite(selected?.remainingPercent)?Math.round(selected.remainingPercent)+'%':unknown;
    const count=Number.isSafeInteger(quota?.resetCredits?.availableCount)&&quota.resetCredits.availableCount>=0?String(quota.resetCredits.availableCount):unknown;
    const values={'称呼':v.address,'剩余额度':remaining,'重置时间':reset,'重置卡次数':count};
    return {line:v.lines[index===1?1:0].replace(/\{(称呼|剩余额度|重置时间|重置卡次数)\}/g,(_,key)=>values[key]),reset,remaining,count,stale:Boolean(quota?.resetCredits?.stale)};
  }
  return {defaults,validate,present};
});
