// Dedicated browser Worker: local decoding, per-frame processing and GIF timing.
importScripts('image-processing.js');
let generation=0,timer,decoder;
self.onmessage=async event=>{
  const {url,background}=event.data,run=++generation;clearTimeout(timer);decoder?.close();decoder=null;
  try{
    if(!url.startsWith('character://'))throw Error('仅支持本机素材。');
    const response=await fetch(url);if(!response.ok)throw Error('素材无法读取。');const bytes=await response.arrayBuffer();if(run!==generation)return;
    const current=decoder=new ImageDecoder({data:bytes,type:response.headers.get('Content-Type')});await current.tracks.ready;
    await current.completed;const track=current.tracks.selectedTrack,frames=track.frameCount;let frameIndex=0,loops=0,union=null;
    async function next(){
      if(run!==generation)return;
      try{
        const {image}=await current.decode({frameIndex});if(run!==generation){image.close();return;}
        const width=image.displayWidth,height=image.displayHeight;if(width>4096||height>4096){image.close();throw Error('图片单边不能超过 4096px。');}
        const scale=Math.min(1,1024/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale)),canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
        const duration=Math.max(20,(image.duration||100000)/1000);image.close();const prepared=imageProcessing.prepareImage(ctx.getImageData(0,0,w,h),background);ctx.putImageData(new ImageData(prepared.data,w,h),0,0);let r=prepared.bounds;
        // Growing animation bounds preserve motion across frames and loops.
        if(frames>1){if(union){const x=Math.min(union.x,r.x),y=Math.min(union.y,r.y);r={x,y,width:Math.max(union.x+union.width,r.x+r.width)-x,height:Math.max(union.y+union.height,r.y+r.height)-y};}union=r;}
        const cropped=new OffscreenCanvas(r.width,r.height);cropped.getContext('2d').drawImage(canvas,r.x,r.y,r.width,r.height,0,0,r.width,r.height);const bitmap=cropped.transferToImageBitmap();
        const rows=imageProcessing.horizontalRows({data:prepared.data,width:w,height:h},r);
        self.postMessage({bitmap,rows,contentWidth:r.width,contentHeight:r.height,reason:prepared.reason,backgroundRemoved:prepared.backgroundRemoved,frameIndex,frames},[bitmap,rows.buffer]);
        frameIndex++;if(frameIndex>=frames){frameIndex=0;loops++;if(Number.isFinite(track.repetitionCount)&&loops>track.repetitionCount)return;}
        if(frames>1&&run===generation)timer=setTimeout(next,duration);
      }catch(error){if(run===generation)self.postMessage({error:'图片解码失败，请重新选择有效图片。'});}
    }
    await next();
  }catch(error){if(run===generation)self.postMessage({error:error.message||'图片解码失败。'});}
};
