(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.imageProcessing=api;})(globalThis,()=>{
  function bounds(data,width,height){let left=width,top=height,right=-1,bottom=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}return right<0?{x:0,y:0,width,height}:{x:left,y:top,width:right-left+1,height:bottom-top+1};}
  function marginBounds(data,width,height){
    const blank=i=>data[i*4+3]<=8||(data[i*4]>=240&&data[i*4+1]>=240&&data[i*4+2]>=240);
    const row=y=>{for(let x=0;x<width;x++)if(!blank(y*width+x))return false;return true;};
    let top=0,bottom=height-1,left=0,right=width-1;
    // Each removed outer strip must consist entirely of transparent/near-white
    // pixels. One non-white opaque pixel stops that direction immediately.
    while(top<height&&row(top))top++;if(top===height)return bounds(data,width,height);
    while(bottom>top&&row(bottom))bottom--;
    const column=x=>{for(let y=top;y<=bottom;y++)if(!blank(y*width+x))return false;return true;};
    while(left<width&&column(left))left++;if(left===width)return bounds(data,width,height);
    while(right>left&&column(right))right--;
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
  }
  function prepareImage(image,remove=true){
    const {width,height}=image,data=new Uint8ClampedArray(image.data);let backgroundRemoved=false,reason=remove?'复杂背景，保留原图':'已关闭去背景';
    if(remove){
      const edge=[];for(let x=0;x<width;x++){edge.push(x);if(height>1)edge.push((height-1)*width+x);}for(let y=1;y<height-1;y++){edge.push(y*width);if(width>1)edge.push(y*width+width-1);}
      const opaque=edge.filter(i=>data[i*4+3]>=240),groups=new Map();
      for(const i of opaque){const key=[0,1,2].map(k=>Math.round(data[i*4+k]/32)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
      const cluster=[...groups.values()].sort((a,b)=>b.length-a.length)[0]||[];
      if(opaque.length>=edge.length*.8&&cluster.length>=opaque.length*.8){
        const color=[0,1,2].map(k=>cluster.reduce((s,i)=>s+data[i*4+k],0)/cluster.length),distance=i=>Math.max(...color.map((c,k)=>Math.abs(data[i*4+k]-c))),visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
        const add=i=>{if(!visited[i]&&data[i*4+3]&&distance(i)<=40){visited[i]=1;queue[tail++]=i;}};for(const i of edge)add(i);
        while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);if(x)add(i-1);if(x<width-1)add(i+1);if(y)add(i-width);if(y<height-1)add(i+width);}
        if(tail>0&&tail<width*height*.97){for(let n=0;n<tail;n++){const i=queue[n],alpha=Math.max(0,Math.min(1,(distance(i)-18)/22));data[i*4+3]=Math.round(data[i*4+3]*alpha);}backgroundRemoved=true;reason='已去除边缘纯色背景';}
        else reason='无法分离主体，保留原图';
      }else if(opaque.length<edge.length*.8)reason='透明边距已裁剪';
    }
    const cropped=marginBounds(data,width,height);
    if(!remove&&(cropped.width<width||cropped.height<height))reason+=' · 白色/透明边距已裁剪';
    return {data,bounds:cropped,backgroundRemoved,reason};
  }
  return {prepareImage};
});
