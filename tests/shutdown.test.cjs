const {test}=require('node:test'),assert=require('node:assert/strict'),{mainHarness}=require('./main-harness.cjs');
test('late bridge packets are discarded after overlay destruction or before-quit without touching a destroyed window',async()=>{
  for(const quitting of [false,true]){
    const h=await mainHarness(),socket=h.socket();
    if(quitting)h.appEvent('before-quit');
    h.run(`win.isDestroyed=()=>true;win.hide=()=>{throw Error('destroyed window accessed');}`);
    assert.doesNotThrow(()=>socket.emit('data',JSON.stringify({token:h.bridgeInfo.token,state:{hostAlive:true,attached:true,visible:true,dpi:96,bounds:{width:800,height:600}}})+'\n'));
    assert.equal(socket.destroyed,true);assert.doesNotThrow(()=>h.advance(4000));
  }
});
