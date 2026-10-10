(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.appearanceModel=api;})(globalThis,()=>{
  const palettes=[
    {id:'oat',name:'燕麦摩卡',pair:'燕麦 × 摩卡',base:'#eee5d8',elevated:'#faf4eb',sunken:'#e0d5c6',accent:'#776150',tone:'light'},
    {id:'blue',name:'雾蓝米白',pair:'雾蓝 × 米白',base:'#e4ecf1',elevated:'#f1f6fa',sunken:'#d1dee7',accent:'#4a657b',tone:'light'},
    {id:'sage',name:'鼠尾草杏',pair:'鼠尾草 × 浅杏',base:'#e7eee7',elevated:'#f3f7f0',sunken:'#d4dfd3',accent:'#526650',tone:'light'},
    {id:'rose',name:'藕粉可可',pair:'藕粉 × 可可',base:'#efe3e4',elevated:'#faf2f1',sunken:'#e2d0d3',accent:'#825d68',tone:'light'},
    {id:'forest',name:'墨绿香槟',pair:'墨绿 × 香槟',base:'#20362f',elevated:'#2c443a',sunken:'#344e43',accent:'#ddcba8',tone:'dark'},
    {id:'midnight',name:'午夜雾蓝',pair:'午夜蓝 × 雾蓝',base:'#222d42',elevated:'#2e3a52',sunken:'#3b4860',accent:'#b7cadb',tone:'dark'}
  ];
  const defaults=()=>({palette:'oat'});
  function validate(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='palette')||!palettes.some(p=>p.id===value.palette))throw Error('请选择有效的主题配色。');return {palette:value.palette};}
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
    const settings=validate(value),p=palettes.find(p=>p.id===settings.palette),dark=p.tone==='dark',rgba=(color,a)=>`rgba(${rgb(color).join(',')},${a})`;
    const backgrounds=[p.base,p.elevated,p.sunken,...[p.base,p.elevated].flatMap(c=>[mix('#000000',c,.94),mix('#ffffff',c,.94)])];
    const accent=readable(p.accent,backgrounds,3),soft=mix(p.base,accent,.10);backgrounds.push(soft);
    const primary=readable(dark?'#f4f0e9':'#292521',backgrounds),secondary=readable(dark?'#c1c9c3':'#66605a',backgrounds),tertiary=secondary,ink=readable(accent,backgrounds);
    const contrastText=contrast('#ffffff',accent)>=4.5?'#ffffff':'#000000',hover=mix(accent,contrastText==='#ffffff'?'#000000':'#ffffff',.08),border=dark?'rgba(255,255,255,.10)':'rgba(0,0,0,.08)';
    const danger=dark?'#ff6961':'#ff3b30',dangerInk=readable(danger,backgrounds);
    const variables={
      '--bg-base':p.base,'--bg-elevated':p.elevated,'--bg-sunken':p.sunken,'--bg-hover':soft,'--compact-surface':rgba(p.base,.94),
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