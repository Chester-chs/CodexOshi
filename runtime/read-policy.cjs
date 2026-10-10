const path=require('node:path');
const USAGE_URL='https://chatgpt.com/backend-api/wham/usage';
function authorizeRead(operation){
  if(operation?.method==='GET'&&operation.url===USAGE_URL&&Object.keys(operation).length===2)return;
  if(['initialize','account/rateLimits/read'].includes(operation?.rpc)&&Object.keys(operation).length===1)return;
  if(typeof operation?.file==='string'&&typeof operation.codexHome==='string'&&Object.keys(operation).length===2){
    const relative=path.relative(path.resolve(operation.codexHome),path.resolve(operation.file));
    if(relative==='auth.json'||(!relative.startsWith('..')&&!path.isAbsolute(relative)&&relative.startsWith('sessions'+path.sep)&&relative.endsWith('.jsonl')))return;
  }
  throw Error('Read outside quota allowlist');
}
module.exports={USAGE_URL,authorizeRead};
