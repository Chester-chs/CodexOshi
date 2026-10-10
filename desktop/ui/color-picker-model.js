(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.colorPickerModel=api;})(globalThis,()=>{
  function fromHex(hex){
    const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    const h=!d?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
    return {h:h*60,s:max?d/max:0,v:max};
  }
  function toHex({h,s,v}){
    h=((h%360)+360)%360/60;s=Math.max(0,Math.min(1,s));v=Math.max(0,Math.min(1,v));
    const c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c,rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
  }
  return {fromHex,toHex};
});
