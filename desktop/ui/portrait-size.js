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
  // At <=1x keep the entire image. At >1x frame a selected source area;
  // the footer remains outside this drawing viewport in either mode.
  function portraitFrame(width,height,bw,bh,settings={}){
    const inset=Math.min(4,width/4,height/4),availableW=width-inset*2,availableH=height-inset*2;
    const zoom=Number.isFinite(settings.zoom)?Math.max(.5,Math.min(3,settings.zoom)):1;
    const ratio=Math.min(availableW/bw,availableH/bh)*zoom,w=bw*ratio,h=bh*ratio;
    const pan=k=>Number.isFinite(settings[k])?Math.max(-1,Math.min(1,settings[k])):0;
    const x=inset+(availableW-w)/2+pan('x')*Math.abs(availableW-w)/2,y=inset+(availableH-h)/2+pan('y')*Math.abs(availableH-h)/2;
    if(zoom<=1)return {x,y,width:w,height:h};
    const left=Math.max(inset,x),top=Math.max(inset,y),right=Math.min(width-inset,x+w),bottom=Math.min(height-inset,y+h);
    return {x:left,y:top,width:right-left,height:bottom-top,source:{x:Math.max(0,(left-x)/ratio),y:Math.max(0,(top-y)/ratio),width:(right-left)/ratio,height:(bottom-top)/ratio}};
  }
  const stageHeight=height=>Math.max(1,height-52);
  return {portraitSize,portraitFrame,stageHeight,LIMIT,DEFAULT};
});
