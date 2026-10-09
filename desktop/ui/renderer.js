const button=document.getElementById('widget');
let widgetPosition={x:8,y:8},start=null,moved=false,count=0;
window.widget.layout(value=>{widgetPosition=value;button.style.left=value.x+'px';button.style.top=value.y+'px'});
button.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();button.setPointerCapture(event.pointerId);
  start={x:event.clientX,y:event.clientY,left:widgetPosition.x,top:widgetPosition.y};moved=false;
});
button.addEventListener('pointermove',event=>{
  if(!start)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  if(moved)window.widget.gesture({type:'drag',x:start.left+dx,y:start.top+dy});
});
function end(){if(!start)return;if(!moved){window.widget.gesture({type:'click'});document.getElementById('status').textContent='点击 '+(++count)}window.widget.gesture({type:'end'});start=null;}
button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
window.widget.ready();
