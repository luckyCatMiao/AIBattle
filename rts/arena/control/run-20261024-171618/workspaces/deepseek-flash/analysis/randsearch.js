const {evalCfg}=require('./suite4.js');
let seed=12345;
function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;}
function pick(a){return a[Math.floor(rnd()*a.length)];}
function sample(){
  return {
    groupKite:false,
    kiteLen:30+Math.round(rnd()*30),
    fireWindow:+(0.5+rnd()*0.6).toFixed(2),
    engageTank:175+Math.round(rnd()*40),
    focus:pick(['unit-lowhp','fire-lowhp','global-lowhp','nearest']),
    upReserve:Math.round(rnd()*120),
    objPull:Math.round(rnd()*100),
    pushAdvantage:rnd()<0.5?0:+(1.1+rnd()*0.5).toFixed(2),
    stageR:rnd()<0.4?0:Math.round(rnd()*400),
    retreatFrac:rnd()<0.6?0:+(rnd()*0.3).toFixed(2),
    defR:300+Math.round(rnd()*160),
    attackBaseR:160+Math.round(rnd()*80),
    mineSafeR:rnd()<0.5?0:Math.round(rnd()*300),
    maxQueue:pick([1,2,3]),
    repairHp:pick([900,1200,1400,1700]),
  };
}
const N=+(process.argv[2]||100);
const results=[];
for(let i=0;i<N;i++){
  const cfg=sample();
  const r=evalCfg(cfg,{});
  results.push({cfg,w:r.wins,g:r.games});
  if(i%10===0)console.log('...',i,r.wins+'/'+r.games);
}
results.sort((a,b)=>b.w-a.w);
for(const r of results.slice(0,8))console.log(r.w+'/'+r.g,JSON.stringify(r.cfg));
