(()=>{
  const model=window.appearanceModel,$=id=>document.getElementById(id);
  const initialTheme=model.resolve(model.defaults());
  let settings=model.defaults(),custom={base:initialTheme.variables['--bg-base'],accent:initialTheme.variables['--accent']},revision=0,timer,paintFrame,picker=null;const error=text=>{$('appearance-error').dataset.i18n=text;$('appearance-error').textContent=window.uiText.t(text);};
  function paintPicker(){
    $('custom-color-picker').hidden=!picker||settings.palette!=='custom';if(!picker)return;
    const canvas=$('custom-color-plane'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    $('custom-color-title').textContent=window.uiText.t(picker.key==='base'?'卡片底色':'强调色');$('custom-color-hue').value=picker.h;
    ctx.fillStyle=window.colorPickerModel.toHex({h:picker.h,s:1,v:1});ctx.fillRect(0,0,w,h);
    let gradient=ctx.createLinearGradient(0,0,w,0);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,'#000000');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    ctx.beginPath();ctx.arc(Math.max(5,Math.min(w-5,picker.s*w)),Math.max(5,Math.min(h-5,(1-picker.v)*h)),4,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#000000';ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle='#ffffff';ctx.stroke();
  }
  function paint(){
    const theme=model.resolve(settings),root=document.documentElement;
    cancelAnimationFrame(paintFrame);root.classList.add('theme-changing');root.dataset.theme=theme.mode;root.dataset.palette=settings.palette;
    for(const [key,value]of Object.entries(theme.variables))root.style.setProperty(key,value);
    for(const button of document.querySelectorAll('button[data-palette]')){const p=model.palettes.find(p=>p.id===button.dataset.palette);button.setAttribute('aria-pressed',String(p.id===settings.palette));button.querySelector('strong').textContent=window.uiText.t(p.name);button.querySelector('.palette-pair').textContent=window.uiText.t(p.pair);button.setAttribute('aria-label',window.uiText.t(p.name)+', '+window.uiText.t(p.pair));}
    $('custom-palette').setAttribute('aria-pressed',String(settings.palette==='custom'));$('custom-palette-editor').hidden=settings.palette!=='custom';
    for(const key of ['base','accent']){$('custom-'+key+'-swatch').style.backgroundColor=custom[key];$('custom-'+key+'-color').style.backgroundColor=custom[key];$('custom-'+key+'-color').setAttribute('aria-expanded',String(picker?.key===key&&settings.palette==='custom'));if(document.activeElement!==$('custom-'+key+'-hex'))$('custom-'+key+'-hex').value=custom[key];}paintPicker();
    $('appearance-adjustment').textContent=window.uiText.t(theme.adjusted?'已优化强调色对比，选择自动保存。':'卡片与进度条同步配色，选择自动保存。');
    paintFrame=requestAnimationFrame(()=>{paintFrame=requestAnimationFrame(()=>root.classList.remove('theme-changing'));});
  }
  async function persist(version,value){try{const result=await window.widget.appearanceSave?.(value);if(version===revision)error(result?.ok?'':result?.error||'配色未能保存。');}catch{if(version===revision)error('配色未能保存，请重试。');}}
  function choose(palette){
    if(palette==='custom'&&settings.palette!=='custom'){const current=model.resolve(settings);custom={base:current.variables['--bg-base'],accent:current.variables['--accent']};picker=null;}
    if(palette!=='custom')picker=null;
    settings=model.validate(palette==='custom'?{palette,...custom}:{palette});revision++;paint();clearTimeout(timer);const version=revision,value={...settings};timer=setTimeout(()=>persist(version,value),150);
  }
  $('custom-palette').onclick=()=>choose('custom');
  for(const key of ['base','accent']){
    const color=$('custom-'+key+'-color'),hex=$('custom-'+key+'-hex');
    color.addEventListener('click',()=>{picker=picker?.key===key?null:{key,...window.colorPickerModel.fromHex(custom[key])};paint();if(picker)$('custom-color-picker').scrollIntoView({block:'nearest'});});
    hex.addEventListener('input',()=>{if(!/^#[\da-f]{6}$/i.test(hex.value))return;custom[key]=hex.value.toLowerCase();if(picker?.key===key)picker={key,...window.colorPickerModel.fromHex(custom[key])};error('');choose('custom');});
    hex.addEventListener('change',()=>{if(!/^#[\da-f]{6}$/i.test(hex.value)){hex.value=custom[key];error('请输入六位十六进制颜色，如 #336699。');}});
  }
  function selectColor(){if(!picker)return;custom[picker.key]=window.colorPickerModel.toHex(picker);$('custom-'+picker.key+'-hex').value=custom[picker.key];error('');choose('custom');}
  $('custom-color-hue').addEventListener('input',()=>{if(picker){picker.h=Number($('custom-color-hue').value);selectColor();}});
  const plane=$('custom-color-plane');let picking=false;
  function point(event){if(!picker)return;const r=plane.getBoundingClientRect();picker.s=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width));picker.v=1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height));selectColor();}
  plane.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();picking=true;plane.setPointerCapture(event.pointerId);point(event);});
  plane.addEventListener('pointermove',event=>{if(picking)point(event);});for(const type of ['pointerup','pointercancel','lostpointercapture'])plane.addEventListener(type,()=>{picking=false;});
  for(const preset of model.palettes){
    const button=document.createElement('button'),preview=document.createElement('span'),name=document.createElement('strong'),pair=document.createElement('span');
    button.type='button';button.className='palette-choice';button.dataset.palette=preset.id;button.setAttribute('aria-label',preset.name+'，'+preset.pair);button.style.setProperty('--palette-base',preset.base);button.style.setProperty('--palette-accent',preset.accent);
    preview.className='palette-preview';preview.setAttribute('aria-hidden','true');name.textContent=preset.name;pair.className='palette-pair';pair.textContent=preset.pair;button.append(preview,name,pair);button.onclick=()=>choose(preset.id);$('palette-presets').append(button);
  }
  window.addEventListener('languagechange',paint);paint();const initialRevision=revision;
  window.widget.appearanceRead?.().then(value=>{if(revision===initialRevision&&value){try{settings=model.validate(value);if(settings.palette==='custom')custom={base:settings.base,accent:settings.accent};paint();}catch{}}}).catch(()=>{error('未能读取配色，已使用默认主题。');});
})();
