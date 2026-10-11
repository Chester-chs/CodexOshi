const fs=require('node:fs'),path=require('node:path');
const publicNews=require('./public-news.cjs'),{parseAnnouncement}=require('./reset-announcement.cjs');
class NewsService {
  constructor(options){
    this.file=path.join(options.data,'news-state.json');this.version=options.version;this.now=options.now||Date.now;this.readTimeline=options.readTimeline||(()=>publicNews.readTimeline({signal:this.abort.signal}));this.checkVersion=options.checkVersion||(()=>publicNews.checkVersion(this.version,{signal:this.abort.signal}));this.onNotice=options.onNotice||(()=>{});this.onChange=options.onChange||(()=>{});this.abort=new AbortController();this.pending={};this.closed=false;
    this.state={enabled:true,version:{current:this.version,status:'unchecked',checkedAt:null,nextAt:0,blockedUntil:0},tibo:{status:'unchecked',notice:null,checkedAt:null,nextAt:0,blockedUntil:0},seen:[]};
    try{const stat=fs.statSync(this.file);if(stat.size>100000)throw Error('invalid-cache');const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
      this.state.enabled=saved.enabled!==false;this.state.seen=Array.isArray(saved.seen)?saved.seen.filter(k=>typeof k==='string'&&k.length<200).slice(-200):[];
      for(const kind of ['version','tibo']){const item=saved[kind];if(!item||typeof item!=='object')continue;if(kind==='version'&&item.current!==this.version)continue;
        for(const key of ['checkedAt','nextAt','blockedUntil'])if(Number.isFinite(item[key])&&item[key]>=0&&item[key]<=this.now()+86400000)this.state[kind][key]=item[key];
        if(['unchecked','available','current','ahead','ok','rate-limited','network-unavailable','github-access','timeline-unavailable','invalid-version','response-too-large'].includes(item.status))this.state[kind].status=item.status;
        if(kind==='version'){try{publicNews.compareVersions(item.latest,this.version);this.state.version.latest=item.latest;this.state.version.url=publicNews.REPO;}catch{}}
        else if(item.notice&&/^\d{1,25}$/.test(item.notice.id)&&Number.isFinite(item.notice.createdAt)&&typeof item.notice.text==='string')this.state.tibo.notice=parseAnnouncement({...item.notice,url:'https://x.com/thsottiaux/status/'+item.notice.id});
      }
    }catch{}
  }
  snapshot(){const {seen,...state}=this.state;return structuredClone(state);}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(this.state));fs.renameSync(temporary,this.file);}
  configure(enabled){if(typeof enabled!=='boolean')throw Error('invalid-preference');this.state.enabled=enabled;this.save();return this.snapshot();}
  deliver(kind){
    const state=this.state[kind],now=this.now();let key,notification;
    if(kind==='version'&&state.status==='available'){key='version:'+state.latest;notification={type:'version',version:state.latest};}
    if(kind==='tibo'){const notice=state.notice;if(notice&&notice.createdAt>=now-2*86400000&&(!notice.resetAt||notice.resetAt>now)){key='tibo:'+notice.id+':'+notice.kind+':'+notice.resetAt;notification={type:'tibo',notice};}}
    if(!key||this.state.seen.includes(key))return;
    // The desktop may be hidden or dragging when a request completes. Retry delivery from cache.
    if(this.onNotice(notification)===false)return;
    this.state.seen=[...this.state.seen,key].slice(-200);this.save();
  }
  check(kind,manual=false){
    if(!['version','tibo'].includes(kind))return Promise.reject(Error('invalid-source'));
    if(this.closed)return Promise.resolve(this.snapshot());if(this.pending[kind])return this.pending[kind];
    if(!manual&&!this.state.enabled)return Promise.resolve(this.snapshot());this.deliver(kind);
    const state=this.state[kind],now=this.now();if(now<state.blockedUntil||now<(manual?(state.checkedAt??-Infinity)+60000:state.nextAt))return Promise.resolve(this.snapshot());
    this.pending[kind]=this.run(kind).finally(()=>delete this.pending[kind]);return this.pending[kind];
  }
  async run(kind){
    const state=this.state[kind],now=this.now();state.checkedAt=now;
    try{
      if(kind==='version'){const value=await this.checkVersion();if(this.closed)return this.snapshot();Object.assign(state,value);}
      else {
        const posts=await this.readTimeline();if(this.closed)return this.snapshot();
        const notices=posts.filter(p=>p.createdAt<=now+60000&&p.createdAt>=now-7*86400000).map(parseAnnouncement).filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt);
        const previous=state.notice;
        if(notices[0]&&(!previous||notices[0].createdAt>=previous.createdAt))state.notice=notices[0];
        else if(previous&&previous.createdAt<now-7*86400000)state.notice=null;
        state.status='ok';
      }
      state.nextAt=now+(kind==='version'?6*3600000:30*60000);state.blockedUntil=0;
    }catch(error){if(this.closed)return this.snapshot();state.status=['rate-limited','github-access','timeline-unavailable','invalid-version','response-too-large'].includes(error.message)?error.message:'network-unavailable';state.nextAt=now+Math.max(30*60000,error.retryMs||0);state.blockedUntil=state.status==='rate-limited'?state.nextAt:0;}
    this.save();this.onChange(this.snapshot());this.deliver(kind);return this.snapshot();
  }
  close(){this.closed=true;this.abort.abort();}
}
module.exports={NewsService};
