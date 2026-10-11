(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.codiSound=api;})(globalThis,()=>{
  // A quiet, original chime synthesized locally: no media download or permissions.
  function renderChime(sampleRate){
    if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Invalid sample rate');
    const duration=.24,samples=new Float32Array(Math.ceil(sampleRate*duration));
    for(let i=0;i<samples.length;i++){
      const t=i/sampleRate,phase=2*Math.PI*(880*t+140*(t-(1-Math.exp(-35*t))/35));
      const envelope=Math.min(1,t/.008)*Math.exp(-16*t)*Math.pow(Math.max(0,1-t/duration),2);
      samples[i]=.12*envelope*(Math.sin(phase)+.18*Math.sin(2*phase));
    }
    return samples;
  }
  function createPlayer(options={}){
    let context=null,buffer=null,enabled=true,disposed=false,revision=0,resuming=null,lastPlayed=-Infinity;
    const voices=new Set();
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
      if(!enabled||disposed)return false;
      const request=++revision;let voice;
      try{
        // Context creation/resume happens inside the pointer gesture, not at startup.
        if(!context||context.state==='closed'){
          context=(options.createContext||(()=>new globalThis.AudioContext()))();
          lastPlayed=-Infinity;
          const samples=renderChime(context.sampleRate);buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.getChannelData(0).set(samples);
        }
        if(context.state!=='running'){
          if(!resuming)resuming=Promise.resolve(context.resume()).finally(()=>{resuming=null;});
          await resuming;
        }
        if(disposed||!enabled||request!==revision||context.state!=='running'||context.currentTime-lastPlayed<.04)return false;
        for(const previous of voices)stop(previous);
        const source=context.createBufferSource(),gain=context.createGain();voice={source,gain,stopping:false};
        source.buffer=buffer;source.connect(gain);gain.connect(context.destination);source.onended=()=>finish(voice);
        voices.add(voice);source.start();lastPlayed=context.currentTime;return true;
      }catch{if(voice)finish(voice);return false;}
    }
    function setEnabled(value){if(enabled===Boolean(value))return;enabled=Boolean(value);revision++;if(!enabled)for(const voice of voices)stop(voice);}
    function dispose(){if(disposed)return;disposed=true;revision++;for(const voice of voices){stop(voice,false);finish(voice);}if(context)Promise.resolve(context.close()).catch(()=>{});buffer=null;}
    return {play,setEnabled,dispose};
  }
  return {renderChime,createPlayer};
});
