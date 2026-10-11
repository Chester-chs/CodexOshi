class LocalImagePlayer{
  constructor(canvas,onStatus=()=>{},onFrame=()=>{},onDraw=()=>{}){this.canvas=canvas;this.onStatus=onStatus;this.onFrame=onFrame;this.onDraw=onDraw;this.settings={zoom:1,x:0,y:0};this.frames=0;}
  load(url,background=true){
    const key=url+'|'+background;if(key===this.key)return;this.key=key;this.worker?.terminate();this.bitmap?.close();this.bitmap=null;
    this.worker=new Worker('image-worker.js');this.worker.onmessage=event=>{
      const q=event.data;if(q.error){this.onStatus(q.error,true);if(url!=='character://placeholder/ready')this.load('character://placeholder/ready',false);return;}
      this.bitmap?.close();this.bitmap=q.bitmap;this.rows=q.rows;this.frames++;this.canvas.dataset.frames=String(this.frames);this.canvas.dataset.source=url;this.onStatus(q.reason,false);this.draw();this.onFrame({url,key,contentWidth:q.contentWidth,contentHeight:q.contentHeight});
    };this.worker.onerror=()=>this.onStatus('图片处理失败，请重新选择图片。',true);this.worker.postMessage({url,background});
  }
  frame(settings){this.settings=settings;this.draw();}
  resize(width,height,dockRight=false){if(this.canvas.width!==width||this.canvas.height!==height||this.dockRight!==dockRight){this.dockRight=dockRight;this.canvas.width=width;this.canvas.height=height;this.draw();}}
  draw(){const c=this.canvas,ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!this.bitmap){this.onDraw(null);return;}const b=this.bitmap,r=window.portraitGeometry.portraitFrame(c.width,c.height,b.width,b.height,this.settings,this.dockRight,this.rows);if(r.source){const s=r.source;ctx.drawImage(b,s.x,s.y,s.width,s.height,r.x,r.y,r.width,r.height);}else ctx.drawImage(b,r.x,r.y,r.width,r.height);this.onDraw(r);}
}
window.LocalImagePlayer=LocalImagePlayer;
