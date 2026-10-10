(()=>{
  const model=window.panelModel,handle=document.getElementById('panel-resize'),size=document.getElementById('panel-size-value'),select=document.getElementById('language-select'),error=document.getElementById('panel-error');
  let start=null,pending=null,frame=null,revision=0;
  function showError(text){error.dataset.i18n=text;error.textContent=window.uiText.t(text);}
  window.widget.panelError(showError);
  window.widget.layout(value=>{if(value.panelPreferences){window.uiText.setLanguage(value.panelPreferences.language);select.value=value.panelPreferences.language;}if(value.expanded){const r=value.regions[1];size.textContent=r.width+' × '+r.height;}});
  window.widget.panelPreferencesRead().then(value=>{if(revision===0&&value){window.uiText.setLanguage(value.language);select.value=value.language;}}).catch(()=>{});
  select.onchange=async()=>{revision++;window.uiText.setLanguage(select.value);try{const q=await window.widget.panelLanguage(select.value);showError(q.ok?'':q.error||'卡片设置未能保存，请检查本机文件权限。');}catch{showError('卡片设置未能保存，请检查本机文件权限。');}};
  function send(){frame=null;if(pending){window.widget.panelResize({type:'update',...pending});pending=null;}}
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);const r=document.getElementById('details').getBoundingClientRect();start={x:event.clientX,y:event.clientY,width:r.width,height:r.height};pending=null;window.widget.panelResize({type:'begin'});};
  handle.onpointermove=event=>{if(!start)return;pending=model.clamp(start.width+event.clientX-start.x,start.height+event.clientY-start.y);if(frame===null)frame=requestAnimationFrame(send);};
  function end(){if(!start)return;cancelAnimationFrame(frame);frame=null;send();start=null;window.widget.panelResize({type:'end'});}
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=end;
  handle.onkeydown=event=>{const axes={ArrowRight:[20,0],ArrowLeft:[-20,0],ArrowDown:[0,20],ArrowUp:[0,-20]};if(!axes[event.key])return;event.preventDefault();const r=document.getElementById('details').getBoundingClientRect(),delta=axes[event.key];window.widget.panelResize({type:'begin'});window.widget.panelResize({type:'update',...model.clamp(r.width+delta[0],r.height+delta[1])});window.widget.panelResize({type:'end'});};
  window.uiText.apply();
})();
