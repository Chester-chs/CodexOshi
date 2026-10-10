const {spawn}=require('node:child_process'),path=require('node:path');
function editDialogue(win,preferences,language){
  return new Promise((resolve,reject)=>{
    // Native owned dialog can accept keyboard/IME without disabling the overlay's
    // existing 80ms focus recovery. Text travels via stdin, never shell arguments.
    const child=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'dialogue-edit.ps1'),'-Owner',win.getNativeWindowHandle().readBigUInt64LE().toString()],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    let output='',failed=false;
    const closed=()=>child.kill();win.once('closed',closed);
    const cleanup=()=>win.removeListener('closed',closed);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>8192){failed=true;child.kill();}});
    child.on('error',()=>{cleanup();reject(Error('对话编辑器无法打开。'));});
    child.on('exit',code=>{cleanup();if(code!==0||failed)return reject(Error('对话编辑器无法打开。'));if(!output.trim())return resolve(null);try{resolve(JSON.parse(output));}catch{reject(Error('对话保存失败。'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({preferences,language}));
  });
}
module.exports={editDialogue};
