// Same real gesture handler and coordinates for both revisions; only external
// boundaries are replaced. Counts writes and serialization, not OS cache flushes.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{mainHarness}=require('./main-harness.cjs');
async function measure(source){const rows=[];for(const edge of [false,true]){
  const h=await mainHarness(source);for(let i=0;i<120;i++)h.gesture({type:'drag',x:edge?(i%2?9999:-9999):250+i,y:edge?(i%2?9999:-9999):150});
  const moving={events:120,writes:h.writes.length,positionWrites:h.writes.filter(w=>w.file==='position.json').length,diagnosticWrites:h.writes.filter(w=>w.file==='window-state.json').length,stringifies:h.stringifies,layouts:h.layouts.length};
  h.gesture({type:'end'});rows.push({case:edge?'viewport-edge':'inside-viewport',moving,totalAfterEnd:h.writes.length});
}
const h=await mainHarness(source);for(let i=0;i<720;i++){h.gesture({type:'drag',x:250+i%100,y:150});h.advance(1000/120);}
rows.push({case:'six-seconds-at-120hz',events:720,diagnosticWrites:h.writes.filter(w=>w.file==='window-state.json').length,positionWrites:h.writes.filter(w=>w.file==='position.json').length,layouts:h.layouts.length});return rows;}
(async()=>{const baseline=execFileSync('git',['show','bab3619:desktop/main.cjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});const result={baseline:'bab3619',before:await measure(baseline),after:await measure()};if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
