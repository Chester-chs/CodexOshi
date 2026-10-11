(()=>{
  const get=id=>document.getElementById(id),player=window.clickSoundPlayer,upload=get('sound-upload'),reset=get('sound-reset'),preview=get('sound-preview'),file=get('sound-filename'),message=get('sound-message'),range=get('sound-volume'),number=get('sound-volume-value');
  let custom=null,busy=false,soundRevision=0,volume=100,savedVolume=100,volumeDirty=false,volumeRevision=0,volumeSaving=0,soundEnabled=true;
  function status(key){message.dataset.i18n=key;message.textContent=window.uiText.t(key);}
  function controls(){upload.disabled=reset.disabled=busy;reset.hidden=!custom;preview.disabled=busy||!soundEnabled||volume===0;}
  function showVolume(value){volume=value;range.value=number.value=String(value);player.setVolume(value);controls();}
  function showSound(state){soundRevision++;custom=state?.custom||null;file.textContent=custom?custom.name:window.uiText.t('内置音效');player.setSource(custom?.url||null);controls();}
  window.widget.soundState(showSound);
  const initial=soundRevision;window.widget.soundRead().then(value=>{if(initial===soundRevision)showSound(value);}).catch(()=>status('音效读取失败，请重新选择。'));
  function preferences(value){const settings=value.panelPreferences||value;soundEnabled=settings.clickSoundEnabled!==false;if(!volumeDirty&&!volumeSaving){savedVolume=settings.clickSoundVolume??100;showVolume(savedVolume);}controls();}
  window.widget.layout(preferences);
  const initialVolume=volumeRevision;window.widget.panelPreferencesRead().then(value=>{if(initialVolume===volumeRevision&&value&&!volumeDirty&&!volumeSaving)preferences(value);}).catch(()=>{});
  for(const input of [range,number]){
    input.addEventListener('input',()=>{volumeDirty=true;volumeRevision++;const value=Number(input.value);if(input.value!==''&&Number.isInteger(value)&&value>=0&&value<=100)showVolume(value);});
    input.addEventListener('change',async()=>{
      const value=Number(input.value);if(input.value===''||!Number.isInteger(value)||value<0||value>100){volumeRevision++;volumeDirty=false;showVolume(savedVolume);status('音量需为 0–100%。');return;}
      const revision=++volumeRevision;volumeDirty=true;volumeSaving++;showVolume(value);
      try{const result=await window.widget.panelSoundVolume(value);if(!result.ok)throw Error(result.error||'音效设置未能保存，请重试。');savedVolume=value;if(revision===volumeRevision){volumeDirty=false;status('');}}
      catch(error){if(revision===volumeRevision){volumeDirty=false;showVolume(savedVolume);status(error.message);}}
      finally{volumeSaving--;if(!volumeSaving&&!volumeDirty)showVolume(savedVolume);}
    });
  }
  upload.addEventListener('click',async()=>{
    if(busy)return;busy=true;controls();let candidate;
    try{const result=await window.widget.soundImport(window.uiText.language);if(!result.ok)throw Error(result.error);if(result.canceled)return;candidate=result.candidate;
      status('正在读取音效…');await player.prepare(candidate.url);
      const selected=await window.widget.soundSelect(candidate.id);if(!selected.ok)throw Error(selected.error);showSound(selected.state);status('音效已保存。');
    }catch(error){if(candidate)await window.widget.soundDiscard(candidate.id).catch(()=>{});status(error.message||'音效无法播放，请重新选择。');}
    finally{busy=false;controls();}
  });
  reset.addEventListener('click',async()=>{if(busy)return;busy=true;controls();try{const result=await window.widget.soundSelect(null);if(!result.ok)throw Error(result.error);showSound(result.state);status('');}catch(error){status(error.message||'音效设置未能保存，请重试。');}finally{busy=false;controls();}});
  preview.addEventListener('click',async()=>{if(busy)return;try{if(custom)await player.prepare(custom.url);if(!await player.play())status('音效未播放，请检查音效开关和音量。');else status('');}catch(error){status(error.message);}});
  window.addEventListener('languagechange',()=>{if(!custom)file.textContent=window.uiText.t('内置音效');});
  controls();
})();
