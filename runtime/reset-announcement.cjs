const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function parts(at,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function zonedTime(date,hour,minute,zone){
  const wall=Date.UTC(date.year,date.month-1,date.day,hour,minute),matches=[];
  // Reject both missing spring-forward times and ambiguous fall-back times.
  for(let offset=-14*60;offset<=14*60;offset+=15){const at=wall-offset*60000,p=parts(at,zone);if(p.year===date.year&&p.month===date.month&&p.day===date.day&&p.hour===hour&&p.minute===minute)matches.push(at);}
  return matches.length===1?matches[0]:null;
}
function parseAnnouncement(post){
  const text=typeof post.text==='string'?post.text.slice(0,12000):'';
  if(!/\bcodex\b/i.test(text)||!(/\breset(?:s|ting)?\b/i.test(text))||!Number.isFinite(post.createdAt))return null;
  const notice={...post,resetAt:null,kind:'unspecified'};
  if(/[?？]/.test(text)||/\b(?:if|might|may(?!\s+\d)|could|would|should|not|never|cancelled|canceled|delay(?:ed)?|postponed|moved|instead|previously|yesterday|last week)\b|\bwon['’]t\b|\bno reset\b/i.test(text))return notice;
  if(/\b(?:have|has|just|already)\s+(?:been\s+)?reset\b|\breset\s+(?:is\s+)?(?:done|complete)\b/i.test(text))return {...notice,kind:'announced'};
  // Bind the time to the sentence containing reset, including a date before the verb.
  // A later sentence about a livestream or launch must never become the reset time.
  const context=text.split(/(?<=[.!?])\s+|\n+/).find(sentence=>/\breset(?:s|ting)?\b/i.test(sentence))||'';
  if(context.length>400||/\b(?:livestream|webinar|meeting|demo)\b/i.test(context))return notice;
  let at=null;
  const iso=[...context.matchAll(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})\b/g)];
  if(iso.length===1){const [year,month,day]=iso[0][0].slice(0,10).split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return notice;at=Date.parse(iso[0][0]);}
  else if(iso.length>1)return notice;
  else {
    const relative=[...context.matchAll(/\bin\s+(\d{1,2})\s+(hours?|minutes?)\b(?:[\s,]+(?:and\s+)?(\d{1,2})\s+minutes?\b)?/gi)];
    if(relative.length===1){const match=relative[0],tail=context.slice(match.index+match[0].length);if(/^[\s,]+(?:and\s+)?\d+\s+\w+/.test(tail)||/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(context))return notice;at=post.createdAt+Number(match[1])*(/^hour/i.test(match[2])?3600000:60000)+Number(match[3]||0)*60000;}
    else {
      const times=[...context.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s+(UTC|GMT|PST|PDT|PT|EST|EDT|ET)\b/gi)];
      if(times.length!==1)return notice;
      const [,h,m='0',meridiem,abbr]=times[0];let hour=Number(h),minute=Number(m);
      if(meridiem){if(hour<1||hour>12)return notice;hour=hour%12+(/pm/i.test(meridiem)?12:0);}else if(hour>23)return notice;
      const zones={PT:'America/Los_Angeles',ET:'America/New_York',UTC:'UTC',GMT:'UTC',PST:'Etc/GMT+8',PDT:'Etc/GMT+7',EST:'Etc/GMT+5',EDT:'Etc/GMT+4'},zone=zones[abbr.toUpperCase()],date=parts(post.createdAt,zone);
      const explicit=context.match(/\b(\d{4})-(\d{2})-(\d{2})\b/),named=context.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i),weekday=context.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
      if(explicit){date.year=Number(explicit[1]);date.month=Number(explicit[2]);date.day=Number(explicit[3]);}
      else if(named){date.month=months.findIndex(m=>m.startsWith(named[1].toLowerCase()))+1;date.day=Number(named[2]);if(named[3])date.year=Number(named[3]);}
      else if(/\btomorrow\b/i.test(context)){const next=new Date(Date.UTC(date.year,date.month-1,date.day+1));date.year=next.getUTCFullYear();date.month=next.getUTCMonth()+1;date.day=next.getUTCDate();}
      else if(weekday){const day=new Date(Date.UTC(date.year,date.month-1,date.day)),offset=(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekday[1].toLowerCase())-day.getUTCDay()+7)%7;day.setUTCDate(day.getUTCDate()+offset);date.year=day.getUTCFullYear();date.month=day.getUTCMonth()+1;date.day=day.getUTCDate();}
      else if(!/\btoday\b/i.test(context))return notice;
      at=zonedTime(date,hour,minute,zone);
    }
  }
  // Discard invalid dates and schedules detached from the post by more than a week.
  if(!Number.isFinite(at)||at<post.createdAt-3600000||at>post.createdAt+7*86400000)return notice;
  return {...notice,resetAt:at,kind:'scheduled',approximate:/\b(?:around|about|roughly|approximately|aiming|targeting|hopefully)\b/i.test(context)};
}
module.exports={parseAnnouncement};
