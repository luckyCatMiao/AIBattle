const {runMatch}=require('./harness.js');
const {makeSolStoch}=require('./solbot_stoch.js');
const {makeAgent}=require('./agent5.js');
let seed=987654321;
function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;}
function pick(a){return a[Math.floor(rnd()*a.length)];}
function sample(){
  return {
    groupKite:false,
    kiteLen:40+Math.round(rnd()*20),
    fireWindow:+(0.7+rnd()*0.25).toFixed(2),
    engageTank:180+Math.round(rnd()*35),
    focus:pick(['fire-lowhp','unit-lowhp','global-lowhp','nearest']),
    upReserve:Math.round(rnd()*100),
    opening:pick(['1n3n','2n2n','4near']),
    firstRally:pick(['n0','near']),
    defR:320+Math.round(rnd()*130),
    attackBaseR:180+Math.round(rnd()*60),
    repairHp:pick([900,1200,1500,1700]),
    maxQueue:pick([2,3]),
    workers:4,
    objPull:0,
    pushAdvantage:rnd()<0.5?0:+(1.15+rnd()*0.45).toFixed(2),
    retreatFrac:rnd()<0.6?0:+(rnd()*0.25).toFixed(2),
    mineSafeR:rnd()<0.6?0:Math.round(rnd()*250),
    stageR:0,
  };
}
function scoreCfg(cfg,seeds){
  let W=0,G=0;
  for(let s=1;s<=seeds;s++){
    for(const swap of [0,1]){
      const A=makeAgent(cfg),B=makeSolStoch({},s*7919);
      const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
      const as=swap?1:0;
      if(r.winner===as)W++;G++;
    }
  }
  return {W,G,rate:W/G};
}
const N=+(process.argv[2]||60);
const SEEDS=+(process.argv[3]||20);
const out=[];
for(let i=0;i<N;i++){
  const cfg=sample();
  const r=scoreCfg(cfg,SEEDS);
  out.push({cfg,...r});
  if(i%5===0)console.log('...',i,r.W+'/'+r.G,(100*r.rate).toFixed(0)+'%');
}
out.sort((a,b)=>b.rate-a.rate);
for(const o of out.slice(0,10))console.log((100*o.rate).toFixed(0)+'%',o.W+'/'+o.G,JSON.stringify(o.cfg));
