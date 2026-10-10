class LocalImagePlayer{
  constructor(canvas,onStatus=()=>{}){this.canvas=canvas;this.onStatus=onStatus;this.settings={zoom:1,x:0,y:0};this.scale=1;this.frames=0;}
  load(url,background=true){
    const key=url+'|'+background;if(key===this.key)return;this.key=key;this.worker?.terminate();this.bitmap?.close();this.bitmap=null;
    this.worker=new Worker('image-worker.js');this.worker.onmessage=event=>{
      const q=event.data;if(q.error){this.onStatus(q.error,true);if(url!=='character://placeholder/ready')this.load('character://placeholder/ready',false);return;}
      this.bitmap?.close();this.bitmap=q.bitmap;this.frames++;this.canvas.dataset.frames=String(this.frames);this.canvas.dataset.source=url;this.onStatus(q.reason,false);this.draw();
    };this.worker.onerror=()=>this.onStatus('图片处理失败，请重新选择图片。',true);this.worker.postMessage({url,background});
  }
  frame(settings,scale=1){this.settings=settings;this.scale=scale;this.draw();}
  draw(){const c=this.canvas,ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!this.bitmap)return;const b=this.bitmap,s=this.settings,ratio=Math.min(c.width/b.width,c.height/b.height)*(s.zoom||1)*this.scale,w=b.width*ratio,h=b.height*ratio;ctx.drawImage(b,(c.width-w)/2+(s.x||0)*c.width/2,(c.height-h)/2+(s.y||0)*c.height/2,w,h);}
}
window.LocalImagePlayer=LocalImagePlayer;
