// Never pass [] to Electron: it restores the entire transparent surface.
const tiny = () => [{x:0,y:0,width:1,height:1}];
const SIZE = {width:96,height:80};
const COMPACT={width:160,height:112};
const PANEL={width:320,height:352};
const EDGE = 24;
function shape(value,width,height,sizes=[SIZE]) {
  if(!Array.isArray(sizes)||!sizes.length||sizes.length>2||!sizes.every((s,i)=>s&&Number.isInteger(s.width)&&Number.isInteger(s.height)&&s.width>0&&s.height>0&&s.width<=(i?340:160)&&s.height<=(i?352:112)))return tiny();
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Array.isArray(value) || !value.length || value.length>64) return tiny();
  let area=0;
  for (const r of value) {
    if (!r || !['x','y','width','height'].every(k => Number.isInteger(r[k]) && Math.abs(r[k])<=32768) ||
        r.x<0 || r.y<0 || r.width<=0 || r.height<=0 || r.x+r.width>width-EDGE || r.y+r.height>height-EDGE) return tiny();
    area += r.width*r.height;
  }
  // Both the actual layout budget and hard profile caps remain mandatory.
  if (area>sizes.reduce((sum,s)=>sum+s.width*s.height,0)||area>160*112+340*352||value.length>sizes.length||
      value.some((r,i)=>r.width>sizes[i].width||r.height>sizes[i].height)) return tiny();
  return value.map(({x,y,width,height})=>({x,y,width,height}));
}
function viewport(width,height,dpi) {
  if (![width,height,dpi].every(Number.isFinite) || dpi<48 || dpi>768 || width<1 || height<1) throw new Error('Invalid host viewport');
  return {width:Math.max(1,Math.round(width*96/dpi)),height:Math.max(1,Math.round(height*96/dpi))};
}
function position(x,y,width,height,size=SIZE) {
  return {x:Math.round(Math.max(8,Math.min(Number.isFinite(x)?x:8,width-size.width-EDGE))),
    y:Math.round(Math.max(8,Math.min(Number.isFinite(y)?y:8,height-size.height-EDGE)))};
}
function layout(widget,width,height,expanded=false,windowCount=0){
  const compact={width:Math.max(1,Math.min(COMPACT.width,width-EDGE-8)),height:Math.max(1,Math.min(COMPACT.height,height-EDGE-8))};
  const point=position(widget?.x??width,widget?.y??height,width,height,compact);
  const regions=[{...point,...compact}],sizes=[compact];
  if(expanded){
    const panel={width:Math.max(1,Math.min(PANEL.width,width-EDGE-8)),height:Math.max(1,Math.min(windowCount>1?352:windowCount?270:214,height-EDGE-8))};
    const left=point.x-panel.width-12,right=point.x+compact.width+12;
    let p=position(left>=8?left:right,point.y,width,height,panel);
    if(left<8&&right+panel.width>width-EDGE){p=position(point.x,point.y-panel.height-12>=8?point.y-panel.height-12:point.y+compact.height+12,width,height,panel);}
    regions.push({...p,...panel});sizes.push(panel);
  }
  return {widget:point,regions,sizes,expanded};
}
module.exports={shape,viewport,position,layout,SIZE,COMPACT,PANEL,EDGE};
