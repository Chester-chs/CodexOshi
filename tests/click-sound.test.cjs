const test=require('node:test'),assert=require('node:assert/strict');
const sound=()=>require('../desktop/ui/click-sound.js');
function audioFixture(state='running',options={}){
  const voices=[],contexts=[],gains=[];let finishResume;
  const context={state,currentTime:1,sampleRate:48000,destination:{},resume(){return new Promise(resolve=>{finishResume=()=>{this.state='running';resolve();};});},close(){this.state='closed';return Promise.resolve();},
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,getChannelData:()=>data};},
    createGain(){const gain={gain:{value:1,setValueAtTime(value){this.value=value;},cancelScheduledValues(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};gains.push(gain);return gain;},
    createBufferSource(){const voice={started:0,stopped:0,connect(){},disconnect(){},start(){this.started++;},stop(){this.stopped++;}};voices.push(voice);return voice;}};
  const player=sound().createPlayer({...options,createContext:()=>{if(context.state==='closed'){context.state='running';context.currentTime=0;}contexts.push(context);return context;}});
  return {player,context,voices,contexts,gains,resume:()=>finishResume()};
}
test('local chime is short, quiet and fades to silence at both boundaries',()=>{
  for(const rate of [44100,48000]){const data=sound().renderChime(rate);assert.ok(data.length/rate>=.1&&data.length/rate<=.3);let peak=0,sum=0;for(const value of data){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));sum+=value*value;}assert.ok(peak>.02&&peak<.2);assert.ok(Math.sqrt(sum/data.length)>.005);assert.equal(data[0],0);assert.ok(Math.abs(data.at(-1))<.00001);}
});
test('the default click plays the retained starlight duo waveform',async()=>{
  const f=audioFixture();assert.equal(await f.player.play(),true);
  const buffer=f.voices.at(-1).buffer,data=buffer.getChannelData(0);
  assert.equal(buffer.length,13441);
  const energy=frequency=>{let real=0,imaginary=0;for(let i=0;i<data.length;i++){const phase=2*Math.PI*frequency*i/48000;real+=data[i]*Math.cos(phase);imaginary+=data[i]*Math.sin(phase);}return real*real+imaginary*imaginary;};
  assert.ok(energy(1174.66)>energy(587.33)*100,'The first starlight note replaces the former wooden note');
  assert.ok(energy(1567.98)>energy(587.33)*100,'The second starlight note remains audible');
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

test('volume applies to playback and active notes, including zero-volume silence',async()=>{
  const f=audioFixture();f.player.setVolume(25);await f.player.play();assert.equal(f.gains.at(-1).gain.value,.25);
  f.player.setVolume(60);assert.equal(f.gains.at(-1).gain.value,.6);
  f.context.currentTime+=.1;f.player.setVolume(0);assert.equal(await f.player.play(),false);assert.equal(f.voices.length,1);
});
test('custom sound decoding is cached; source changes cancel pending playback and reject overly long files',async()=>{
  let finish;const decoded={duration:.12,length:5760},f=audioFixture();
  f.context.decodeAudioData=()=>new Promise(resolve=>finish=()=>resolve(decoded));
  const url='sound://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const player=sound().createPlayer({createContext:()=>f.context,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(44)})});
  player.setSource(url);const pending=player.play();await new Promise(resolve=>setImmediate(resolve));player.setSource(null);finish();assert.equal(await pending,false);assert.equal(f.voices.length,0);
  player.setSource(url);assert.equal(await player.play(),true);assert.equal(f.voices.at(-1).buffer,decoded);
  f.context.decodeAudioData=async()=>({duration:31,length:48000*31});
  await assert.rejects(player.prepare('sound://local/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),/30/);
  await assert.rejects(player.prepare('https://example.com/sound.mp3'));
});
test('starlight stays quiet with clean boundaries across supported sample rates',()=>{
  for(const rate of [8000,44100,48000,192000]){
    const data=sound().renderChime(rate);assert.ok(Math.abs(data.length/rate-.28)<1/rate);
    let peak=0,sum=0,maxStep=0;
    for(let i=0;i<data.length;i++){const value=data[i];assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));sum+=value*value;if(i)maxStep=Math.max(maxStep,Math.abs(value-data[i-1]));}
    assert.ok(peak>.02&&peak<.2);assert.ok(Math.sqrt(sum/data.length)>.005);
    assert.equal(data[0],0);assert.ok(Math.abs(data.at(-1))<.00001);assert.ok(maxStep<.15);
  }
  for(const rate of [0,7999,192001,NaN,Infinity])assert.throws(()=>sound().renderChime(rate),/sample rate/i);
});
test('returning from custom sound to default plays starlight without fetching again',async()=>{
  let fetches=0;const f=audioFixture('running',{fetch:async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(44)};}});
  const decoded={duration:.12,length:5760,numberOfChannels:1};f.context.decodeAudioData=async()=>decoded;
  f.player.setSource('sound://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(await f.player.play(),true);assert.equal(fetches,1);assert.equal(f.voices.at(-1).buffer,decoded);
  f.player.setSource(null);assert.equal(await f.player.play(),true);assert.equal(fetches,1);assert.equal(f.voices.at(-1).buffer.length,13441);
  assert.ok(f.voices[0].stopped);
});
test('pending audio resume is cancelled by source switch, mute, zero volume, and disposal',async()=>{
  for(const cancel of [player=>player.setSource('sound://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),player=>player.setEnabled(false),player=>player.setVolume(0),player=>player.dispose()]){
    const f=audioFixture('suspended'),playing=f.player.play();cancel(f.player);f.resume();assert.equal(await playing,false);assert.equal(f.voices.length,0);
  }
});
