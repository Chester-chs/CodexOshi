(()=>{
  const $=id=>document.getElementById(id);
  let snapshot={active:null,characters:[]},timer,panStart,content=null,lastSize='';
  const active=()=>snapshot.characters.find(c=>c.name===snapshot.active),error=text=>$('character-error').textContent=text;
  function reportSize(view){
    const dimensions=content?.key===view.url+'|'+view.settings.background?content:{contentWidth:199,contentHeight:280};
    const value={contentWidth:dimensions.contentWidth,contentHeight:dimensions.contentHeight,targetHeight:view.settings.targetHeight??280},key=JSON.stringify(value);
    if(key!==lastSize){lastSize=key;window.widget.characterSize(value);}
  }
  const live=new LocalImagePlayer($('character-canvas'),()=>{},value=>{content=value;reportSize(characterView.characterView(active()));}),preview=new LocalImagePlayer($('character-processed'),(text,bad)=>{$('character-processing').textContent=text;if(bad)error(text);});
  window.resizeCharacter=(width,height)=>{const scale=window.devicePixelRatio||1;live.resize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*.92*scale)));};
  async function action(value){try{const q=await window.widget.characterAction(value);if(!q.ok)error(q.error);else error('');}catch{error('角色操作失败，请重试。');}}
  window.renderCharacter=()=>{const view=characterView.characterView(active());live.frame(view.settings);live.load(view.url,view.settings.background);reportSize(view);};
  function renderPreview(){const view=characterView.characterView(active());$('character-original').src=view.url;preview.frame(view.settings);preview.load(view.url,view.settings.background);}
  function render(){
    const role=active(),list=$('character-list');list.replaceChildren();if(!role){const hint=document.createElement('span');hint.textContent='上传立绘，即可添加角色';list.append(hint);}
    for(const c of snapshot.characters){const button=document.createElement('button');button.textContent=c.name;button.tabIndex=-1;button.setAttribute('aria-pressed',String(c.name===snapshot.active));button.onclick=()=>{flush();action({action:'select',name:c.name});};list.append(button);}
    for(const id of ['character-rename','character-delete','character-background','character-zoom','character-size','character-reset'])$(id).disabled=!role;
    $('character-background').checked=role?.settings.background??true;$('character-zoom').value=role?.settings.zoom||1;$('character-zoom-value').textContent=(role?.settings.zoom||1).toFixed(2)+'×';$('character-size').value=role?.settings.targetHeight??280;$('character-size-value').textContent=(role?.settings.targetHeight??280)+'px';renderPreview();window.renderCharacter();
  }
  function flush(){clearTimeout(timer);const role=active();if(role)action({action:'settings',name:role.name,patch:role.settings});}
  function changed(patch){const role=active();if(!role)return;Object.assign(role.settings,patch);$('character-zoom-value').textContent=role.settings.zoom.toFixed(2)+'×';$('character-size-value').textContent=(role.settings.targetHeight??280)+'px';renderPreview();window.renderCharacter();clearTimeout(timer);timer=setTimeout(flush,150);}
  window.widget.characters(value=>{snapshot=value;render();});
  $('character-rename').onclick=()=>active()&&action({action:'rename',name:active().name});$('character-delete').onclick=()=>active()&&action({action:'delete',name:active().name});
  $('character-upload').onclick=()=>{flush();action({action:'import'});};
  $('character-background').onchange=()=>changed({background:$('character-background').checked});$('character-zoom').oninput=()=>changed({zoom:Number($('character-zoom').value)});$('character-zoom').onchange=flush;
  $('character-size').oninput=()=>changed({targetHeight:Number($('character-size').value)});$('character-size').onchange=flush;
  $('character-reset').onclick=()=>{changed({zoom:1,x:0,y:0});$('character-zoom').value=1;flush();};
  const canvas=$('character-processed');canvas.onpointerdown=event=>{const role=active();if(!role||event.button!==0)return;event.preventDefault();canvas.setPointerCapture(event.pointerId);panStart={clientX:event.clientX,clientY:event.clientY,x:role.settings.x,y:role.settings.y};};
  canvas.onpointermove=event=>{if(!panStart)return;const r=canvas.getBoundingClientRect();changed({x:Math.max(-1,Math.min(1,panStart.x+2*(event.clientX-panStart.clientX)/r.width)),y:Math.max(-1,Math.min(1,panStart.y+2*(event.clientY-panStart.clientY)/r.height))});};
  canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{if(panStart){panStart=null;flush();}};
  render();
  // All quota/token/character listeners must exist before the startup snapshots.
  window.widget.ready();
})();
