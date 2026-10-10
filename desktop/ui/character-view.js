(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.characterView=api;})(globalThis,()=>{
  function characterView(role){
    return {url:role?.image?.url||'character://placeholder/ready',settings:role?.settings||{background:true,zoom:1,x:0,y:0}};
  }
  return {characterView};
});
