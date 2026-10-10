(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.portraitGeometry=api;})(globalThis,()=>{
  const LIMIT={width:672,height:420},DEFAULT={width:199,height:280};
  function portraitSize(cw,ch,targetHeight=280){
    if(![cw,ch].every(n=>Number.isFinite(n)&&n>0&&n<=4096))return {...DEFAULT};
    const h=Math.round(Number.isFinite(targetHeight)?Math.max(180,Math.min(420,targetHeight)):280),ratio=cw/ch;
    const width=Math.max(Math.round(h*.45),Math.min(Math.round(h*1.6),Math.round(h*ratio)));
    // Keep the computed ratio in normal cases. Extreme ratios fit via contain;
    // the overlay itself stays bounded and tall enough for the readable footer.
    const clamped=width!==Math.round(h*ratio);
    return {width,height:clamped?Math.max(48,Math.min(LIMIT.height,Math.round(width/ratio))):h};
  }
  return {portraitSize,LIMIT,DEFAULT};
});
