// Hidden real-Electron integration fixture. No host attachment or input injection.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {shape}=require('./geometry.cjs');
const output=process.argv[process.argv.indexOf('--output')+1];
app.setPath('userData',path.join(path.dirname(output),'shape-smoke-chromium'));
app.disableHardwareAcceleration();
app.whenReady().then(()=>{
  const win=new BrowserWindow({show:false,frame:false,transparent:true,skipTaskbar:true,width:400,height:300});
  const invalid=[[],null,[{x:NaN,y:0,width:4,height:4}],Array(65).fill({x:2,y:2,width:4,height:4}),[{x:0,y:0,width:400,height:300}]];
  const sizes=[{width:160,height:112},{width:320,height:270}];
  for(const input of invalid){for(const profile of [undefined,sizes]){const result=shape(input,400,300,profile);assert.deepEqual(result,[{x:0,y:0,width:1,height:1}]);win.setShape(result);}}
  fs.writeFileSync(output,JSON.stringify({hwnd:win.getNativeWindowHandle().readBigUInt64LE().toString(),cases:invalid.length*2}));
  setTimeout(()=>app.quit(),15000);
});
