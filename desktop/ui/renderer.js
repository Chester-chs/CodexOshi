const button=document.getElementById('widget'),resident=document.getElementById('resident-content'),details=document.getElementById('details'),panelBody=document.getElementById('panel-body'),text=(value,args)=>window.uiText.t(value,args);
let widgetPosition={x:8,y:8},start=null,moved=false,quota={windows:[]},width=160,tokens=null;
let wheelEvents=0,scrollReportPending=false,layoutDragging=false,residentDocked=false;
let feedbackAnimation,speechIndex=0,dialoguePreferences=window.dialogueModel.defaults();
let tokenPeriod='hours24';
const speech=document.getElementById("speech");
const codiSwitch=document.getElementById('codi-power'),codiLauncher=document.getElementById('codi-launcher');
window.codiEnabled=true;
async function switchCodi(enabled){
  codiSwitch.disabled=codiLauncher.disabled=true;
  try{const result=await window.widget.setEnabled(enabled);if(!result.ok)throw Error(result.error||text('卡片设置未能保存，请检查本机文件权限。'));}
  catch(error){document.getElementById('panel-error').textContent=error.message;codiLauncher.title=error.message;}
  finally{codiSwitch.disabled=codiLauncher.disabled=false;}
}
codiSwitch.addEventListener('click',()=>switchCodi(false));codiLauncher.addEventListener('click',()=>switchCodi(true));
function clickFeedback(){
  feedbackAnimation?.cancel();
  const animation=document.getElementById('character-canvas').animate([{transform:'scale(1)'},{transform:'scale(.96)',offset:.35},{transform:'scale(1)'}],{duration:220,easing:'ease-out'});
  feedbackAnimation=animation;animation.onfinish=()=>{if(feedbackAnimation===animation)feedbackAnimation=null;};
}
function reportScroll(){
  if(scrollReportPending)return;scrollReportPending=true;
  requestAnimationFrame(()=>{
    scrollReportPending=false;const r=document.querySelector('#character-tab').getBoundingClientRect();
    window.widget.panelScroll?.({top:Math.max(0,Math.round(panelBody.scrollTop)),height:panelBody.scrollHeight,clientHeight:panelBody.clientHeight,wheelEvents,tab:document.querySelector('nav [aria-selected="true"]').id.replace('-tab',''),roleTab:{x:Math.max(0,Math.round(r.x+r.width/2)),y:Math.max(0,Math.round(r.y+r.height/2))}});
  });
}
panelBody.addEventListener('wheel',()=>{wheelEvents=Math.min(100000,wheelEvents+1);reportScroll();},{passive:true});
panelBody.addEventListener('scroll',reportScroll,{passive:true});
function rectangle(element,r){for(const key of ['left','top','width','height'])element.style[key]=(r[key==='left'?'x':key==='top'?'y':key])+'px';}
window.widget.layout(value=>{
  window.codiEnabled=value.widgetEnabled!==false;button.hidden=!window.codiEnabled;codiLauncher.hidden=window.codiEnabled;
  codiSwitch.setAttribute('aria-checked',String(window.codiEnabled));codiLauncher.setAttribute('aria-checked',String(window.codiEnabled));
  if(!window.codiEnabled){feedbackAnimation?.cancel();details.hidden=true;speech.hidden=true;rectangle(codiLauncher,value.regions[0]);return;}
  widgetPosition=value.widget;width=value.regions[0].width;rectangle(button,value.regions[0]);
  const base=value.residentSize||value.regions[0],scale=Math.min(value.regions[0].width/base.width,value.regions[0].height/base.height);
  width=base.width;
  resident.style.width=base.width+'px';resident.style.height=base.height+'px';resident.style.transform=`scale(${scale})`;residentDocked=Boolean(value.docked);button.style.cursor=residentDocked?'pointer':'grab';
  layoutDragging=Boolean(value.dragging);
  window.resizeCharacter?.(base.width,base.height);
  details.hidden=!value.expanded;if(value.expanded)rectangle(details,value.regions[1]);
  speech.hidden=!value.speechVisible;if(value.speechVisible){rectangle(speech,value.regions[1]);speechIndex=value.speechIndex;dialoguePreferences=value.dialoguePreferences||dialoguePreferences;renderSpeech();}
  if(!layoutDragging&&!value.resizing){render();reportScroll();}
});
window.widget.quota(value=>{quota=value;render();});
window.widget.tokens(value=>{tokens=value;renderTokens();});
function selectTab(name){
  if(!['quota','token','character','appearance'].includes(name))return;
  for(const tab of ['quota','token','character','appearance']){
    document.getElementById(tab+'-panel').hidden=tab!==name;
    document.getElementById(tab+'-tab').setAttribute('aria-selected',String(tab===name));
  }
  panelBody.scrollTop=0;reportScroll();if(name==='token')window.widget.readTokens();
}
for(const name of ['quota','token','character','appearance'])document.getElementById(name+'-tab').addEventListener('click',()=>selectTab(name));
document.getElementById('close').addEventListener('click',()=>window.widget.collapse());
const gear=document.getElementById('settings-open');
gear.addEventListener('pointerdown',event=>event.stopPropagation());
gear.addEventListener('click',event=>{event.stopPropagation();window.widget.openSettings();});
function renderSpeech(){
  if(speech.hidden)return;
  const dialogueOnly=speechIndex===1;
  speech.classList.toggle('dialogue-only',dialogueOnly);
  document.querySelector('.speech-data').hidden=dialogueOnly;
  const view=window.dialogueModel.present(dialoguePreferences,speechIndex,quota,Date.now(),window.uiText.language);
  document.getElementById('speech-text').textContent=view.line;
  document.getElementById('speech-reset').textContent=view.reset;
  document.getElementById('speech-reset').hidden=dialoguePreferences.lines[speechIndex===1?1:0].includes('{重置时间}');
  document.getElementById('speech-credits').textContent=text('重置卡：{count} 次',{count:view.count})+(view.stale?' · '+text('数据待更新'):'');
}
document.getElementById('position-reset').addEventListener('click',()=>window.widget.resetPosition());
function bar(track,fill,remaining,tone){track.className='track '+tone;fill.style.width=(remaining??0)+'%';}
function render(){
  if(layoutDragging||!window.codiEnabled)return;renderSpeech();
  const view=window.quotaView.present(quota,width,Date.now(),window.uiText.language);
  window.renderCharacter?.(quota);
  document.getElementById('window-label').textContent=view.compact.label;
  button.setAttribute('aria-label',text('{label}，剩余 {value}，点击对话，拖动移动',{label:view.compact.label,value:view.compact.text}));
  document.getElementById('status').textContent=view.compact.text;
  document.getElementById('compact-track').hidden=!view.showCompactBar;
  bar(document.getElementById('compact-track'),document.getElementById('compact-fill'),view.compact.remainingPercent,view.compact.tone);
  button.title=view.compact.label+' · '+text(quota.stale?'数据待更新':'实时额度');
  const cards=document.getElementById('cards');cards.replaceChildren();
  if(view.empty){const empty=document.createElement('p');empty.textContent=view.empty;cards.append(empty);}
  for(const card of view.cards){
    const article=document.createElement('article'),title=document.createElement('strong'),row=document.createElement('div'),reset=document.createElement('span'),remaining=document.createElement('strong'),track=document.createElement('div'),fill=document.createElement('div');
    title.textContent=card.label;row.className='card-row';reset.textContent=card.resetText;
    remaining.className='quota-remaining';
    const parts=text('剩余 {value}',{value:'\uFFFC'}).split('\uFFFC'),number=document.createElement('span');
    number.className='quota-percent';number.textContent=card.percentText;remaining.append(parts[0],number,parts[1]||'');
    row.append(reset,remaining);fill.className='fill';track.append(fill);bar(track,fill,card.remainingPercent,card.tone);article.append(title,row,track);cards.append(article);
  }
  const age=Number.isFinite(quota.observedAt)?Math.max(0,Math.floor((Date.now()-quota.observedAt)/1000)):null;
  const ageText=age===null?text('尚未更新'):age<60?text('{value} 秒前更新',{value:age}):text('{value} 分钟前更新',{value:Math.floor(age/60)});
  const source={http:'接口',local:'本地额度快照',rpc:'额度 RPC',none:'暂无来源'}[quota.source] || '暂无来源';
  document.getElementById('metadata').textContent=text('套餐：{plan} · {source}',{plan:quota.planType||text('未知'),source:text(source)})+'\n'+ageText+(quota.stale?' · '+text('数据待更新'):'');
}
function renderTokens(){
  const coverage=window.quotaView.presentTokens(tokens,window.uiText.language),view=window.tokenChart.presentSeries(tokens,tokenPeriod,window.uiText.language),chart=document.getElementById('token-chart'),exact=document.getElementById('token-exact-values');chart.replaceChildren();exact.replaceChildren();
  const label=text({hours24:'最近 24 小时',days7:'最近 7 天',days30:'最近 30 天'}[tokenPeriod]);
  document.getElementById('token-range-label').textContent=label;
  document.getElementById('token-total').textContent=view.known?view.number:'—';document.getElementById('token-total').title=view.known?view.total+' tokens':'';
  document.getElementById('token-hover').textContent='';document.getElementById('token-coverage').textContent=coverage.coverageText;
  const indexing=document.getElementById('token-status');indexing.textContent=coverage.coverageText.split(' · ')[0];indexing.hidden=tokens?.coverage==='complete';
  chart.setAttribute('aria-label',label+' · '+(view.known?view.total+' tokens':text('历史正在补齐，当前为部分覆盖')));
  if(view.known){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 250');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
    const element=(name,attrs,content)=>{const e=document.createElementNS(svg.namespaceURI,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(content!==undefined)e.textContent=content;svg.append(e);return e;};
    for(const tick of view.ticks){const y=210-tick.percent*1.75;element('line',{x1:42,x2:592,y1:y,y2:y,class:'chart-grid'});element('text',{x:34,y:y+4,'text-anchor':'end',class:'chart-axis'},tick.label);}
    const step=548/view.bins.length,stride=Math.ceil(view.bins.length/6);
    view.bins.forEach((bin,i)=>{
      const x=44+i*step,h=bin.percent*1.75;
      const rect=element('rect',{x:x+step*.16,y:210-h,width:step*.68,height:h,rx:3,class:'chart-bar'});const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=bin.tooltip;rect.append(title);
      // Full-height hit targets also expose empty periods to the pointer.
      const hit=element('rect',{x,y:30,width:step,height:185,fill:'transparent',class:'chart-hit'});hit.addEventListener('pointerenter',()=>document.getElementById('token-hover').textContent=bin.tooltip);hit.addEventListener('pointerleave',()=>document.getElementById('token-hover').textContent='');
      if(i%stride===0||i===view.bins.length-1)element('text',{x:x+step/2,y:236,'text-anchor':'middle',class:'chart-axis'},bin.label);
      const term=document.createElement('dt'),count=document.createElement('dd');term.textContent=bin.label;count.textContent=new Intl.NumberFormat(window.uiText.language).format(bin.value);exact.append(term,count);
    });chart.append(svg);
  }else{const note=document.createElement('p');note.textContent=text('历史正在补齐，当前为部分覆盖');chart.append(note);}
  document.getElementById('token-updated').textContent=Number.isFinite(tokens?.observedAt)?text('截至 {time} · 5 分钟缓存',{time:new Date(tokens.observedAt).toLocaleTimeString(window.uiText.language,{hour12:false})}):text('历史正在补齐，当前为部分覆盖');
}
for(const period of document.querySelectorAll('[data-period]'))period.addEventListener('click',()=>{tokenPeriod=period.dataset.period;for(const p of document.querySelectorAll('[data-period]'))p.setAttribute('aria-pressed',String(p===period));renderTokens();});
button.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();button.setPointerCapture(event.pointerId);
  start={x:event.clientX,y:event.clientY,left:widgetPosition.x,top:widgetPosition.y};moved=false;
});
button.addEventListener('pointermove',event=>{
  if(!start)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  if(moved&&!residentDocked)window.widget.gesture({type:'drag',x:start.left+dx,y:start.top+dy});
});
function end(event){if(!start)return;if(!moved&&event.type==='pointerup'){clickFeedback();window.widget.gesture({type:'click'});}window.widget.gesture({type:'end'});start=null;}
button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
window.addEventListener('languagechange',()=>{render();renderTokens();});setInterval(render,1000);render();renderTokens();
