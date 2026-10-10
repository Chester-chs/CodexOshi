(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.appearanceModel=api;})(globalThis,()=>{
  const accents=[{id:'blue',name:'蓝',color:'#007aff'},{id:'green',name:'绿',color:'#248a3d'},{id:'purple',name:'紫',color:'#8944d4'},{id:'pink',name:'粉',color:'#d63384'},{id:'orange',name:'橙',color:'#c76b00'},{id:'teal',name:'青',color:'#00838c'},{id:'gray',name:'灰',color:'#687078'}];
  const surfaces=[{id:'theme',name:'跟随主题'},{id:'gray',name:'浅灰'},{id:'cream',name:'米白'},{id:'dark',name:'深色'},{id:'translucent',name:'半透明'}];
  const defaults=()=>({mode:'system',accent:'#007aff',surface:'theme'});
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','accent','surface'].includes(k))||!['system','light','dark'].includes(value.mode)||typeof value.accent!=='string'||!/^#[\da-f]{6}$/i.test(value.accent)||!surfaces.some(s=>s.id===value.surface))throw Error('外观设置无效，请选择有效模式、底色与六位颜色。');
    return {mode:value.mode,accent:value.accent.toLowerCase(),surface:value.surface};
  }
  const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const hex=channels=>'#'+channels.map(c=>Math.round(c).toString(16).padStart(2,'0')).join('');
  const mix=(a,b,amount)=>hex(rgb(a).map((v,i)=>v*(1-amount)+rgb(b)[i]*amount));
  function luminance(color){return rgb(color).map(c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  const minimum=(color,backgrounds)=>Math.min(...backgrounds.map(b=>contrast(color,b)));
  function readable(color,backgrounds,ratio=4.5){
    if(minimum(color,backgrounds)>=ratio)return color;
    const target=minimum('#000000',backgrounds)>minimum('#ffffff',backgrounds)?'#000000':'#ffffff';
    for(let step=1;step<=100;step++){const candidate=mix(color,target,step/100);if(minimum(candidate,backgrounds)>=ratio)return candidate;}
    throw Error('配色无法保证文字可读。');
  }
  const light={base:'#f5f5f7',elevated:'#ffffff',sunken:'#e9e9ed',primary:'#1d1d1f',secondary:'#606064',tertiary:'#6d6d72',border:'rgba(0,0,0,.08)',shadow:'rgba(0,0,0,.12)',checker:'#e5e5ea'};
  const dark={base:'#242426',elevated:'#303034',sunken:'#3a3a3e',primary:'#f5f5f7',secondary:'#b0b0b5',tertiary:'#a1a1a8',border:'rgba(255,255,255,.10)',shadow:'rgba(0,0,0,.12)',checker:'#404044'};
  function resolve(value,systemDark=false){
    const settings=validate(value),mode=settings.mode==='system'?(systemDark?'dark':'light'):settings.mode;
    const tone=settings.surface==='dark'?'dark':mode,p={...(tone==='dark'?dark:light)};
    if(settings.surface==='gray')Object.assign(p,tone==='dark'?{base:'#2b2b2e',elevated:'#36363a',sunken:'#414145'}:{base:'#eeeeef',elevated:'#f9f9fa',sunken:'#e1e1e5'});
    if(settings.surface==='cream')Object.assign(p,tone==='dark'?{base:'#2c2925',elevated:'#38332d',sunken:'#443d35'}:{base:'#f8f4eb',elevated:'#fffdf7',sunken:'#ebe5d8'});
    const translucent=settings.surface==='translucent',alpha=translucent?.88:1;
    const rgba=(color,a)=>`rgba(${rgb(color).join(',')},${a})`;
    // Test both possible host extremes, including the permanently translucent resident strip.
    const backgrounds=[p.base,p.elevated,p.sunken,...[p.base,p.elevated].flatMap(c=>[mix('#000000',c,Math.min(alpha,.94)),mix('#ffffff',c,Math.min(alpha,.94))])];
    const accent=readable(settings.accent,backgrounds,3),soft=mix(p.base,accent,.10);backgrounds.push(soft);
    const primary=readable(p.primary,backgrounds),secondary=readable(p.secondary,backgrounds),tertiary=readable(p.tertiary,backgrounds),ink=readable(accent,backgrounds);
    const contrastText=contrast('#ffffff',accent)>=4.5?'#ffffff':'#000000',hover=mix(accent,contrastText==='#ffffff'?'#000000':'#ffffff',.08);
    const danger=tone==='dark'?'#ff6961':'#ff3b30',warning=tone==='dark'?'#ffb340':'#ff9500',dangerInk=readable(danger,backgrounds);
    const variables={
      '--bg-base':rgba(p.base,alpha),'--bg-elevated':rgba(p.elevated,translucent?.94:1),'--bg-sunken':p.sunken,'--bg-hover':soft,'--compact-surface':rgba(p.base,translucent?.88:.94),
      '--text-primary':primary,'--text-secondary':secondary,'--text-tertiary':tertiary,'--border-subtle':p.border,'--separator':p.border,
      '--accent':accent,'--accent-hover':hover,'--accent-contrast':contrastText,'--accent-soft':soft,'--accent-ink':ink,'--focus-ring':accent,
      '--warning':warning,'--danger':danger,'--danger-ink':dangerInk,'--success':tone==='dark'?'#32d74b':'#248a3d',
      '--checker-a':p.checker,'--checker-b':p.elevated,'--scroll-thumb':tone==='dark'?'#707078':'#b0b0b8',
      '--shadow-panel':`0 8px 32px ${p.shadow}`,'--shadow-card':'0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)',
      '--color-scheme':tone
    };
    return {settings,mode,variables,contrastPairs:[[primary,backgrounds],[secondary,backgrounds],[tertiary,backgrounds],[ink,backgrounds],[dangerInk,backgrounds],[contrastText,[accent,hover]]],adjusted:accent!==settings.accent};
  }
  return {defaults,validate,resolve,contrast,accents,surfaces};
});
