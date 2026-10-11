(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.newsModel=api;})(globalThis,()=>{
  function recentNotice(notice,now=Date.now()){
    return notice&&Number.isFinite(notice.createdAt)&&notice.createdAt>=now-7*86400000?notice:null;
  }
  function localTime(at,language='zh-CN',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
    if(!Number.isFinite(at))return '';
    return new Intl.DateTimeFormat(language,{timeZone,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(at)+' · '+timeZone;
  }
  function noticeText(notice,language='zh-CN',now=Date.now()){
    const en=language==='en-US';if(!notice)return en?'No recent reset announcement found.':'暂无近期重置公告。';
    if(notice.resetAt)return (notice.resetAt>now?(notice.approximate?(en?'Estimated reset: ':'公告预计重置时间：'):(en?'Announced reset: ':'公告重置时间：')):(en?'Announced time has passed: ':'公告时间已过：'))+localTime(notice.resetAt,language);
    if(notice.kind==='announced')return en?'Tibo announced a reset; no exact effective time was provided.':'Tibo 已宣布重置，未提供具体生效时间。';
    return en?'Reset mentioned; the exact date, time or timezone is not confirmed.':'公告提及重置，具体日期、时间或时区尚未明确。';
  }
  return {localTime,noticeText,recentNotice};
});
