const {parentPort,workerData}=require('node:worker_threads');
const {TokenIndex}=require('./tokens.cjs');
const emit=value=>parentPort.postMessage({type:'tokens',value});
const index=new TokenIndex({...workerData,onUpdate:emit});
parentPort.on('message',message=>{
  if(message?.type!=='read')return;
  index.refresh().then(value=>{if(value.cacheHit)emit(value);}).catch(()=>{
    emit({...index.snapshot(),coverage:'partial',readErrors:index.errors+1});
  });
});
