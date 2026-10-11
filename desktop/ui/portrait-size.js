(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.portraitGeometry=api;})(globalThis,()=>{
  const LIMIT={width:672,height:420},DEFAULT={width:199,height:280};
  function portraitSize(cw,ch,targetHeight=280,framed=false){
    if(![cw,ch].every(n=>Number.isFinite(n)&&n>0&&n<=4096))return {...DEFAULT};
    const h=Math.round(Number.isFinite(targetHeight)?Math.max(180,Math.min(420,targetHeight)):280),ratio=cw/ch;
    const width=Math.max(Math.round(h*.45),Math.min(Math.round(h*1.6),Math.round(h*ratio)));
    // Keep the computed ratio in normal cases. Extreme ratios fit via contain;
    // the overlay itself stays bounded and tall enough for the readable footer.
    const clamped=width!==Math.round(h*ratio);
    return {width,height:clamped&&!framed?Math.max(48,Math.min(LIMIT.height,Math.round(width/ratio))):h};
  }
  // Keep the head and full horizontal extent; framing removes only the bottom.
  function portraitContentSize(width,height,zoom=1){return {width,height:height/(Number.isFinite(zoom)?Math.max(1,Math.min(4,zoom)):1)};}
  function portraitFrame(width,height,bw,bh,settings={},dockRight=false,rows=null){
    const inset=Math.min(4,width/4,height/4),availableW=width-inset*2,availableH=height-inset*2;
    const zoom=Number.isFinite(settings.zoom)?Math.max(.5,Math.min(4,settings.zoom)):1,content=portraitContentSize(bw,bh,zoom);
    const ratio=Math.min(availableW/content.width,availableH/content.height)*Math.min(1,zoom),w=content.width*ratio,h=content.height*ratio;
    const pan=k=>Number.isFinite(settings[k])?Math.max(-1,Math.min(1,settings[k])):0;
    const x=dockRight?width-w:inset+(availableW-w)/2+pan('x')*Math.abs(availableW-w)/2,y=inset+(availableH-h)/2+pan('y')*Math.abs(availableH-h)/2;
    // A close-up can exclude the widest part of a dress. Trim only empty
    // columns in this crop so the visible character, not transparent padding,
    // touches the window edge. Keep the original uniform pixel scale.
    if(dockRight&&rows?.length>=bh*2){
      let left=bw,right=0;
      for(let row=0;row<Math.min(bh,Math.ceil(content.height));row++)if(rows[row*2]<rows[row*2+1]){left=Math.min(left,rows[row*2]);right=Math.max(right,rows[row*2+1]);}
      if(right>left){const visibleW=(right-left)*ratio;return {x:width-visibleW,y,width:visibleW,height:h,source:{x:left,y:0,width:right-left,height:content.height}};}
    }
    if(zoom<=1)return {x,y,width:w,height:h};
    return {x,y,width:w,height:h,source:{x:0,y:0,width:bw,height:content.height}};
  }
  function portraitFooter(frame,canvasWidth,layoutWidth,dockRight=false){
    const inset=Math.min(4,layoutWidth/4),available=layoutWidth-inset*2;
    if(!frame)return {x:dockRight?layoutWidth-available:inset,width:available};
    const scale=layoutWidth/canvasWidth,width=Math.min(layoutWidth,Math.max(Math.min(118,available),frame.width*scale));
    const center=(frame.x+frame.width/2)*scale;
    return {x:dockRight?layoutWidth-width:Math.max(0,Math.min(layoutWidth-width,center-width/2)),width};
  }
  const stageHeight=height=>Math.max(1,height-52);
  return {portraitSize,portraitFrame,portraitFooter,portraitContentSize,stageHeight,LIMIT,DEFAULT};
});
