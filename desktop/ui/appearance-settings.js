(()=>{
  const model=window.appearanceModel,$=id=>document.getElementById(id);
  let settings=model.defaults(),revision=0,timer,paintFrame;const error=text=>{$('appearance-error').dataset.i18n=text;$('appearance-error').textContent=window.uiText.t(text);};
  function paint(){
    const theme=model.resolve(settings),root=document.documentElement;
    cancelAnimationFrame(paintFrame);root.classList.add('theme-changing');root.dataset.theme=theme.mode;root.dataset.palette=settings.palette;
    for(const [key,value]of Object.entries(theme.variables))root.style.setProperty(key,value);
    for(const button of document.querySelectorAll('button[data-palette]')){const p=model.palettes.find(p=>p.id===button.dataset.palette);button.setAttribute('aria-pressed',String(p.id===settings.palette));button.querySelector('strong').textContent=window.uiText.t(p.name);button.querySelector('.palette-pair').textContent=window.uiText.t(p.pair);button.setAttribute('aria-label',window.uiText.t(p.name)+', '+window.uiText.t(p.pair));}
    $('appearance-adjustment').textContent=window.uiText.t('卡片与进度条同步配色，选择自动保存。');
    paintFrame=requestAnimationFrame(()=>{paintFrame=requestAnimationFrame(()=>root.classList.remove('theme-changing'));});
  }
  async function persist(version,value){try{const result=await window.widget.appearanceSave?.(value);if(version===revision)error(result?.ok?'':result?.error||'配色未能保存。');}catch{if(version===revision)error('配色未能保存，请重试。');}}
  function choose(palette){settings=model.validate({palette});revision++;paint();clearTimeout(timer);const version=revision,value={...settings};timer=setTimeout(()=>persist(version,value),150);}
  for(const preset of model.palettes){
    const button=document.createElement('button'),preview=document.createElement('span'),name=document.createElement('strong'),pair=document.createElement('span');
    button.type='button';button.className='palette-choice';button.dataset.palette=preset.id;button.setAttribute('aria-label',preset.name+'，'+preset.pair);button.style.setProperty('--palette-base',preset.base);button.style.setProperty('--palette-accent',preset.accent);
    preview.className='palette-preview';preview.setAttribute('aria-hidden','true');name.textContent=preset.name;pair.className='palette-pair';pair.textContent=preset.pair;button.append(preview,name,pair);button.onclick=()=>choose(preset.id);$('palette-presets').append(button);
  }
  window.addEventListener('languagechange',paint);paint();const initialRevision=revision;
  window.widget.appearanceRead?.().then(value=>{if(revision===initialRevision&&value){try{settings=model.validate(value);paint();}catch{}}}).catch(()=>{error('未能读取配色，已使用默认主题。');});
})();
