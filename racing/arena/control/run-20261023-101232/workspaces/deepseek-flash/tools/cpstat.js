const {execFile}=require('child_process');
const path=require('path');
const cfg=process.argv[2];
execFile(process.execPath,[path.join(__dirname,'_cpstat_worker.js')],{cwd:path.join(__dirname,'..'),env:Object.assign({},process.env,{AGENT_PARAMS:path.resolve(cfg),SEAT:process.env.SEAT||'0',SEEDFILE:process.env.SEEDFILE||'randseeds.txt'}),maxBuffer:1<<26},(e,out,err)=>{
  if(e) return console.log('ERR',e.message,String(err).slice(-300));
  console.log(out.trim());
});
