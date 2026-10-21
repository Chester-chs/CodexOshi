(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.newsModel=api;})(globalThis,()=>{
  function localTime(at,language='zh-CN',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
    if(!Number.isFinite(at))return '';
    return new Intl.DateTimeFormat(language,{timeZone,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(at)+' · '+timeZone;
  }
  return {localTime};
});
