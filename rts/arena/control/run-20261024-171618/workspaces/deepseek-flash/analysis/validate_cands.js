const {runMatch}=require('./harness.js');
const {makeSolStoch}=require('./solbot_stoch.js');
const {evalCfg}=require('./suite7.js');
const {makeAgent}=require('./agent5.js');
const CONFIGS=JSON.parse(require('fs').readFileSync(process.argv[2]||'cands.json','utf8'));
const SEEDS=+(process.argv[3]||100);
for(const {name,cfg} of CONFIGS){
  let W=0,G=0,w0=0,w1=0;
  for(let s=1;s<=SEEDS;s++)for(const swap of [0,1]){
    const A=makeAgent(cfg),B=makeSolStoch({},s*7919);
    const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
    const as=swap?1:0;
    if(r.winner===as){W++;if(as===0)w0++;else w1++;}
    G++;
  }
  const det=evalCfg(cfg,{});
  console.log(name.padEnd(8),'stoch',W+'/'+G,(100*W/G).toFixed(1)+'%','(W'+w0+',E'+w1+')','| det',det.wins+'/'+det.games,'box',det.boxWins+'/'+det.boxGames,'diff',det.avgDiff.toFixed(0));
}
