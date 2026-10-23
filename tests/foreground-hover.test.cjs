const {test}=require('node:test'),assert=require('node:assert/strict');
const {mainHarness}=require('./main-harness.cjs');

async function hoverHarness(){
  const h=await mainHarness();
  h.run(`let testVisible=false;const reception=[],mouseEvents=[];
    win.isVisible=()=>testVisible;win.showInactive=()=>{testVisible=true;};win.hide=()=>{testVisible=false;};
    win.setIgnoreMouseEvents=(ignore,options)=>reception.push({ignore,forward:options?.forward===true});
    win.webContents.sendInputEvent=event=>mouseEvents.push(event);
    screen.getCursorScreenPoint=()=>({x:region[0].x+10,y:region[0].y+10});`);
  const socket=h.socket();
  const send=state=>socket.emit('data',JSON.stringify({token:h.bridgeInfo.token,state:{hostAlive:true,attached:true,visible:true,active:true,modal:false,dpi:96,bounds:{width:800,height:600},...state}})+'\n');
  send({});h.advance(16);
  return {h,send};
}

test('switching to another app hides the widget and cancels pending native hover',async()=>{
  const {h,send}=await hoverHarness();
  assert.equal(h.run('win.isVisible()'),true);
  assert.equal(h.run('reception.at(-1).ignore'),false);
  send({active:false});h.advance(16);
  assert.equal(h.run('win.isVisible()'),false,'an inactive Codex must not retain an occluded hover surface');
  assert.equal(h.run('reception.at(-1).ignore'),true);
  assert.equal(h.run('reception.at(-1).forward'),false,'forwarded mouse moves can create native tooltips over a browser');
  assert.equal(h.run('mouseEvents.some(event=>event.type==="mouseLeave")'),true);
  send({});h.advance(16);
  assert.equal(h.run('win.isVisible()'),true);
  assert.equal(h.run('reception.at(-1).ignore'),false,'returning to Codex must restore first-click reception');
});

test('leaving Codex disables forwarding even when the cursor was outside the widget',async()=>{
  const {h,send}=await hoverHarness();
  h.run('screen.getCursorScreenPoint=()=>({x:1,y:1})');h.advance(16);
  assert.equal(h.run('reception.at(-1).ignore'),true);
  send({active:false});h.advance(16);
  assert.equal(h.run('reception.at(-1).forward'),false);
});

test('a hidden, detached or modal host never enables hover reception',async()=>{
  for(const state of [{visible:false},{attached:false},{modal:true},{hostAlive:false}]){
    const {h,send}=await hoverHarness();send(state);h.advance(16);
    assert.equal(h.run('reception.at(-1).ignore'),true,JSON.stringify(state));
    assert.equal(h.run('reception.at(-1).forward'),false,JSON.stringify(state));
  }
});

test('a stale bridge disables hover until fresh active-host evidence arrives',async()=>{
  const {h,send}=await hoverHarness();h.advance(5000);
  assert.equal(h.run('win.isVisible()'),false);
  assert.equal(h.run('reception.at(-1).ignore'),true);
  assert.equal(h.run('reception.at(-1).forward'),false);
  send({});h.advance(16);
  assert.equal(h.run('win.isVisible()'),true);
  assert.equal(h.run('reception.at(-1).ignore'),false);
});
