const button=document.getElementById('widget'),details=document.getElementById('details'),panelBody=document.getElementById('panel-body'),text=(value,args)=>window.uiText.t(value,args);
let widgetPosition={x:8,y:8},start=null,moved=false,quota={windows:[]},width=160,tokens=null;
let wheelEvents=0,scrollReportPending=false,layoutDragging=false;
let feedbackAnimation,speechIndex=0,dialoguePreferences=window.dialogueModel.defaults();
const speech=document.getElementById("speech");
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
  widgetPosition=value.widget;width=value.regions[0].width;rectangle(button,value.regions[0]);
  layoutDragging=Boolean(value.dragging);
  window.resizeCharacter?.(value.regions[0].width,value.regions[0].height);
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
  const view=window.dialogueModel.present(dialoguePreferences,speechIndex,quota,Date.now(),window.uiText.language);
  document.getElementById('speech-text').textContent=view.line;
  document.getElementById('speech-reset').textContent=view.reset;
  document.getElementById('speech-reset').hidden=dialoguePreferences.lines[speechIndex===1?1:0].includes('{重置时间}');
  document.getElementById('speech-credits').textContent=text('重置卡：{count} 次',{count:view.count})+(view.stale?' · '+text('数据待更新'):'');
}
document.getElementById('position-reset').addEventListener('click',()=>window.widget.resetPosition());
function bar(track,fill,remaining,tone){track.className='track '+tone;fill.style.width=(remaining??0)+'%';}
function render(){
  if(layoutDragging)return;renderSpeech();
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
    title.textContent=card.label;row.className='card-row';reset.textContent=card.resetText;remaining.textContent=text('剩余 {value}',{value:card.percentText});row.append(reset,remaining);fill.className='fill';track.append(fill);bar(track,fill,card.remainingPercent,card.tone);article.append(title,row,track);cards.append(article);
  }
  const age=Number.isFinite(quota.observedAt)?Math.max(0,Math.floor((Date.now()-quota.observedAt)/1000)):null;
  const ageText=age===null?text('尚未更新'):age<60?text('{value} 秒前更新',{value:age}):text('{value} 分钟前更新',{value:Math.floor(age/60)});
  const source={http:'接口',local:'本地额度快照',rpc:'额度 RPC',none:'暂无来源'}[quota.source] || '暂无来源';
  document.getElementById('metadata').textContent=text('套餐：{plan} · {source}',{plan:quota.planType||text('未知'),source:text(source)})+'\n'+ageText+(quota.stale?' · '+text('数据待更新'):'');
}
function renderTokens(){
  const view=window.quotaView.presentTokens(tokens,window.uiText.language),chart=document.getElementById('token-chart'),exact=document.getElementById('token-exact-values');chart.replaceChildren();exact.replaceChildren();
  document.getElementById('token-coverage').textContent=view.coverageText;
  const indexing=document.getElementById('token-status');indexing.textContent=view.coverageText.split(' · ')[0];indexing.hidden=tokens?.coverage==='complete';
  chart.setAttribute('aria-label',view.rows.map(row=>row.label+'：'+row.text+' token').join('，'));
  for(const row of view.rows){
    const item=document.createElement('div'),plot=document.createElement('div'),label=document.createElement('span'),value=document.createElement('div'),number=document.createElement('strong'),unit=document.createElement('span'),bar=document.createElement('div');
    item.className='token-column';item.title=row.label+'：'+row.text+' token';plot.className='token-plot';label.className='token-label';label.textContent=row.label.replace('最近','');value.className='token-value'+(row.number.length>6?' token-dense':'');number.className='token-number';number.textContent=row.number;unit.className='token-scale';unit.textContent=row.unit;value.append(number,unit);
    bar.className='token-bar';bar.style.width=row.percent+'%';plot.append(bar);item.append(label,value,plot);chart.append(item);
    const term=document.createElement('dt'),count=document.createElement('dd');term.textContent=label.textContent;count.textContent=row.text;exact.append(term,count);
  }
  document.getElementById('token-updated').textContent=Number.isFinite(tokens?.observedAt)?text('截至 {time} · 5 分钟缓存',{time:new Date(tokens.observedAt).toLocaleTimeString(window.uiText.language,{hour12:false})}):text('历史正在补齐，当前为部分覆盖');
}
button.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();button.setPointerCapture(event.pointerId);
  start={x:event.clientX,y:event.clientY,left:widgetPosition.x,top:widgetPosition.y};moved=false;
});
button.addEventListener('pointermove',event=>{
  if(!start)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  if(moved)window.widget.gesture({type:'drag',x:start.left+dx,y:start.top+dy});
});
function end(event){if(!start)return;if(!moved&&event.type==='pointerup'){clickFeedback();window.widget.gesture({type:'click'});}window.widget.gesture({type:'end'});start=null;}
button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
window.addEventListener('languagechange',()=>{render();renderTokens();});setInterval(render,1000);render();renderTokens();
