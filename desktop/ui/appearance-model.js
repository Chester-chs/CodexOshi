(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.appearanceModel=api;})(globalThis,()=>{
  const palettes=[
    {id:'blue',name:'克莱茵蓝',pair:'雾蓝 × 群青',base:'#e9edf6',elevated:'#eaeef7',sunken:'#eceff7',accent:'#002fa7',tone:'light'},
    {id:'oat',name:'申布伦黄',pair:'燕麦 × 暖金',base:'#f3eee3',elevated:'#f4efe5',sunken:'#f4f0e6',accent:'#fbd26a',tone:'light'},
    {id:'rose',name:'勃艮第红',pair:'玫瑰白 × 酒红',base:'#f1e9ed',elevated:'#f2eaee',sunken:'#f3ecef',accent:'#470024',tone:'light'},
    {id:'sage',name:'马尔斯绿',pair:'雾绿 × 蓝绿',base:'#e7efeb',elevated:'#e8f0ec',sunken:'#eaf1ed',accent:'#01847f',tone:'light'},
    {id:'forest',name:'凡戴克棕',pair:'米白 × 深棕',base:'#eee7df',elevated:'#efe8e1',sunken:'#f0eae3',accent:'#492d22',tone:'light'},
    {id:'midnight',name:'普鲁士蓝',pair:'灰蓝 × 深蓝',base:'#e5edf0',elevated:'#e7eef1',sunken:'#e8eff2',accent:'#003153',tone:'light'},
    {id:'orange',name:'提香红',pair:'杏白 × 暖红',base:'#f4e9e6',elevated:'#f5eae8',sunken:'#f5ece9',accent:'#d44848',tone:'light'}
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
    const backgrounds=[p.base,p.elevated,p.sunken];
    const accent=readable(p.accent,backgrounds,3),soft=p.sunken;backgrounds.push(soft);
    const primary=readable(dark?'#f4f0e9':'#292521',backgrounds),secondary=readable(dark?'#c1c9c3':'#66605a',backgrounds),tertiary=secondary,ink=readable(accent,backgrounds);
    const contrastText=contrast('#ffffff',accent)>=4.5?'#ffffff':'#000000',hover=mix(accent,contrastText==='#ffffff'?'#000000':'#ffffff',.08),border=dark?'rgba(255,255,255,.10)':'rgba(0,0,0,.08)';
    const danger=dark?'#ff6961':'#ff3b30',dangerInk=readable(danger,backgrounds);
    const variables={
      '--bg-base':p.base,'--bg-elevated':p.elevated,'--bg-sunken':p.sunken,'--bg-hover':soft,'--compact-surface':rgba(p.base,1),
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
