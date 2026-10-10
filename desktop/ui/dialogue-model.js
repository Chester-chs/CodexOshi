(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.dialogueModel=factory();})(globalThis,()=>{
  function presets(language='zh-CN'){
    const en=language==='en-US';
    return [
      [
        ['gentle','温柔提醒','{称呼}，再过{重置时间}，额度就重置啦。','{称呼}, your quota resets in {重置时间}.'],
        ['brief','简洁播报','{称呼}，重置倒计时：{重置时间}。','{称呼}, reset countdown: {重置时间}.'],
        ['patient','耐心等待','{称呼}，还有{重置时间}就重置啦，我们慢慢来。','{称呼}, the next reset is in {重置时间}. Take your time.']
      ],
      [
        ['encourage','积极鼓励','{称呼}，每一步都算数，继续按自己的节奏前进吧！','{称呼}, every step counts. Keep going at your own pace!'],
        ['focus','专注向前','{称呼}，把眼前这一步做好，离目标就更近啦！','{称呼}, focus on this step. You are getting closer!'],
        ['rest','休息关怀','{称呼}，辛苦啦！休息一下，回来继续加油。','{称呼}, well done! Take a break, then come back refreshed.'],
        ['company','温柔陪伴','{称呼}，不用着急，我会陪你一点点完成。','{称呼}, there is no rush. We can take it one step at a time.']
      ]
    ].map(rows=>rows.map(([id,label,zh,english])=>({id,label,template:en?english:zh})));
  }
  const defaults=()=>({address:'主人',lines:[presets()[0][0].template,presets()[1][0].template]});
  function validate(v){
    if(!v||Object.keys(v).some(k=>!['address','lines'].includes(k))||typeof v.address!=='string'||!v.address.trim()||v.address.length>32||!Array.isArray(v.lines)||v.lines.length!==2||[0,1].some(i=>typeof v.lines[i]!=='string'||!v.lines[i].trim()||v.lines[i].length>240))throw Error('请填写两段对话，每段最多 240 字。');
    return {address:v.address.trim(),lines:v.lines.map(s=>s.trim())};
  }
  function upgrade(value){
    const v=validate(value),old=['{称呼}，{重置时间}。','{称呼}，额度消耗好快呀，记得歇一歇。'],next=defaults();
    return {...v,lines:v.lines.map((line,i)=>line===old[i]?next.lines[i]:line)};
  }
  function present(v,index,quota,now=Date.now(),language='zh-CN'){
    const en=language==='en-US',unknown=en?'Unknown':'未知';
    const windows=Array.isArray(quota?.windows)?quota.windows:[];
    const selected=windows.filter(w=>Number.isFinite(w.remainingPercent)).sort((a,b)=>a.remainingPercent-b.remainingPercent)[0]||windows[0];
    const seconds=Number.isFinite(selected?.resetAt)?Math.max(0,Math.ceil(selected.resetAt-now/1000)):null;
    const days=seconds===null?0:Math.floor(seconds/86400),hours=seconds===null?0:Math.floor(seconds%86400/3600),minutes=seconds===null?0:Math.floor(seconds%3600/60);
    const reset=seconds===null?(en?'Reset time unknown':'重置时间未知'):seconds===0?(en?'Waiting for update':'等待更新'):en?`Resets in ${days?days+'d ':''}${hours}h ${minutes}m`:`${days?days+' 天 ':''}${hours} 小时 ${minutes} 分钟后重置`;
    const resetDuration=seconds===null?unknown:seconds===0?(en?'Waiting for update':'等待更新'):days?(en?`${days}d ${hours}h`:`${days}天${hours}小时`):hours?(en?`${hours}h${minutes?' '+minutes+'m':''}`:`${hours}小时${minutes?minutes+'分钟':''}`):minutes?(en?`${minutes}m`:`${minutes}分钟`):(en?`${seconds}s`:`${seconds}秒`);
    const remaining=Number.isFinite(selected?.remainingPercent)?Math.round(selected.remainingPercent)+'%':unknown;
    const count=Number.isSafeInteger(quota?.resetCredits?.availableCount)&&quota.resetCredits.availableCount>=0?String(quota.resetCredits.availableCount):unknown;
    const values={'称呼':v.address,'剩余额度':remaining,'重置时间':resetDuration,'重置卡次数':count};
    let template=v.lines[index===1?1:0];
    if(index!==1&&(seconds===null||seconds===0)){
      const matches=p=>p.template===template||p.template.replace(/\{称呼\}/g,()=>v.address)===template;
      const builtin=presets()[0].some(matches)||presets('en-US')[0].some(matches);
      if(builtin){const english=presets('en-US')[0].some(matches);template=seconds===null?(english?'{称呼}, the reset time is unavailable. I will check again.':'{称呼}，暂时还没查到重置时间，再等等我哦。'):(english?'{称呼}, the reset time has arrived. Let me refresh the quota.':'{称呼}，重置时间到了，等我更新一下额度哦。');}
    }
    return {line:template.replace(/\{(称呼|剩余额度|重置时间|重置卡次数)\}/g,(_,key)=>values[key]),reset,resetDuration,remaining,count,stale:Boolean(quota?.resetCredits?.stale)};
  }
  return {defaults,validate,upgrade,presets,present};
});
