const test=require('node:test'),assert=require('node:assert/strict');
const sound=()=>require('../desktop/ui/click-sound.js');
function audioFixture(state='running'){
  const voices=[],contexts=[];let finishResume;
  const context={state,currentTime:1,sampleRate:48000,destination:{},resume(){return new Promise(resolve=>{finishResume=()=>{this.state='running';resolve();};});},close(){this.state='closed';return Promise.resolve();},
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,getChannelData:()=>data};},
    createGain(){return {gain:{value:1,setValueAtTime(){},cancelScheduledValues(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};},
    createBufferSource(){const voice={started:0,stopped:0,connect(){},disconnect(){},start(){this.started++;},stop(){this.stopped++;}};voices.push(voice);return voice;}};
  const player=sound().createPlayer({createContext:()=>{if(context.state==='closed'){context.state='running';context.currentTime=0;}contexts.push(context);return context;}});
  return {player,context,voices,contexts,resume:()=>finishResume()};
}
test('local chime is short, quiet and fades to silence at both boundaries',()=>{
  for(const rate of [44100,48000]){const data=sound().renderChime(rate);assert.ok(data.length/rate>=.1&&data.length/rate<=.3);let peak=0,sum=0;for(const value of data){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));sum+=value*value;}assert.ok(peak>.02&&peak<.2);assert.ok(Math.sqrt(sum/data.length)>.005);assert.equal(data[0],0);assert.ok(Math.abs(data.at(-1))<.00001);}
});
test('context stays lazy; mute suppresses playback and stops an existing note',async()=>{
  const f=audioFixture();assert.equal(f.contexts.length,0);f.player.setEnabled(false);assert.equal(await f.player.play(),false);assert.equal(f.contexts.length,0);
  f.player.setEnabled(true);assert.equal(await f.player.play(),true);assert.equal(f.voices.length,1);f.player.setEnabled(false);assert.ok(f.voices[0].stopped);assert.equal(await f.player.play(),false);
});
test('rapid clicks do not stack louder notes and normal clicks replay',async()=>{
  const f=audioFixture();await f.player.play();assert.equal(await f.player.play(),false);assert.equal(f.voices.length,1);
  f.context.currentTime+=.1;assert.equal(await f.player.play(),true);assert.equal(f.voices.length,2);assert.ok(f.voices[0].stopped);assert.equal(f.contexts.length,1);
});
test('muting while audio resumes cannot emit a late chime',async()=>{
  const f=audioFixture('suspended'),playing=f.player.play();f.player.setEnabled(false);f.resume();assert.equal(await playing,false);assert.equal(f.voices.length,0);
});
test('disposing releases the audio context and prevents later playback',async()=>{
  const f=audioFixture();await f.player.play();f.player.dispose();assert.equal(f.context.state,'closed');assert.ok(f.voices[0].stopped);assert.equal(await f.player.play(),false);
});
test('audio device failure is contained so character dialogue can still run',async()=>{
  const player=sound().createPlayer({createContext:()=>{throw Error('no audio device');}});assert.equal(await player.play(),false);player.dispose();
});
test('recreating a closed audio device resets the playback clock',async()=>{
  const f=audioFixture();f.context.currentTime=100;await f.player.play();f.context.state='closed';assert.equal(await f.player.play(),true);assert.equal(f.contexts.length,2);
});
