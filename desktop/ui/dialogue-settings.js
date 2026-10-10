(()=>{
  const fields=['dialogue-address','dialogue-first','dialogue-second'].map(id=>document.getElementById(id)),[address,first,second]=fields;
  const editableFields=[...fields,...['custom-base-hex','custom-accent-hex'].map(id=>document.getElementById(id))];
  const message=document.getElementById('dialogue-message'),save=document.getElementById('dialogue-save');
  let saved=null,editing=false;
  const groups=[first,second].map(field=>{const group=document.createElement('div');group.id=field.id+'-presets';group.className='dialogue-presets';group.setAttribute('role','group');field.closest('label').after(group);return group;});
  const help=document.createElement('p');help.className='character-help';help.dataset.i18n='预设可编辑，保存生效；{重置时间}如 3天21小时。';document.querySelector('.dialogue-actions').before(help);
  function paintPresets(){for(const [i,group]of groups.entries())for(const button of group.querySelectorAll('button')){button.disabled=!saved;button.setAttribute('aria-pressed',String([first,second][i].value===button.dataset.template));}}
  function renderPresets(){
    for(const [i,rows]of window.dialogueModel.presets(window.uiText.language).entries()){
      const group=groups[i];group.replaceChildren();group.setAttribute('aria-label',window.uiText.t(i?'第二段预设':'第一段预设'));
      for(const preset of rows){const button=document.createElement('button');button.type='button';button.dataset.preset=preset.id;button.dataset.template=preset.template;button.textContent=window.uiText.t(preset.label);button.setAttribute('aria-controls',[first,second][i].id);button.addEventListener('click',()=>{if(!saved)return;finish();[first,second][i].value=preset.template;paintPresets();show('预设已填入，可以继续编辑；保存后生效。');});group.append(button);}
    }
    help.textContent=window.uiText.t(help.dataset.i18n);paintPresets();
  }
  const fill=value=>{address.value=value.address;first.value=value.lines[0];second.value=value.lines[1];paintPresets();};
  const show=text=>{message.dataset.i18n=text;message.textContent=window.uiText.t(text);};
  for(const field of fields)field.disabled=true;
  window.widget.dialogueRead().then(value=>{if(!value)return;saved=value;fill(value);for(const field of fields)field.disabled=false;}).catch(()=>show('对话设置读取失败。'));
  renderPresets();window.addEventListener('languagechange',renderPresets);
  for(const field of [first,second])field.addEventListener('input',paintPresets);
  function finish(){if(!editing)return;editing=false;window.widget.dialogueFocus(false).catch(()=>{});}
  async function activate(field){
    if(editing||!saved)return;editing=true;
    try{const result=await window.widget.dialogueFocus(true);if(!result.ok){editing=false;field.blur();}else if(editing)field.focus();}catch{editing=false;field.blur();show('对话保存失败。');}
  }
  for(const field of editableFields){
    field.addEventListener('pointerdown',()=>activate(field));
    field.addEventListener('focus',()=>activate(field));
    field.addEventListener('blur',()=>queueMicrotask(()=>{if(!editableFields.includes(document.activeElement))finish();}));
  }
  document.addEventListener('pointerdown',event=>{if(!editableFields.includes(event.target)){finish();if(editableFields.includes(document.activeElement))document.activeElement.blur();}},true);
  window.widget.layout(value=>{if(!value.expanded){finish();if(editableFields.includes(document.activeElement))document.activeElement.blur();}});
  window.addEventListener('blur',()=>{finish();if(editableFields.includes(document.activeElement))document.activeElement.blur();});
  save.addEventListener('click',async()=>{
    if(!saved)return;finish();save.disabled=true;
    try{const value=window.dialogueModel.validate({address:address.value,lines:[first.value,second.value]});const result=await window.widget.dialogueSave(value);if(result.ok){saved=value;fill(value);}show(result.ok?'对话已保存。':result.error||'对话保存失败。');}
    catch(e){show(e.message);}finally{save.disabled=false;}
  });
  document.getElementById('dialogue-cancel').addEventListener('click',()=>{finish();if(saved)fill(saved);show('');});
})();
