// Reserved for later stages. There is no data implementation in stage 1.
const FUTURE_READS=Object.freeze({
  http:Object.freeze({method:'GET',url:'https://chatgpt.com/backend-api/wham/usage'}),
  rpc:Object.freeze(['initialize','account/rateLimits/read']),
  local:Object.freeze(['session-files-read-only'])
});
function authorizeRead(){throw new Error('Data reads are disabled in stage 1');}
module.exports={FUTURE_READS,authorizeRead};
