// Hidden renderer acceptance fixture using the real UI, without account reads.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {layout}=require('../desktop/geometry.cjs');
const output=process.argv[process.argv.indexOf('--output')+1];
app.setPath('userData',path.join(output,'chromium'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:720,height:480,frame:false,transparent:true,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const now=Date.now(),windows=[{id:'primary',label:'每周限额',remainingPercent:65,resetAt:now/1000+426260},{id:'secondary',label:'5 小时限额',remainingPercent:18,resetAt:now/1000+7200}];
  let lastLayout;
  const quota=count=>({windows:windows.slice(0,count),planType:'prolite',source:'http',observedAt:now,stale:false});
  ipcMain.on('ready',()=>{});await win.loadFile(path.resolve(__dirname,'../desktop/ui/index.html'));
  const results=[];
  for(const count of [0,1,2]){
    lastLayout=layout({x:400,y:40},720,480,true,count);win.webContents.send('layout',lastLayout);win.webContents.send('quota',quota(count));
    await new Promise(r=>setTimeout(r,250));
    const state=await win.webContents.executeJavaScript(`({cards:document.querySelectorAll('article').length,statement:document.querySelector('footer').textContent,detailsVisible:!document.querySelector('#details').hidden,scrollHeight:document.querySelector('#details').scrollHeight,clientHeight:document.querySelector('#details').clientHeight,text:document.querySelector('#status').textContent})`);
    assert.equal(state.cards,count);assert.equal(state.detailsVisible,true);assert.match(state.statement,/共享池/);assert.match(state.statement,/Chat 模式/);assert.match(state.statement,/非本插件估算/);
    fs.writeFileSync(path.join(output,'windows-'+count+'.png'),(await win.webContents.capturePage()).toPNG());results.push({count,...state});
  }
  lastLayout=layout({x:8,y:8},140,480,false,1);win.webContents.send('layout',lastLayout);win.webContents.send('quota',quota(1));await new Promise(r=>setTimeout(r,100));
  const narrow=await win.webContents.executeJavaScript(`({hidden:document.querySelector('#compact-track').hidden,text:document.querySelector('#status').textContent})`);assert.equal(narrow.hidden,true);assert.equal(narrow.text,'65%');
  fs.writeFileSync(path.join(output,'narrow.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'ui-smoke.json'),JSON.stringify({results,narrow},null,2));app.quit();
}).catch(error=>{process.stderr.write(String(error));app.exit(1);});
