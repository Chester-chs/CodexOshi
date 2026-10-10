(()=>{
  const model=window.appearanceModel,$=id=>document.getElementById(id),media=matchMedia('(prefers-color-scheme: dark)');
  let settings=model.defaults(),revision=0,timer,paintFrame;
  function paint(){
    const theme=model.resolve(settings,media.matches),root=document.documentElement;
    // Switch paired text/background tokens together; hover transitions resume next frame.
    cancelAnimationFrame(paintFrame);root.classList.add('theme-changing');
    if(settings.mode==='system')delete root.dataset.theme;else root.dataset.theme=settings.mode;
    root.dataset.surface=settings.surface;
    for(const [key,value]of Object.entries(theme.variables))root.style.setProperty(key,value);
    for(const item of document.querySelectorAll('button[data-accent]'))item.setAttribute('aria-pressed',String(item.dataset.accent===settings.accent));
    for(const item of document.querySelectorAll('button[data-mode]'))item.setAttribute('aria-pressed',String(item.dataset.mode===settings.mode));
    for(const item of document.querySelectorAll('button[data-surface]'))item.setAttribute('aria-pressed',String(item.dataset.surface===settings.surface));
    $('accent-custom').value=settings.accent;$('accent-value').textContent=settings.accent.toUpperCase();
    $('appearance-adjustment').textContent=theme.adjusted?'已自动调整强调色，确保清晰可读。':'配色实时生效，设置仅保存在本机。';
    paintFrame=requestAnimationFrame(()=>{paintFrame=requestAnimationFrame(()=>root.classList.remove('theme-changing'));});
  }
  async function persist(version,value){
    try{const result=await window.widget.appearanceSave?.(value);if(version===revision)$('appearance-error').textContent=result?.ok?'':result?.error||'外观未能保存。';}catch{if(version===revision)$('appearance-error').textContent='外观未能保存，请重试。';}
  }
  function changed(patch){try{settings=model.validate({...settings,...patch});revision++;paint();clearTimeout(timer);const version=revision,value={...settings};timer=setTimeout(()=>persist(version,value),150);}catch{$('appearance-error').textContent='请选择有效的六位颜色。';}}
  for(const preset of model.accents){
    const button=document.createElement('button');button.type='button';button.className='accent-swatch';button.dataset.accent=preset.color;button.setAttribute('aria-label',preset.name+'色');button.title=preset.name+'色';button.style.setProperty('--swatch-color',preset.color);button.style.setProperty('--swatch-ink',model.contrast('#ffffff',preset.color)>=4.5?'#ffffff':'#000000');button.onclick=()=>changed({accent:preset.color});$('accent-presets').append(button);
  }
  for(const surface of model.surfaces){const button=document.createElement('button');button.type='button';button.textContent=surface.name;button.dataset.surface=surface.id;button.onclick=()=>changed({surface:surface.id});$('surface-presets').append(button);}
  for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>changed({mode:button.dataset.mode});
  $('accent-custom').oninput=()=>changed({accent:$('accent-custom').value});media.addEventListener('change',paint);paint();
  const initialRevision=revision;
  window.widget.appearanceRead?.().then(value=>{if(revision===initialRevision&&value){try{settings=model.validate(value);paint();}catch{}}}).catch(()=>{$('appearance-error').textContent='未能读取外观设置，已使用默认配色。';});
})();
