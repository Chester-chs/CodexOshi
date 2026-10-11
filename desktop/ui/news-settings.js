(()=>{
  const $=id=>document.getElementById(id),t=(key,values)=>window.uiText.t(key,values);let snapshot=null;
  const statuses={unchecked:'尚未检查',available:'发现新版本 {version}',current:'已是当前版本',ahead:'本机版本领先于仓库',ok:'检查完成', 'rate-limited':'请求受限，稍后自动重试','network-unavailable':'暂时无法连接，保留上次结果','github-access':'仓库为私有或不可访问，请登录有权限的 GitHub CLI 账号','timeline-unavailable':'公开时间线暂不可读取，稍后重试','invalid-version':'版本信息无效','response-too-large':'数据源响应异常'};
  function render(){
    if(!snapshot)return;const {version,tibo}=snapshot;$('news-auto').checked=snapshot.enabled;
    $('codi-version').textContent='Codi '+version.current;$('version-result').textContent=t(statuses[version.status]||'暂时无法连接，保留上次结果',{version:version.latest});
    $('tibo-result').textContent=t(statuses[tibo.status]||'暂时无法连接，保留上次结果');
    $('tibo-notice').textContent=window.newsModel.noticeText(tibo.notice,window.uiText.language);
    $('tibo-quote').textContent=tibo.notice?.text?.slice(0,500)||'';$('tibo-quote').hidden=!tibo.notice;
    for(const kind of ['version','tibo']){const item=snapshot[kind];$(kind+'-checked').textContent=item.checkedAt?t('上次检查：{time}',{time:window.newsModel.localTime(item.checkedAt,window.uiText.language)}):'';}
    $('settings-open').classList.toggle('has-news',version.status==='available'||Boolean(tibo.notice&&tibo.notice.createdAt>Date.now()-2*86400000));
  }
  async function check(kind){const button=$(kind+'-check');button.disabled=true;$(kind+'-result').textContent=t('正在检查…');try{const result=await window.widget.newsCheck(kind);if(!result.ok)throw Error();snapshot=result.state;render();}catch{$(kind+'-result').textContent=t('检查未完成，请重试。');}finally{button.disabled=false;}}
  for(const kind of ['version','tibo']){$(kind+'-check').onclick=()=>check(kind);$(kind+'-open').onclick=async()=>{try{if(!(await window.widget.newsOpen(kind)).ok)throw Error();}catch{$(kind+'-result').textContent=t('链接无法打开，请重试。');}};}
  $('news-auto').onchange=async()=>{try{const result=await window.widget.newsEnabled($('news-auto').checked);if(!result.ok)throw Error();snapshot=result.state;render();}catch{render();$('version-result').textContent=t('设置未能保存，请重试。');}};
  window.widget.newsState(value=>{snapshot=value;render();});window.widget.newsRead().then(value=>{snapshot=value;render();}).catch(()=>{$('version-result').textContent=t('检查未完成，请重试。');});
  window.addEventListener('languagechange',render);setInterval(render,30000);
})();
