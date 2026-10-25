const {evalCfg}=require('./suite2.js');
let cur=JSON.parse(process.argv[2]||'{}');
const passes=+(process.argv[3]||2);
const DIMS={
  opening:['1n3n','2n2n','3n1n','4n0n'],
  engageTank:[174,186,195,205,215],
  fireWindow:[0.4,0.6,0.8,0.9,1.05],
  kiteLen:[25,30,35,40,45,50,60],
  focus:['unit-lowhp','global-lowhp','nearest'],
  retreatFrac:[0,0.15,0.25,0.35],
  stageR:[0,200,300,450],
  upReserve:[0,60,120,200],
  workers:[4,5,6],
  defR:[300,380,460],
  objPull:[0,40,90],
  repairHp:[900,1200,1400,1700],
  maxQueue:[1,2,3],
  attackBaseR:[160,200,240],
  groupKite:[false,true],
  focusR:[220,300,380],
  defOff:[80,120,170],
};
function score(cfg){const r=evalCfg(cfg,false);return r.wins;}
let bestScore=score(cur);
console.log('start',bestScore+'/12',JSON.stringify(cur));
for(let pass=0;pass<passes;pass++){
  let improved=false;
  for(const [dim,vals] of Object.entries(DIMS)){
    let bestVal=cur[dim],best=bestScore;
    for(const v of vals){
      if(v===cur[dim])continue;
      const cfg=Object.assign({},cur,{[dim]:v});
      const s=score(cfg);
      if(s>best){best=s;bestVal=v;}
    }
    if(best>bestScore){console.log('pass',pass,dim,cur[dim],'->',bestVal,'score',best+'/12');cur[dim]=bestVal;bestScore=best;improved=true;}
  }
  if(!improved)break;
}
console.log('FINAL',bestScore+'/12',JSON.stringify(cur));
const r=evalCfg(cur,true);console.log(r.det.join(' '));
