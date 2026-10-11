const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const REPO='https://github.com/Chester-chs/Codi',VERSION_API='https://api.github.com/repos/Chester-chs/Codi/releases/latest',TIMELINE='https://syndication.twitter.com/srv/timeline-profile/screen-name/thsottiaux';
function compareVersions(a,b){
  function parse(v){const m=typeof v==='string'&&v.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);if(!m||v.length>100)throw Error('invalid-version');return [m.slice(1,4).map(BigInt),m[4]?.split('.')];}
  const [x,xpre]=parse(a),[y,ypre]=parse(b),sign=(a,b)=>a>b?1:a<b?-1:0;
  for(let i=0;i<3;i++)if(x[i]!==y[i])return sign(x[i],y[i]);
  if(!xpre||!ypre)return xpre?-1:ypre?1:0;
  for(let i=0;i<Math.max(xpre.length,ypre.length);i++){const a=xpre[i],b=ypre[i];if(a===b)continue;if(a===undefined||b===undefined)return a===undefined?-1:1;const na=/^\d+$/.test(a),nb=/^\d+$/.test(b);return na&&nb?sign(BigInt(a),BigInt(b)):na!==nb?(na?-1:1):sign(a,b);}return 0;
}
function publishedVersion(release){
  const tag=release?.tag_name;
  if(release?.draft!==false||release?.prerelease!==false||typeof tag!=='string'||tag.length>100||!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)||
    release.html_url!==undefined&&release.html_url!==`${REPO}/releases/tag/${tag}`)throw Error('invalid-version');
  return tag.slice(1);
}
function parseTimeline(html){
  const raw=html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  let entries;try{entries=JSON.parse(raw).props.pageProps.timeline.entries;}catch{throw Error('timeline-unavailable');}
  if(!Array.isArray(entries)||entries.length>1000)throw Error('timeline-unavailable');
  const posts=[];
  for(const entry of entries){const t=entry?.content?.tweet,id=t?.id_str,text=t?.full_text||t?.text,createdAt=Date.parse(t?.created_at);
    if(t?.user?.screen_name?.toLowerCase()!=='thsottiaux'||t.retweeted_status||typeof id!=='string'||!/^\d{1,25}$/.test(id)||typeof text!=='string'||text.length>12000||!Number.isFinite(createdAt)||/^RT\s+@/.test(text))continue;
    posts.push({id,text,createdAt,url:'https://x.com/thsottiaux/status/'+id});
  }
  return posts.sort((a,b)=>b.createdAt-a.createdAt);
}
async function readPublic(url,options={}){
  if(![VERSION_API,TIMELINE].includes(url))throw Error('unsupported-source');
  const response=await (options.fetch||fetch)(url,{method:'GET',redirect:'error',credentials:'omit',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),headers:{'User-Agent':'Codi','Accept':url===VERSION_API?'application/vnd.github+json':'text/html'}});
  if(!response.ok){const error=Error(response.status===429?'rate-limited':response.status===404?'not-found':'network-unavailable');const retry=response.headers.get('retry-after');error.retryMs=/^\d+$/.test(retry||'')?Math.min(86400000,Number(retry)*1000):0;throw error;}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw Error('response-too-large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks).toString('utf8');
}
async function checkVersion(current,options={}){
  let raw;
  try{raw=await readPublic(VERSION_API,options);}catch(error){
    if(error.message!=='not-found')throw error;
    // Use the user's existing GitHub CLI login for this private repository; never read or expose its token.
    try{raw=(await (options.execFile||promisify(execFile))('gh',['api','repos/Chester-chs/Codi/releases/latest','--hostname','github.com'],{windowsHide:true,timeout:15000,maxBuffer:131072,signal:options.signal})).stdout;}catch{throw Error('github-access');}
  }
  let latest;try{latest=publishedVersion(JSON.parse(raw));}catch{throw Error('invalid-version');}
  const result=compareVersions(latest,current);
  return {current,latest,status:result>0?'available':result===0?'current':'ahead',url:REPO};
}
async function readTimeline(options={}){return parseTimeline(await readPublic(TIMELINE,options));}
module.exports={compareVersions,publishedVersion,parseTimeline,checkVersion,readTimeline,readPublic,VERSION_API,TIMELINE,REPO};
