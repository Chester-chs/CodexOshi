// Never pass [] to Electron: it restores the entire transparent surface.
const tiny = () => [{x:0,y:0,width:1,height:1}];
const SIZE = {width:96,height:80};
const EDGE = 24;
function shape(value,width,height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Array.isArray(value) || !value.length || value.length>64) return tiny();
  let area=0;
  for (const r of value) {
    if (!r || !['x','y','width','height'].every(k => Number.isInteger(r[k]) && Math.abs(r[k])<=32768) ||
        r.x<0 || r.y<0 || r.width<=0 || r.height<=0 || r.x+r.width>width-EDGE || r.y+r.height>height-EDGE) return tiny();
    area += r.width*r.height;
  }
  // Stage 1 only has one 96 × 80 placeholder. No caller can shape the host.
  if (area>SIZE.width*SIZE.height) return tiny();
  return value.map(({x,y,width,height})=>({x,y,width,height}));
}
function viewport(width,height,dpi) {
  if (![width,height,dpi].every(Number.isFinite) || dpi<48 || dpi>768 || width<1 || height<1) throw new Error('Invalid host viewport');
  return {width:Math.max(1,Math.round(width*96/dpi)),height:Math.max(1,Math.round(height*96/dpi))};
}
function position(x,y,width,height) {
  return {x:Math.round(Math.max(8,Math.min(Number.isFinite(x)?x:8,width-SIZE.width-EDGE))),
    y:Math.round(Math.max(8,Math.min(Number.isFinite(y)?y:8,height-SIZE.height-EDGE)))};
}
module.exports={shape,viewport,position,SIZE,EDGE};
