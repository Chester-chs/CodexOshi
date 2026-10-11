(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.codiSound=api;})(globalThis,()=>{
  const DEFAULT_PRESET='sparkle';
  // The retained starlight duo: two soft, locally synthesized notes.
  function renderChime(sampleRate){
    if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Invalid sample rate');
    const duration=.28,samples=new Float32Array(Math.ceil(sampleRate*duration));
    const envelope=(t,attack,decay,end)=>t<=0?0:(1-Math.exp(-t/attack))*Math.exp(-decay*t)*Math.pow(Math.max(0,1-t/end),2);
    for(let i=0;i<samples.length;i++){
      const t=i/sampleRate,tau=2*Math.PI,second=t-.045;
      samples[i]=.085*envelope(t,.004,10,duration)*Math.sin(tau*1174.66*t)+.085*envelope(second,.004,12,duration-.045)*Math.sin(tau*1567.98*second);
    }
    return samples;
  }
  function createPlayer(options={}){
    let context=null,enabled=true,disposed=false,revision=0,resuming=null,lastPlayed=-Infinity,volume=100,sourceUrl=null,builtin=null;
    const voices=new Set(),customBuffers=new Map();
    function getContext(){
      if(disposed)throw Error('Audio player disposed');
      if(!context||context.state==='closed'){
        context=(options.createContext||(()=>new globalThis.AudioContext()))();lastPlayed=-Infinity;resuming=null;
        builtin=null;
      }
      return context;
    }
    function builtinBuffer(){
      if(!builtin){
        const samples=renderChime(context.sampleRate);builtin=context.createBuffer(1,samples.length,context.sampleRate);
        builtin.getChannelData(0).set(samples);
      }
      return builtin;
    }
    async function prepare(url){
      if(typeof url!=='string'||!/^sound:\/\/local\/[a-f0-9]{32}$/.test(url))throw Error('音效无效。');
      const audio=getContext();
      if(!customBuffers.has(url)){
        const loading=(async()=>{
          const response=await (options.fetch||globalThis.fetch)(url);if(!response.ok)throw Error('音效读取失败，请重新选择。');
          const bytes=await response.arrayBuffer();if(bytes.byteLength>10*1024*1024)throw Error('音效文件不能超过 10 MiB。');
          let decoded;try{decoded=await audio.decodeAudioData(bytes);}catch{throw Error('音效无法播放，请重新选择。');}
          if(!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>30||decoded.numberOfChannels>8)throw Error('音效时长需在 30 秒以内。');return decoded;
        })();
        customBuffers.set(url,loading);loading.catch(()=>{if(customBuffers.get(url)===loading)customBuffers.delete(url);});
        for(const key of customBuffers.keys())if(customBuffers.size>2&&key!==url&&key!==sourceUrl)customBuffers.delete(key);
      }
      return customBuffers.get(url);
    }
    function finish(voice){try{voice.source.disconnect();voice.gain.disconnect();}catch{}voices.delete(voice);}
    function stop(voice,fade=true){
      if(voice.stopping)return;voice.stopping=true;
      try{
        const now=context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);
        voice.gain.gain.linearRampToValueAtTime(0,now+(fade ? .01 : 0));voice.source.stop(now+(fade ? .01 : 0));
      }catch{finish(voice);}
    }
    async function play(){
      if(!enabled||disposed||volume===0)return false;
      const request=++revision;let voice;
      try{
        // Context creation/resume happens inside the pointer gesture, not at startup.
        getContext();
        if(context.state!=='running'){
          if(!resuming)resuming=Promise.resolve(context.resume()).finally(()=>{resuming=null;});
          await resuming;
        }
        let selected=builtinBuffer();
        if(sourceUrl)try{selected=await prepare(sourceUrl);}catch(error){options.onError?.(error);}
        if(disposed||!enabled||volume===0||request!==revision||context.state!=='running'||context.currentTime-lastPlayed<.04)return false;
        for(const previous of voices)stop(previous);
        const source=context.createBufferSource(),gain=context.createGain();voice={source,gain,stopping:false};
        gain.gain.value=volume/100;source.buffer=selected;source.connect(gain);gain.connect(context.destination);source.onended=()=>finish(voice);
        voices.add(voice);source.start();lastPlayed=context.currentTime;return true;
      }catch{if(voice)finish(voice);return false;}
    }
    function setEnabled(value){if(enabled===Boolean(value))return;enabled=Boolean(value);revision++;if(!enabled)for(const voice of voices)stop(voice);}
    function setVolume(value){if(!Number.isInteger(value)||value<0||value>100)return false;volume=value;for(const voice of voices)if(!voice.stopping)try{voice.gain.gain.setValueAtTime(value/100,context.currentTime);}catch{}if(value===0){revision++;for(const voice of voices)stop(voice);}return true;}
    function setSource(value){if(value!==null&&(typeof value!=='string'||!/^sound:\/\/local\/[a-f0-9]{32}$/.test(value)))return false;if(sourceUrl!==value){sourceUrl=value;revision++;for(const voice of voices)stop(voice);lastPlayed=-Infinity;}return true;}
    function dispose(){if(disposed)return;disposed=true;revision++;for(const voice of voices){stop(voice,false);finish(voice);}if(context)Promise.resolve(context.close()).catch(()=>{});builtin=null;customBuffers.clear();}
    return {play,setEnabled,setVolume,setSource,prepare,dispose};
  }
  return {DEFAULT_PRESET,renderChime,createPlayer};
});
