// Hidden production renderer; geometric artwork and synthetic quota only.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),Module=require('node:module'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const output=path.resolve(process.argv[process.argv.indexOf('--output')+1]),data=path.join(output,'data'),role=path.join(data,'characters','几何角色');
fs.mkdirSync(role,{recursive:true});fs.copyFileSync(path.join(__dirname,'fixtures/portrait-white.png'),path.join(role,'ready.png'));
fs.writeFileSync(path.join(role,'settings.json'),JSON.stringify({images:{ready:'ready.png'},targetHeight:280,targetWidth:420,zoom:1}));
fs.writeFileSync(path.join(data,'characters','active.json'),JSON.stringify({name:'几何角色'}));
fs.writeFileSync(path.join(data,'panel-preferences.json'),JSON.stringify({widgetEnabled:true,dockBottomRight:true}));
process.argv.push('--data',data);const load=Module._load;
Module._load=function(name,parent,...args){if(name==='../runtime/quota.cjs')return {QuotaReader:class{constructor(){this.snapshot={windows:[{remainingPercent:79,label:'每周限额'}]};}async refresh(){return this.snapshot;}}};if(name==='node:worker_threads')return {Worker:class extends EventEmitter{postMessage(){}terminate(){}}};return load.call(this,name,parent,...args);};
BrowserWindow.prototype.showInactive=function(){};require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await app.whenReady();let bridge;for(let i=0;i<250&&!bridge;i++){try{const b=JSON.parse(fs.readFileSync(path.join(data,'bridge.json'),'utf8'));if(b.pid===process.pid)bridge=b;}catch{}await delay(20);}assert.ok(bridge);
  const socket=net.connect('\\\\.\\pipe\\'+bridge.pipe);await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});let dimensions={width:1600,height:1000},revision=0;
  const send=()=>socket.write(JSON.stringify({token:bridge.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,revision:++revision,bounds:dimensions}})+'\n');send();const heartbeat=setInterval(send,150);
  const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  async function waitFor(code){const deadline=Date.now()+5000;while(!(await js(code))){if(Date.now()>deadline)throw Error('UI condition timed out: '+code);await delay(25);}}
  await waitFor(`document.querySelector('#character-canvas').dataset.source?.includes('ready.png')`);
  await js(`(()=>{const c=document.querySelector('#character-canvas'),ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{const [x,y,width,height]=args.length===9?args.slice(5):args.slice(1);window.lastPortraitDraw={x,y,width,height,canvasWidth:c.width};draw(...args)};window.renderCharacter()})()`);
  async function check(){
    const m=await js(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {widget:rect('#widget'),bar:rect('.compact-line'),stage:rect('#character-stage'),gear:rect('#settings-open'),canvas:rect('#character-canvas'),draw:window.lastPortraitDraw,clientWidth:document.querySelector('#character-canvas').clientWidth}})()`);
    const factor=m.canvas.width/m.draw.canvasWidth,art={x:m.canvas.x+m.draw.x*factor,width:m.draw.width*factor},minimum=118*m.canvas.width/m.clientWidth;
    assert.ok(Math.abs(m.bar.width-Math.max(Math.min(minimum,m.canvas.width-8*m.canvas.width/m.clientWidth),art.width))<1,'footer must match rendered artwork width, not empty stage width: '+JSON.stringify(m));
    if(art.width>=minimum)assert.ok(Math.abs(m.bar.x-art.x)<1,'footer must align with the drawn portrait');
    assert.ok(m.bar.y>=m.stage.bottom,'footer must stay below the dress');assert.ok(m.bar.right<=m.widget.right+.5);assert.ok(m.bar.x>=m.widget.x-.5);
    assert.ok(m.gear.x>=m.bar.x&&m.gear.right<=m.bar.right+.5,'settings button must remain readable');
    assert.ok(Math.abs(m.widget.right-(dimensions.width-24))<1&&Math.abs(m.widget.bottom-(dimensions.height-24))<1,'bottom-right docking must stay fixed');return m;
  }
  const cases=[];
  for(const patch of [{targetWidth:420,targetHeight:280,zoom:1},{targetWidth:672,targetHeight:420,zoom:.5},{targetWidth:126,targetHeight:180,zoom:4},{targetWidth:360,targetHeight:300,zoom:2,x:1},{targetWidth:400,targetHeight:420,zoom:1,x:-1}]){
    const r=await js(`window.widget.characterAction(${JSON.stringify({action:'settings',name:'几何角色',patch})})`);assert.equal(r.ok,true);await delay(200);cases.push({patch,metrics:await check()});
  }
  dimensions={width:800,height:600};send();await delay(250);const reduced=await check();dimensions={width:1600,height:1000};send();await delay(250);const restored=await check();
  const deleted=await js(`window.widget.characterAction({action:'settings',name:'几何角色',patch:{zoom:1,x:0,y:0,targetWidth:420,targetHeight:280}})`);assert.equal(deleted.ok,true);await delay(150);
  await js(`document.querySelector('#character-canvas').dataset.source='';`);
  // A newly selected role with no image exercises the real placeholder path.
  fs.mkdirSync(path.join(data,'characters','空角色'),{recursive:true});fs.writeFileSync(path.join(data,'characters','空角色','settings.json'),'{}');
  const blank=await js(`window.widget.characterAction({action:'select',name:'空角色'})`);assert.equal(blank.ok,true);await waitFor(`document.querySelector('#character-canvas').dataset.source==='character://placeholder/ready'`);await delay(200);const placeholder=await check();
  assert.equal(win.isVisible(),false);fs.writeFileSync(path.join(output,'portrait-footer-ui.json'),JSON.stringify({passed:true,cases,reduced,restored,placeholder},null,2));clearInterval(heartbeat);socket.destroy();app.quit();
})().catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1);});
