const {runMatch}=require('./harness.js');
const {makeSolStoch}=require('./solbot_stoch.js');
const {makeAgent}=require('./agent5.js');
const cfg=JSON.parse(process.argv[2]||'{}');
const N=+(process.argv[3]||40);
let W=0,G=0,w0=0,g0=0,w1=0,g1=0;const losses=[];
for(let seed=1;seed<=N;seed++){
  for(const swap of [0,1]){
    const A=makeAgent(cfg),B=makeSolStoch({},seed*7919);
    const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
    const as=swap?1:0;const win=r.winner===as;
    if(win){W++;if(as===0)w0++;else w1++;}else losses.push('seed'+seed+' s'+as+' t'+r.duration.toFixed(0)+' '+r.scores[as]+':'+r.scores[1-as]);
    G++;if(as===0)g0++;else g1++;
  }
}
console.log('TOTAL',W+'/'+G,(100*W/G).toFixed(1)+'%','| west',w0+'/'+g0,'east',w1+'/'+g1);
console.log(losses.slice(0,25).join('\n'));
