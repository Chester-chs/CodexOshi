// Never pass [] to Electron: it restores the entire transparent surface.
const tiny = () => [{x:0,y:0,width:1,height:1}];
const SIZE = {width:96,height:80};
const {DEFAULT:COMPACT,LIMIT:ROLE_LIMIT}=require('./ui/portrait-size.js');
const {DEFAULT:PANEL,MAX:PANEL_LIMIT,validSize}=require('./ui/panel-model.js');
const MAX_AREA=ROLE_LIMIT.width*ROLE_LIMIT.height+PANEL_LIMIT.width*PANEL_LIMIT.height;
const EDGE = 24;
function shape(value,width,height,sizes=[SIZE]) {
  if(!Array.isArray(sizes)||!sizes.length||sizes.length>2||!sizes.every((s,i)=>{const cap=i?PANEL_LIMIT:ROLE_LIMIT;return s&&Number.isInteger(s.width)&&Number.isInteger(s.height)&&s.width>0&&s.height>0&&s.width<=cap.width&&s.height<=cap.height;}))return tiny();
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width>32768 || height>32768 || !Array.isArray(value) || !value.length || value.length>64) return tiny();
  let area=0;
  for (const r of value) {
    if (!r || !['x','y','width','height'].every(k => Number.isInteger(r[k]) && Math.abs(r[k])<=32768) ||
        r.x<0 || r.y<0 || r.width<=0 || r.height<=0 || r.x+r.width>width-EDGE || r.y+r.height>height-EDGE) return tiny();
    area += r.width*r.height;
  }
  // Both the actual layout budget and hard profile caps remain mandatory.
  if (area>sizes.reduce((sum,s)=>sum+s.width*s.height,0)||area>MAX_AREA||value.length>sizes.length||
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
function snap(widget,width,height,size){
  const point=position(widget.x,widget.y,width,height,size);
  for(const [axis,total,side] of [['x',width,size.width],['y',height,size.height]]){
    const end=Math.max(8,total-side-EDGE);if(point[axis]-8<=12)point[axis]=8;else if(end-point[axis]<=12)point[axis]=end;
  }return point;
}
function layout(widget,width,height,expanded=false,windowCount=0,requested=COMPACT,requestedPanel=PANEL,panelOffset=null){
  if(!requested||!['width','height'].every(k=>Number.isInteger(requested[k])&&requested[k]>0&&requested[k]<=ROLE_LIMIT[k]))requested=COMPACT;
  const scale=Math.min(1,Math.max(1,width-EDGE-8)/requested.width,Math.max(1,height-EDGE-8)/requested.height);
  const compact={width:Math.max(1,Math.round(requested.width*scale)),height:Math.max(1,Math.round(requested.height*scale))};
  const point=position(widget?.x??width-compact.width-EDGE,widget?.y??height-compact.height-EDGE,width,height,compact);
  const regions=[{...point,...compact}],sizes=[compact];
  if(expanded){
    if(!validSize(requestedPanel))requestedPanel=PANEL;
    const panel={width:Math.max(1,Math.min(requestedPanel.width,width-EDGE-8)),height:Math.max(1,Math.min(requestedPanel.height,height-EDGE-8))};
    const left=point.x-panel.width-12,right=point.x+compact.width+12;
    let p=position(left>=8?left:right,point.y,width,height,panel);
    if(left<8&&right+panel.width>width-EDGE){p=position(point.x,point.y-panel.height-12>=8?point.y-panel.height-12:point.y+compact.height+12,width,height,panel);}
    if(panelOffset&&['x','y'].every(k=>Number.isFinite(panelOffset[k])&&Math.abs(panelOffset[k])<=32768))p=position(point.x+panelOffset.x,point.y+panelOffset.y,width,height,panel);
    regions.push({...p,...panel});sizes.push(panel);
  }
  return {widget:point,regions,sizes,expanded};
}
module.exports={shape,viewport,position,layout,snap,SIZE,COMPACT,PANEL,EDGE,ROLE_LIMIT,PANEL_LIMIT,MAX_AREA};
