(()=>{
  const fields=['dialogue-address','dialogue-first','dialogue-second'].map(id=>document.getElementById(id)),[address,first,second]=fields;
  const message=document.getElementById('dialogue-message'),save=document.getElementById('dialogue-save');
  let saved=null,editing=false;
  const fill=value=>{address.value=value.address;first.value=value.lines[0];second.value=value.lines[1];};
  const show=text=>{message.dataset.i18n=text;message.textContent=window.uiText.t(text);};
  for(const field of fields)field.disabled=true;
  window.widget.dialogueRead().then(value=>{if(!value)return;saved=value;fill(value);for(const field of fields)field.disabled=false;}).catch(()=>show('对话设置读取失败。'));
  function finish(){if(!editing)return;editing=false;window.widget.dialogueFocus(false).catch(()=>{});}
  async function activate(field){
    if(editing||!saved)return;editing=true;
    try{const result=await window.widget.dialogueFocus(true);if(!result.ok){editing=false;field.blur();}else if(editing)field.focus();}catch{editing=false;field.blur();show('对话保存失败。');}
  }
  for(const field of fields){
    field.addEventListener('pointerdown',()=>activate(field));
    field.addEventListener('focus',()=>activate(field));
    field.addEventListener('blur',()=>queueMicrotask(()=>{if(!fields.includes(document.activeElement))finish();}));
  }
  document.addEventListener('pointerdown',event=>{if(!fields.includes(event.target)){finish();if(fields.includes(document.activeElement))document.activeElement.blur();}},true);
  window.widget.layout(value=>{if(!value.expanded){finish();if(fields.includes(document.activeElement))document.activeElement.blur();}});
  window.addEventListener('blur',()=>{finish();if(fields.includes(document.activeElement))document.activeElement.blur();});
  save.addEventListener('click',async()=>{
    if(!saved)return;finish();save.disabled=true;
    try{const value=window.dialogueModel.validate({address:address.value,lines:[first.value,second.value]});const result=await window.widget.dialogueSave(value);if(result.ok){saved=value;fill(value);}show(result.ok?'对话已保存。':result.error||'对话保存失败。');}
    catch(e){show(e.message);}finally{save.disabled=false;}
  });
  document.getElementById('dialogue-cancel').addEventListener('click',()=>{finish();if(saved)fill(saved);show('');});
})();
