// Hidden Electron integration: real renderer/Web Audio; quota/token/image-worker fixtures.
// Catches missing click playback, accidental drag/control playback, and lost mute state.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const Module=require('node:module'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const outputArg=process.argv.indexOf('--output');
assert.ok(outputArg>=0&&process.argv[outputArg+1],'--output is required');
const output=path.resolve(process.argv[outputArg+1]),builtinMode=process.argv.includes('--builtin'),customMode=process.argv.includes('--custom')||builtinMode,data=path.join(output,builtinMode?'builtin-data':customMode?'custom-data':'data');
const restart=process.argv.includes('--restart'),role=path.join(data,'characters','音效测试角色');
let selectedSound=path.join(data,'喜欢的音效.wav');
if(customMode){dialog.showOpenDialog=async()=>selectedSound?{canceled:false,filePaths:[selectedSound]}:{canceled:true,filePaths:[]};}
fs.mkdirSync(role,{recursive:true});
if(!restart){
  fs.copyFileSync(path.join(__dirname,'fixtures/portrait-white.png'),path.join(role,'tired.png'));
  fs.writeFileSync(path.join(role,'settings.json'),JSON.stringify({images:{tired:'tired.png'},targetHeight:280}));
  fs.writeFileSync(path.join(data,'characters','active.json'),JSON.stringify({name:'音效测试角色'}));
  for(const file of ['panel-preferences.json','dialogue-preferences.json']){
    try{fs.unlinkSync(path.join(data,file));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  fs.mkdirSync(path.join(data,'sounds'),{recursive:true});fs.writeFileSync(path.join(data,'sounds','active.json'),builtinMode?JSON.stringify({preset:'bell',source:'preset'}):'null');
  if(customMode){fs.writeFileSync(selectedSound,require('./audio-fixture.cjs').wav());fs.writeFileSync(path.join(data,'too-long.wav'),require('./audio-fixture.cjs').wav(31));}
}
const quota={resetCredits:{availableCount:2,observedAt:Date.now(),stale:false},windows:[{remainingPercent:55,label:'每周限额',resetAt:Math.floor(Date.now()/1000)+3600}],planType:'plus',source:'http',observedAt:Date.now()};
const tokens=require('./token-fixture.cjs')();
process.argv.push('--data',data);
const load=Module._load;
Module._load=function(name,parent,...args){
  if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot=quota;}async refresh(){return quota;}}};
  if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){queueMicrotask(()=>this.emit('message',{type:'tokens',value:tokens}));}terminate(){}}};
  return load.call(this,name,parent,...args);
};

