(()=>{
  const address=document.getElementById('dialogue-address'),first=document.getElementById('dialogue-first'),second=document.getElementById('dialogue-second'),message=document.getElementById('dialogue-message');
  let loaded=false;
  window.widget.dialogueRead().then(value=>{if(!value)return;address.value=value.address;first.value=value.lines[0];second.value=value.lines[1];loaded=true;}).catch(()=>{message.textContent=window.uiText.t('对话设置读取失败。');});
  document.getElementById('dialogue-save').addEventListener('click',async()=>{
    if(!loaded)return;
    const button=document.getElementById('dialogue-save');button.disabled=true;
    try{const result=await window.widget.dialogueEdit();if(result.value){address.value=result.value.address;first.value=result.value.lines[0];second.value=result.value.lines[1];}message.textContent=result.canceled?'':window.uiText.t(result.ok?'对话已保存。':result.error||'对话保存失败。');}
    catch(e){message.textContent=window.uiText.t(e.message);}finally{button.disabled=false;}
  });
})();
