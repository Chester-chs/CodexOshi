(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.appearanceModel=api;})(globalThis,()=>{
  const palettes=[
    {id:'oat',name:'莫兰迪',pair:'暖灰 × 燕麦',base:'#e9e5df',elevated:'#f7f4ef',sunken:'#d7d1c8',accent:'#786c60',tone:'light'},
    {id:'blue',name:'克莱因蓝',pair:'群青 × 纸白',base:'#eef0fa',elevated:'#fafaff',sunken:'#dce0f5',accent:'#2434af',tone:'light'},
    {id:'sage',name:'莫奈睡莲',pair:'雾绿 × 淡紫',base:'#e5ece7',elevated:'#f3f7f3',sunken:'#d3dfd8',accent:'#6b6088',tone:'light'},
    {id:'rose',name:'蒂芙尼蓝',pair:'蓝绿 × 珍珠白',base:'#dff3f0',elevated:'#f4fcfa',sunken:'#c8e5df',accent:'#0abab5',tone:'light'},
    {id:'forest',name:'黑白经典',pair:'墨黑 × 乳白',base:'#232323',elevated:'#2c2c2c',sunken:'#363636',accent:'#f0eee9',tone:'dark'},
    {id:'midnight',name:'梵高星夜',pair:'夜蓝 × 星金',base:'#202d49',elevated:'#2b3a59',sunken:'#374767',accent:'#e8c96b',tone:'dark'},
    {id:'orange',name:'爱马仕橙',pair:'暖橙 × 鞍棕',base:'#f6e9dd',elevated:'#fff8f0',sunken:'#ead4c0',accent:'#b74f13',tone:'light'}
  ];
  const defaults=()=>({palette:'oat'});
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('请选择有效的主题配色。');
    if(value.palette==='custom'){
      if(Object.keys(value).some(k=>!['palette','base','accent'].includes(k))||![value.base,value.accent].every(c=>typeof c==='string'&&/^#[\da-f]{6}$/i.test(c)))throw Error('请输入六位十六进制颜色，如 #336699。');
      return {palette:'custom',base:value.base.toLowerCase(),accent:value.accent.toLowerCase()};
    }
    if(Object.keys(value).some(k=>k!=='palette')||!palettes.some(p=>p.id===value.palette))throw Error('请选择有效的主题配色。');return {palette:value.palette};
  }
  function migrate(value){
    if(value?.palette!==undefined)return validate(value);
    if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['mode','accent','surface'].includes(k))||!['system','light','dark'].includes(value.mode)||typeof value.accent!=='string'||!/^#[\da-f]{6}$/i.test(value.accent)||!['theme','gray','cream','dark','translucent'].includes(value.surface))throw Error('外观设置无效。');
    const [r,g,b]=rgb(value.accent),green=g>r*1.15&&g>b*1.1,warm=r>b*1.2;
    return {palette:value.mode==='dark'||value.surface==='dark'?(green||warm?'forest':'midnight'):green?'sage':b>r*1.2?'blue':r>g*1.1&&b>g*1.1?'rose':'oat'};
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
  function resolve(value){
    const settings=validate(value),custom=settings.palette==='custom',customDark=custom&&luminance(settings.base)<.179;
    const p=custom?{base:settings.base,accent:settings.accent,elevated:mix(settings.base,customDark?'#000000':'#ffffff',.06),sunken:mix(settings.base,customDark?'#000000':'#ffffff',.12),tone:customDark?'dark':'light'}:palettes.find(p=>p.id===settings.palette),dark=p.tone==='dark',rgba=(color,a)=>`rgba(${rgb(color).join(',')},${a})`;
    const backgrounds=[p.base,p.elevated,p.sunken,...(custom?[]:[p.base,p.elevated].flatMap(c=>[mix('#000000',c,.94),mix('#ffffff',c,.94)]))];
    const accent=readable(p.accent,backgrounds,3),soft=custom?p.sunken:mix(p.base,accent,.10);backgrounds.push(soft);
    const primary=readable(dark?'#f4f0e9':'#292521',backgrounds),secondary=readable(dark?'#c1c9c3':'#66605a',backgrounds),tertiary=secondary,ink=readable(accent,backgrounds);
    const contrastText=contrast('#ffffff',accent)>=4.5?'#ffffff':'#000000',hover=mix(accent,contrastText==='#ffffff'?'#000000':'#ffffff',.08),border=dark?'rgba(255,255,255,.10)':'rgba(0,0,0,.08)';
    const danger=dark?'#ff6961':'#ff3b30',dangerInk=readable(danger,backgrounds);
    const variables={
      '--bg-base':p.base,'--bg-elevated':p.elevated,'--bg-sunken':p.sunken,'--bg-hover':soft,'--compact-surface':rgba(p.base,custom?1:.94),
      '--text-primary':primary,'--text-secondary':secondary,'--text-tertiary':tertiary,'--border-subtle':border,'--separator':border,
      '--accent':accent,'--accent-hover':hover,'--accent-contrast':contrastText,'--accent-soft':soft,'--accent-ink':ink,'--focus-ring':accent,
      '--warning':dark?'#ffb340':'#ff9500','--danger':danger,'--danger-ink':dangerInk,'--success':dark?'#32d74b':'#248a3d',
      '--checker-a':p.sunken,'--checker-b':p.elevated,'--scroll-thumb':secondary,
      '--shadow-panel':'0 8px 32px rgba(0,0,0,.12)','--shadow-card':'0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)','--color-scheme':p.tone
    };
    return {settings,mode:p.tone,variables,contrastPairs:[[primary,backgrounds],[secondary,backgrounds],[tertiary,backgrounds],[ink,backgrounds],[dangerInk,backgrounds],[contrastText,[accent,hover]]],adjusted:accent!==p.accent};
  }
  return {defaults,validate,migrate,resolve,contrast,palettes};
});
