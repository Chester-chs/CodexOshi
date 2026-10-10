(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.characterView=api;})(globalThis,()=>{
  function characterState(windows){const values=(windows||[]).map(w=>w.remainingPercent).filter(Number.isFinite);if(!values.length)return null;const p=Math.min(...values);return p>50?'ready':p>20?'tired':p>5?'low':'exhausted';}
  function characterView(role,state){
    const dedicated=state&&role?.images?.[state],fallback=!dedicated,url=state?(dedicated?.url||role?.images?.ready?.url||'character://placeholder/ready'):'character://placeholder/ready';
    const looks={ready:{filter:'none',scale:1},tired:{filter:'saturate(.72)',scale:1},low:{filter:'saturate(.42)',scale:.94},exhausted:{filter:'grayscale(1) opacity(.65)',scale:.94}};
    return {url,fallback,settings:role?.settings||{background:true,zoom:1,x:0,y:0},...(state&&fallback?looks[state]:{filter:'none',scale:1}),state};
  }
  return {characterState,characterView};
});
