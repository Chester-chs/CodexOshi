(()=>{
  const model=window.panelModel,handle=document.getElementById('panel-resize'),size=document.getElementById('panel-size-value'),select=document.getElementById('language-select'),error=document.getElementById('panel-error');
  let start=null,pending=null,frame=null,revision=0;
  let directions={x:1,y:1};
  function showLanguage(language){window.uiText.setLanguage(language);select.value=language;for(const button of select.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.language===language));}
  function showError(text){error.dataset.i18n=text;error.textContent=window.uiText.t(text);}
  window.widget.panelError(showError);
  window.widget.layout(value=>{if(value.panelPreferences)showLanguage(value.panelPreferences.language);if(value.expanded){const r=value.regions[1];size.textContent=r.width+' × '+r.height;if(!start){directions={x:r.x<value.widget.x?-1:1,y:r.y<value.widget.y?-1:1};const d=document.getElementById('details');d.dataset.resizeX=directions.x<0?'left':'right';d.dataset.resizeY=directions.y<0?'top':'bottom';}}});
  window.widget.panelPreferencesRead().then(value=>{if(revision===0&&value)showLanguage(value.language);}).catch(()=>{});
  for(const button of select.querySelectorAll('button'))button.addEventListener('click',async()=>{revision++;showLanguage(button.dataset.language);try{const q=await window.widget.panelLanguage(button.dataset.language);showError(q.ok?'':q.error||'卡片设置未能保存，请检查本机文件权限。');}catch{showError('卡片设置未能保存，请检查本机文件权限。');}});
  function send(){frame=null;if(pending){window.widget.panelResize({type:'update',...pending});pending=null;}}
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);const r=document.getElementById('details').getBoundingClientRect();start={x:event.clientX,y:event.clientY,width:r.width,height:r.height,directions:{...directions}};pending=null;window.widget.panelResize({type:'begin'});};
  handle.onpointermove=event=>{if(!start)return;pending=model.clamp(start.width+(event.clientX-start.x)*start.directions.x,start.height+(event.clientY-start.y)*start.directions.y);if(frame===null)frame=requestAnimationFrame(send);};
  function end(){if(!start)return;cancelAnimationFrame(frame);frame=null;send();start=null;window.widget.panelResize({type:'end'});}
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=end;
  handle.onkeydown=event=>{const axes={ArrowRight:[20,0],ArrowLeft:[-20,0],ArrowDown:[0,20],ArrowUp:[0,-20]};if(!axes[event.key])return;event.preventDefault();const r=document.getElementById('details').getBoundingClientRect(),delta=axes[event.key];window.widget.panelResize({type:'begin'});window.widget.panelResize({type:'update',...model.clamp(r.width+delta[0]*directions.x,r.height+delta[1]*directions.y)});window.widget.panelResize({type:'end'});};
  window.uiText.apply();
})();