// Install before any production script, including after reload. Keep the native
// context, buffers, sources, and scheduling; redirect only the hardware output.
function installAudioProbe(){
  const probe=window.__clickSoundProbe={contexts:0,starts:0,buffers:[],errors:[],rejections:[],lastPointerId:null};
  window.addEventListener('error',event=>probe.errors.push(event.message));
  window.addEventListener('unhandledrejection',event=>probe.rejections.push(String(event.reason?.stack||event.reason)));
  window.addEventListener('pointerdown',event=>{probe.lastPointerId=event.pointerId;},true);
  // Image-worker processing is outside sound behavior. Decode the geometric
  // fixture locally and deliver its normal bitmap boundary to the real player.
  const NativeWorker=window.Worker;
  window.Worker=class{
    constructor(url,...options){
      if(String(url)!=='image-worker.js')return new NativeWorker(url,...options);
      this.closed=false;
    }
    async postMessage({url}){
      try{
        const response=await fetch(url),bitmap=await createImageBitmap(await response.blob());
        if(this.closed){bitmap.close();return;}
        this.onmessage?.({data:{bitmap,contentWidth:bitmap.width,contentHeight:bitmap.height,reason:'',backgroundRemoved:false,frameIndex:0,frames:1}});
      }catch(error){if(!this.closed)this.onerror?.(error);}
    }
    terminate(){this.closed=true;}
  };
  const NativeAudioContext=window.AudioContext,nativeConnect=AudioNode.prototype.connect,sinks=new WeakMap();
  AudioNode.prototype.connect=function(...args){
    if(args[0]===this.context.destination&&sinks.has(this.context))args[0]=sinks.get(this.context);
    return nativeConnect.apply(this,args);
  };
  window.AudioContext=class extends NativeAudioContext{
    constructor(...args){
      super(...args);probe.contexts++;
      const sink=this.createGain();sink.gain.value=0;
      nativeConnect.call(sink,this.destination);sinks.set(this,sink);
      const createSource=this.createBufferSource.bind(this);
      this.createBufferSource=()=>{
        const source=createSource(),nativeStart=source.start.bind(source),nativeSourceConnect=source.connect.bind(source);let gain;
        source.connect=(target,...args)=>{gain=target.gain;return nativeSourceConnect(target,...args);};
        source.start=(...startArgs)=>{
          const samples=source.buffer?.getChannelData(0)||[];let peak=0,energy=0;
          for(const sample of samples){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
          probe.buffers.push({frames:samples.length,peak,rms:Math.sqrt(energy/(samples.length||1)),volume:gain?.value});
          const result=nativeStart(...startArgs);probe.starts++;return result;
        };
        return source;
      };
    }
  };
}
const loadFile=BrowserWindow.prototype.loadFile;
let startupPhase='creating window';
BrowserWindow.prototype.loadFile=async function(...args){
  this.webContents.setAudioMuted(true);
  // CDP needs a live renderer target before accepting Page commands.
  startupPhase='creating blank renderer target';
  await this.loadURL('about:blank');
  this.webContents.debugger.attach('1.3');
  startupPhase='enabling renderer debugger';
  await this.webContents.debugger.sendCommand('Page.enable');
  startupPhase='installing audio probe';
  await this.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`(${installAudioProbe.toString()})()`});
  startupPhase='loading renderer';
  return loadFile.apply(this,args);
};
BrowserWindow.prototype.showInactive=function(){};
require('../desktop/main.cjs');

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=()=>JSON.parse(fs.readFileSync(path.join(data,'window-state.json'),'utf8'));
const saved=()=>JSON.parse(fs.readFileSync(path.join(data,'panel-preferences.json'),'utf8'));
let socket,heartbeat;
(async()=>{
  await app.whenReady();let bridge;
  for(let attempt=0;attempt<250&&!bridge;attempt++){
    try{const candidate=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(candidate.pid===process.pid)bridge=candidate;}catch{}
    if(!bridge)await delay(20);
  }
  assert.ok(bridge,'Hidden fixture must publish its own bridge; phase: '+startupPhase);
  socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=extra=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,bounds:{width:1200,height:1000},...extra}})+'\n');
  send();heartbeat=setInterval(()=>send(),200);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  const probe=()=>js('JSON.parse(JSON.stringify(window.__clickSoundProbe))');
  async function waitFor(code){
    const deadline=Date.now()+5000;
    while(!(await js(code))){if(Date.now()>deadline)throw Error('UI condition timed out: '+code);await delay(25);}
  }
  async function ready(){
    await waitFor(`document.querySelector('#character-canvas').dataset.source?.includes('tired.png')`);
    await delay(180);
    assert.equal(win.isVisible(),false,'Fixture must remain hidden');
    assert.equal(win.webContents.isAudioMuted(),true,'Fixture must mute hardware output');
  }
  async function center(selector){
    return js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  }
  function input(type,point,extra={}){win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1,...extra});}
  async function click(point){input('mouseMove',point);input('mouseDown',point);await delay(25);input('mouseUp',point);await delay(160);}
  async function expectNoPlayback(action,label){
    const before=await probe(),clicks=state().clicks;
    await action();await delay(100);
    const after=await probe();assert.equal(after.starts,before.starts,label+' must not play');
    assert.equal(state().clicks,clicks,label+' must not advance dialogue');
  }
  async function openSoundSettings(){
    await click(await center('#settings-open'));
    assert.equal(state().expanded,true);
    await js(`document.querySelector('#character-tab').click();document.querySelector('#click-sound-enabled').scrollIntoView({block:'center'});for(const animation of document.querySelector('#details').getAnimations())animation.finish()`);
    await delay(100);
  }
  async function cycleBubble(){
    const starts=(await probe()).starts;
    await click(await center('#speech'));assert.equal(state().speechIndex,1,'Clicking the first bubble advances to the second dialogue');
    await click(await center('#speech'));assert.equal(state().speechIndex,0,'Clicking the second bubble returns to the first dialogue');
    await js(`document.querySelector('#speech').focus()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await delay(100);
    assert.equal(state().speechIndex,1,'Enter advances the focused bubble');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await delay(100);
    assert.equal(state().speechIndex,0,'Space returns the focused bubble to the first dialogue');
    assert.equal((await probe()).starts,starts,'Speech bubble clicks must not play the portrait sound');
  }
  async function assertClean(){const result=await probe();assert.deepEqual(result.errors,[],'Renderer errors');assert.deepEqual(result.rejections,[],'Unhandled renderer rejections');return result;}
  await ready();
  await click(await center('#settings-open'));
  await js(`document.querySelector('#appearance-tab').click()`);
  send();await delay(100);
  assert.equal(await js(`document.querySelector('#appearance-tab').getAttribute('aria-selected')`),'true','A refresh must keep the chosen tab while settings stay open');
  await click(await center('#close'));await click(await center('#settings-open'));
  assert.equal(await js(`document.querySelector('#quota-tab').getAttribute('aria-selected')`),'true','Reopening settings must always return to quota');
  await js(`document.querySelector('#character-tab').click()`);send({outsideClick:true});await delay(100);
  await click(await center('#settings-open'));
  assert.equal(await js(`document.querySelector('#quota-tab').getAttribute('aria-selected')`),'true','Outside dismissal must also reset the next opening');
  await click(await center('#close'));
  assert.equal((await probe()).contexts,0,'No AudioContext before a confirmed click');
  if(builtinMode){
    const soundFile=path.join(data,'sounds','active.json'),soundState=()=>JSON.parse(fs.readFileSync(soundFile,'utf8'));
    async function activate(selector){await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await click(await center(selector));}
    function assertSparkle(note){assert.ok(note.frames>=13440&&note.frames<=13441,'The sole built-in sound is the 280 ms starlight duo');assert.ok(note.peak>.09&&note.peak<.10);assert.equal(note.volume,.25);}
    async function useBuiltin(){
      const starts=(await probe()).starts,retained=soundState()?.id;
      await activate('#sound-builtin-select');
      await waitFor(`document.querySelector('#sound-builtin-select').hidden&&!document.querySelector('#sound-upload').disabled`);
      assert.equal(soundState().source,'preset');assert.equal(soundState().preset,'sparkle');assert.equal(soundState().id,retained);
      assert.equal((await probe()).starts,starts,'Choosing the default must not auto-play');
      assert.equal(await js(`document.querySelector('#sound-filename').textContent`),'星光双音');
    }
    async function previewCurrent(){
      const before=fs.readFileSync(soundFile,'utf8'),starts=(await probe()).starts;
      await activate('#sound-preview');await waitFor(`window.__clickSoundProbe.starts===${starts+1}`);
      assert.equal(fs.readFileSync(soundFile,'utf8'),before,'Preview must not save or change the selected sound');
      return (await assertClean()).buffers.at(-1);
    }
    async function setVolume(value){
      await js(`(()=>{const input=document.querySelector('#sound-volume-value');input.value='${value}';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(`(async()=> (await window.widget.panelPreferencesRead()).clickSoundVolume===${value})()`);await delay(70);
      assert.equal(saved().clickSoundVolume,value);
    }
    async function assertRestored(){
      assert.equal(soundState().preset,'sparkle');assert.equal(soundState().source,'preset');assert.ok(soundState().id,'Uploaded clip remains retained');assert.equal(saved().clickSoundVolume,25);
      await openSoundSettings();assert.equal(await js(`document.querySelector('#sound-filename').textContent`),'星光双音');assert.equal(await js(`document.querySelector('#sound-custom-select').hidden`),false);assert.equal(await js(`document.querySelector('#sound-builtin-select').hidden`),true);
      await click(await center('#close'));const starts=(await probe()).starts;await click(await center('#character-canvas'));await waitFor(`window.__clickSoundProbe.starts===${starts+1}`);
      assertSparkle((await assertClean()).buffers.at(-1));
    }
    if(restart){
      await assertRestored();fs.writeFileSync(path.join(output,'builtin-restart.json'),JSON.stringify({passed:true,builtinCustomAndVolumePersistAcrossProcessRestart:true,hardwareOutputMuted:true,audio:await assertClean()},null,2));return;
    }
    await openSoundSettings();await setVolume(25);
    assert.equal((await probe()).contexts,0,'Loading the default and changing volume is lazy and silent');
    assert.equal(await js(`document.querySelectorAll('#sound-presets,.sound-presets,.sound-preset-choice,.sound-preset-preview').length`),0,'Removed sound preset UI must not reappear');
    assert.equal(await js(`typeof window.widget.soundPreset`),'undefined','Removed preset selection IPC must not be exposed');
    assert.equal(await js(`document.querySelector('#sound-filename').textContent`),'星光双音');
    const migrated=await js(`window.widget.soundRead()`);assert.equal(migrated.preset,'sparkle');assert.equal(migrated.source,'preset');assert.equal(migrated.custom,null);
    const builtinNote=await previewCurrent();assertSparkle(builtinNote);
    const starts=(await probe()).starts;
    await activate('#sound-upload');await waitFor(`!document.querySelector('#sound-upload').disabled&&document.querySelector('#sound-filename').textContent==='喜欢的音效.wav'`);
    const uploaded=soundState().id;assert.ok(uploaded);assert.equal(soundState().source,'custom');assert.equal((await probe()).starts,starts,'Upload must not auto-play');
    assert.equal(await js(`document.querySelector('#sound-builtin-select').hidden`),false);assert.equal(await js(`document.querySelector('#sound-custom-select').hidden`),true);
    await useBuiltin();assert.equal(soundState().id,uploaded,'Using the default retains the uploaded sound');
    assertSparkle(await previewCurrent());
    await activate('#sound-custom-select');await waitFor(`document.querySelector('#sound-custom-select').hidden&&!document.querySelector('#sound-upload').disabled`);
    assert.equal(soundState().id,uploaded);assert.equal(soundState().source,'custom');
    const customNote=await previewCurrent();assert.equal(customNote.frames,5760);assert.ok(customNote.peak>.35);assert.equal(customNote.volume,.25);
    await activate('#sound-reset');await waitFor(`document.querySelector('#sound-reset').hidden&&!document.querySelector('#sound-upload').disabled`);assert.equal(soundState(),null);assertSparkle(await previewCurrent());
    assert.equal(await js(`document.querySelector('#sound-custom-select').hidden&&document.querySelector('#sound-builtin-select').hidden`),true,'Removing the uploaded sound leaves just the default');
    await activate('#sound-upload');await waitFor(`!document.querySelector('#sound-upload').disabled&&document.querySelector('#sound-filename').textContent==='喜欢的音效.wav'`);await useBuiltin();
    await setVolume(0);assert.equal(await js(`document.querySelector('#sound-preview').disabled`),true);
    await expectNoPlayback(()=>js(`document.querySelector('#sound-preview').click()`),'Zero-volume preview');
    await setVolume(25);await activate('#click-sound-enabled');await waitFor(`document.querySelector('#click-sound-enabled').checked===false&&!document.querySelector('#click-sound-enabled').disabled`);
    assert.equal(await js(`document.querySelector('#sound-preview').disabled`),true);
    await expectNoPlayback(()=>js(`document.querySelector('#sound-preview').click()`),'Muted preview');
    await activate('#click-sound-enabled');await waitFor(`document.querySelector('#click-sound-enabled').checked===true&&!document.querySelector('#click-sound-enabled').disabled`);
    await js(`window.widget.panelLanguage('en-US')`);await waitFor(`window.uiText.language==='en-US'`);
    assert.equal(await js(`document.querySelector('#sound-filename').textContent`),'Starlight duo');
    await js(`window.widget.panelLanguage('zh-CN')`);await waitFor(`window.uiText.language==='zh-CN'`);assert.equal(await js(`document.querySelector('#sound-filename').textContent`),'星光双音');
    fs.unlinkSync(selectedSound);send({outsideClick:true});await delay(100);const finished=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.webContents.reload();await finished;await ready();
    await assertRestored();
    fs.writeFileSync(path.join(output,'builtin-sound-ui.json'),JSON.stringify({passed:true,settingsAlwaysReopenQuota:true,onlyStarlightDuo:builtinNote,legacyPresetMigratesToStarlight:true,presetUiAndIpcRemoved:true,previewDoesNotSaveOrSwitch:true,choiceSavesWithoutAutoplay:true,uploadedSoundRetainedAndReselectable:true,removeRestoresDefault:true,volume25:true,zeroVolumeAndMuteDisablePreview:true,englishAndChinese:true,reloadPreservesBuiltinCustomAndVolume:true,hardwareOutputMuted:true,audio:await assertClean()},null,2));return;
  }
  if(customMode){
    const soundState=()=>JSON.parse(fs.readFileSync(path.join(data,'sounds','active.json'),'utf8'));
    async function volume(value){await js(`(()=>{const input=document.querySelector('#sound-volume-value');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor(`(async()=> (await window.widget.panelPreferencesRead()).clickSoundVolume===${value})()`);await delay(60);assert.equal(saved().clickSoundVolume,value);}
    async function upload(){await js(`document.querySelector('#sound-upload').scrollIntoView({block:'center'})`);await click(await center('#sound-upload'));await waitFor(`!document.querySelector('#sound-upload').disabled`);}
    async function customClick(){const before=(await probe()).starts;await click(await center('#character-canvas'));await waitFor(`window.__clickSoundProbe.starts>${before}`);const result=await assertClean(),note=result.buffers.at(-1);assert.ok(note,'Custom clip scheduled: '+JSON.stringify(result));assert.ok(note.peak>.35&&note.peak<.45);assert.equal(note.frames,5760);assert.equal(note.volume,.25);return result;}
    if(restart){
      assert.ok(soundState()?.id,'Custom choice survives process restart');assert.equal(saved().clickSoundVolume,25);
      const audio=await customClick();assert.equal(audio.starts,1);
      fs.writeFileSync(path.join(output,'custom-restart.json'),JSON.stringify({passed:true,customAndVolumePersistAcrossRestart:true,audio},null,2));return;
    }
    await openSoundSettings();await volume(25);assert.equal((await probe()).contexts,0,'Changing volume remains lazy');
    await upload();const firstId=soundState().id;assert.equal(await js(`document.querySelector('#sound-filename').textContent`),'喜欢的音效.wav');
    await js(`document.querySelector('#sound-preview').scrollIntoView({block:'center'})`);await click(await center('#sound-preview'));
    let audio=await assertClean();assert.equal(audio.starts,1);assert.equal(audio.buffers.at(-1).volume,.25);assert.ok(audio.buffers.at(-1).peak>.35);
    selectedSound=path.join(data,'too-long.wav');await upload();assert.equal(soundState().id,firstId,'A rejected long clip must keep the previous sound');assert.match(await js(`document.querySelector('#sound-message').textContent`),/30/);
    selectedSound=null;await upload();assert.equal(soundState().id,firstId,'Cancelling the picker keeps the sound');
    await volume(0);const starts=(await probe()).starts;await click(await center('#close'));await click(await center('#character-canvas'));assert.equal((await probe()).starts,starts,'Zero volume is silent');assert.equal(state().speechVisible,true);
    await openSoundSettings();await volume(25);await js(`document.querySelector('#sound-reset').click()`);await waitFor(`document.querySelector('#sound-reset').hidden`);assert.equal(soundState(),null);
    await click(await center('#close'));await click(await center('#character-canvas'));audio=await assertClean();assert.ok(audio.buffers.at(-1).peak<.2,'Reset restores the built-in chime');assert.equal(audio.buffers.at(-1).volume,.25);
    await openSoundSettings();selectedSound=path.join(data,'喜欢的音效.wav');await upload();fs.unlinkSync(selectedSound);
    send({outsideClick:true});await delay(100);const finished=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.webContents.reload();await finished;await ready();
    audio=await customClick();assert.equal(audio.starts,1,'Reload plays the retained local clip');
    fs.writeFileSync(path.join(output,'custom-sound-ui.json'),JSON.stringify({passed:true,settingsAlwaysReopenQuota:true,upload:true,preview:true,volume25:true,zeroVolumeSilent:true,longClipRejected:true,canceledUploadPreserved:true,builtInReset:true,customAndVolumePersistAcrossReload:true,originalFileRemoved:true,hardwareOutputMuted:true,audio},null,2));return;
  }
  assert.equal((await js('window.widget.panelPreferencesRead()')).clickSoundEnabled!==false,!restart);
  if(restart){
    assert.equal(saved().clickSoundEnabled,false,'Mute must survive a full application restart');
    await click(await center('#character-canvas'));
    assert.equal(state().speechVisible,true);assert.equal(state().speechIndex,0);
    await click(await center('#character-canvas'));assert.equal(state().speechIndex,0,'Every portrait click starts from the first dialogue');
    await cycleBubble();await click(await center('#speech'));assert.equal(state().speechIndex,1);
    await click(await center('#character-canvas'));assert.equal(state().speechIndex,0,'A portrait click also resets the second dialogue');
    assert.equal((await probe()).contexts,0);assert.equal((await probe()).starts,0);
    await openSoundSettings();assert.equal(await js(`document.querySelector('#click-sound-enabled').checked`),false);
    const clean=await assertClean();
    fs.writeFileSync(path.join(output,'restart.json'),JSON.stringify({passed:true,imageWorkerBoundary:'local fixture bitmap',mutedAcrossProcessRestart:true,portraitAlwaysFirst:true,bubbleCyclesWithoutSound:true,audio:clean},null,2));
    return;
  }

  const portrait=await center('#character-canvas');
  input('mouseMove',portrait);input('mouseDown',portrait);await delay(100);
  assert.equal((await probe()).contexts,0,'Pointerdown alone must not create audio');
  input('mouseUp',portrait);await delay(180);
  assert.equal((await probe()).starts,1,'First portrait click must schedule one chime');
  assert.equal(state().speechVisible,true);assert.equal(state().speechIndex,0);
  const firstText=await js(`document.querySelector('#speech-text').textContent`);assert.ok(firstText.trim());
  await click(portrait);
  assert.equal((await probe()).starts,2,'Second portrait click must schedule one more chime');
  assert.equal((await probe()).contexts,1,'Clicks must reuse the audio context');
  assert.equal(state().speechIndex,0,'Repeated portrait clicks always show the first dialogue');
  assert.equal(await js(`document.querySelector('#speech-text').textContent`),firstText);
  await cycleBubble();await click(await center('#speech'));assert.equal(state().speechIndex,1);
  assert.notEqual(await js(`document.querySelector('#speech-text').textContent`),firstText);
  await click(portrait);assert.equal(state().speechIndex,0,'Portrait click resets an already advanced bubble');
  assert.equal((await probe()).starts,3,'Only portrait clicks schedule sounds');

  await expectNoPlayback(async()=>{
    input('mouseMove',portrait);input('mouseDown',portrait);await delay(25);
    input('mouseMove',{x:portrait.x+8,y:portrait.y},{modifiers:['leftButtonDown']});await delay(40);
    input('mouseUp',{x:portrait.x+8,y:portrait.y});
  },'Drag exceeding the three-pixel threshold');
  await expectNoPlayback(async()=>{
    input('mouseMove',portrait);input('mouseDown',portrait);await delay(25);
    await js(`document.querySelector('#widget').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:window.__clickSoundProbe.lastPointerId,pointerType:'mouse',button:0}))`);
    input('mouseUp',portrait);
  },'Cancelled pointer gesture');
  await expectNoPlayback(()=>click({x:10,y:10}),'Background click');
  await expectNoPlayback(openSoundSettings,'Settings gear');
  assert.equal(await js(`document.querySelector('#click-sound-enabled').checked`),true);
  await click(await center('#click-sound-enabled'));
  await waitFor(`document.querySelector('#click-sound-enabled').checked===false&&!document.querySelector('#click-sound-enabled').disabled`);
  assert.equal(saved().clickSoundEnabled,false,'Mute checkbox must persist the setting');
  assert.equal((await js('window.widget.panelPreferencesRead()')).clickSoundEnabled,false);
  assert.equal((await probe()).starts,3,'Muting must not create another chime');
  await click(await center('#close'));
  await click(portrait);
  assert.equal(state().speechVisible,true);assert.equal(state().speechIndex,0);
  assert.equal((await probe()).starts,3,'Muted clicks must keep dialogue without audio');

  const audio=await assertClean();
  for(const buffer of audio.buffers){assert.ok(buffer.frames>=13440&&buffer.frames<=13441,'Portrait clicks use the default starlight duo');assert.ok(buffer.peak>.09&&buffer.peak<.10);assert.ok(buffer.rms>.005);}
  const rendered=await js(`(async()=>{
    const samples=window.codiSound.renderChime(48000),context=new OfflineAudioContext(1,samples.length,48000);
    const buffer=context.createBuffer(1,samples.length,48000);buffer.copyToChannel(samples,0);
    const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start();
    const data=(await context.startRendering()).getChannelData(0);let peak=0,energy=0;
    for(const sample of data){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
    return {frames:data.length,duration:data.length/48000,peak,rms:Math.sqrt(energy/data.length)};
  })()`);
  assert.ok(rendered.duration>=.28&&rendered.duration<.281);
  assert.ok(rendered.peak>.02&&rendered.peak<.2);assert.ok(rendered.rms>.005,'Actual offline Web Audio output must be nonzero');

  send({outsideClick:true});await delay(150);
  const finished=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  win.webContents.reload();await finished;await ready();
  assert.equal((await probe()).contexts,0,'Reload must preserve lazy muted audio');
  assert.equal((await js('window.widget.panelPreferencesRead()')).clickSoundEnabled,false);
  await openSoundSettings();assert.equal(await js(`document.querySelector('#click-sound-enabled').checked`),false);
  await click(await center('#close'));await click(await center('#character-canvas'));
  assert.equal(state().speechVisible,true);assert.equal(state().speechIndex,0);
  await click(await center('#character-canvas'));assert.equal(state().speechIndex,0);await cycleBubble();
  const reloaded=await assertClean();assert.equal(reloaded.contexts,0);assert.equal(reloaded.starts,0);
  const result={passed:true,settingsAlwaysReopenQuota:true,hidden:true,hardwareOutputMuted:true,imageWorkerBoundary:'local fixture bitmap',portraitAlwaysFirst:true,bubbleCyclesWithoutSound:true,pointerdownLazy:true,nonClickGesturesSilent:['drag','pointercancel','background','settings'],muteSaved:true,mutedBubbleCycles:true,reloadPreservesMute:true,audio,offline:rendered,reloaded};
  fs.writeFileSync(path.join(output,'click-sound-ui.json'),JSON.stringify(result,null,2));
})().then(()=>{clearInterval(heartbeat);socket?.destroy();app.quit();}).catch(error=>{
  clearInterval(heartbeat);socket?.destroy();process.stderr.write(error.stack+'\n');app.exit(1);
});
