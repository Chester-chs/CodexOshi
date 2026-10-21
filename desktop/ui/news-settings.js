(()=>{
  const $=id=>document.getElementById(id),t=(key,values)=>window.uiText.t(key,values);let snapshot=null;
  let update={status:'idle'},updatePending=false,updateRevision=0,updateReadFailed=false,updateReading=false;
  const activeUpdates=new Set(['preparing','downloading','installing','restarting']);
  const updateStatuses={preparing:'正在准备更新…',downloading:'正在下载更新…',installing:'正在安装更新…',restarting:'正在重启 CodexOshi…'};
  const updateErrors={
    network_error:'更新下载失败，请检查网络连接后重试。',authentication_required:'无法获取更新，请检查 GitHub 登录权限后重试。',
    invalid_release:'更新包无法验证，请稍后重新检查更新。',archive_unsafe:'更新包无法验证，请稍后重新检查更新。',download_too_large:'更新包无法验证，请稍后重新检查更新。',
    prepare_failed:'更新准备失败，请重试。',install_failed:'更新安装失败，请重试。',rollback_failed:'更新未完成，恢复旧版本失败。请重新安装 CodexOshi。',
    unsupported_installation:'当前安装方式不支持一键更新，请重新安装 CodexOshi。',update_in_progress:'更新正在进行，请稍候。',no_update:'暂时没有新版本，请重新检查更新。'
  };
  const statuses={unchecked:'尚未检查',available:'发现新版本 {version}',current:'已是当前版本',ahead:'本机版本领先于仓库', 'rate-limited':'请求受限，稍后自动重试','network-unavailable':'暂时无法连接，保留上次结果','github-access':'仓库为私有或不可访问，请登录有权限的 GitHub CLI 账号','invalid-version':'版本信息无效','response-too-large':'数据源响应异常'};
  function renderUpdate(){
    const busy=updatePending||activeUpdates.has(update.status),available=snapshot?.version.status==='available';
    const completedAvailable=update.status==='complete'&&update.version===snapshot?.version.latest;
    const button=$('version-update'),result=$('update-result');
    button.hidden=!busy&&(!available||completedAvailable);button.disabled=busy;button.setAttribute('aria-busy',String(busy));button.textContent=t(busy?'更新中…':'一键更新');
    let message='';
    if(updateStatuses[update.status])message=t(updateStatuses[update.status]);
    else if(update.status==='complete')message=update.version?t('已更新至 {version}。',{version:update.version}):t('更新已完成。');
    else if(update.status==='failed')message=t(updateErrors[update.error]||'更新未完成，请重试。');
    else if(updateReadFailed)message=t('更新状态暂不可读取，仍可检查更新。');
    result.textContent=message;result.hidden=!message;result.classList.toggle('update-error',update.status==='failed');
  }
  function render(){
    renderUpdate();if(!snapshot)return;const {version}=snapshot;$('news-auto').checked=snapshot.enabled;
    $('codi-version').textContent='CodexOshi '+version.current;$('version-result').textContent=t(statuses[version.status]||'暂时无法连接，保留上次结果',{version:version.latest});
    for(const kind of ['version']){const item=snapshot[kind];$(kind+'-checked').textContent=item.checkedAt?t('上次检查：{time}',{time:window.newsModel.localTime(item.checkedAt,window.uiText.language)}):'';}
    $('settings-open').classList.toggle('has-news',version.status==='available');
  }
  async function check(kind){const button=$(kind+'-check');button.disabled=true;$(kind+'-result').textContent=t('正在检查…');try{const result=await window.widget.newsCheck(kind);if(!result.ok)throw Error();snapshot=result.state;render();}catch{$(kind+'-result').textContent=t('检查未完成，请重试。');}finally{button.disabled=false;}}
  $('version-update').onclick=async()=>{
    if(updatePending||activeUpdates.has(update.status)||snapshot?.version.status!=='available')return;
    updatePending=true;updateReadFailed=false;update={status:'preparing'};updateRevision++;renderUpdate();const revision=updateRevision;
    try{
      const result=await window.widget.updateStart();
      if(!result?.ok){update=result?.state&&(activeUpdates.has(result.state.status)||['failed','complete'].includes(result.state.status))?{...result.state,error:result.state.error||result.error}:{status:'failed',error:result?.error};}
      else if(result.state&&revision===updateRevision)update=result.state;
    }catch{if(update.status!=='complete')update={status:'failed'};}
    finally{updatePending=false;renderUpdate();}
  };
  for(const kind of ['version']){$(kind+'-check').onclick=()=>check(kind);$(kind+'-open').onclick=async()=>{try{if(!(await window.widget.newsOpen(kind)).ok)throw Error();}catch{$(kind+'-result').textContent=t('链接无法打开，请重试。');}};}
  $('news-auto').onchange=async()=>{try{const result=await window.widget.newsEnabled($('news-auto').checked);if(!result.ok)throw Error();snapshot=result.state;render();}catch{render();$('version-result').textContent=t('设置未能保存，请重试。');}};
  window.widget.newsState(value=>{snapshot=value;render();});window.widget.newsRead().then(value=>{snapshot=value;render();}).catch(()=>{$('version-result').textContent=t('检查未完成，请重试。');});
  window.widget.updateState(value=>{updateRevision++;update=value;updateReadFailed=false;renderUpdate();});
  async function readUpdate(){
    if(updateReading)return;updateReading=true;const revision=updateRevision;
    try{const value=await window.widget.updateRead();if(revision===updateRevision&&value){updateRevision++;update=value;updateReadFailed=false;renderUpdate();}}
    catch{if(revision===updateRevision){updateReadFailed=true;renderUpdate();}}
    finally{updateReading=false;}
  }
  readUpdate();setInterval(()=>{if(activeUpdates.has(update.status))readUpdate();},1000);
  window.addEventListener('languagechange',render);setInterval(render,30000);
})();
