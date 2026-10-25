const {runMatch}=require('./harness.js');
const {makeSolStoch}=require('./solbot_stoch.js');
const {makeAgent}=require('./agent5.js');
const base=JSON.parse(require('fs').readFileSync('cands.json','utf8'))[0].cfg;
const SEEDS=+(process.argv[2]||40);
function score(cfg){
  let W=0,G=0,w0=0,w1=0;
  for(let s=1;s<=SEEDS;s++)for(const swap of [0,1]){
    const A=makeAgent(cfg),B=makeSolStoch({},s*7919);
    const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
    const as=swap?1:0;
    if(r.winner===as){W++;if(as===0)w0++;else w1++;}
    G++;
  }
  return {W,G,w0,w1};
}
const dims={
 fireWindow:[0.55,0.65,0.73,0.85,0.95,1.05],
 engageTank:[178,186,192,200,210,220],
 kiteLen:[35,42,47,52,58],
 focus:['unit-lowhp','fire-lowhp','global-lowhp','nearest'],
 retreatFrac:[0,0.1,0.2,0.3],
 defR:[280,326,380,440],
 upReserve:[0,30,55,90,130],
 attackBaseR:[180,200,214,235],
 repairHp:[900,1200,1500,1700],
 opening:['1n3n','2n2n','4near'],
 firstRally:['n0','near'],
 maxQueue:[1,2,3],
 mineSafeR:[0,150,250],
 stageR:[0,200,350],
 pushAdvantage:[0,1.2,1.4],
 objPull:[0,50,90],
};
for(const [dim,vals] of Object.entries(dims)){
  let out=[];
  for(const v of vals){const cfg=Object.assign({},base,{[dim]:v});const r=score(cfg);out.push(v+':'+(100*r.W/r.G).toFixed(0)+'%');}
  console.log(dim.padEnd(13),out.join(' '));
}
