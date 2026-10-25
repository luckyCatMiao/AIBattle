const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent3.js');
const mine=JSON.parse(process.argv[2]||'{}');
const solc=JSON.parse(process.argv[3]||'{}');
const swap=+(process.argv[4]||0);
const A=makeAgent(mine),B=makeSol(solc);
const r=runMatch(swap?[B,A]:[A,B],{maxT:600,log:true});
const as=swap?1:0;
console.log('winner',r.winner,'agentSeat',as,'t',r.duration.toFixed(1),'score',r.scores.join(':'),'lvl',r.level.join(','));
for(const L of r.log||[]){
  const tt=Math.round(L.t); if(Math.abs(L.t-tt)>0.06||tt%5)continue;
  const c=(p,ty)=>L.units.filter(u=>u.o===p&&u.ty===ty).length;
  const hp=p=>Math.round(L.units.filter(u=>u.o===p).reduce((s,u)=>s+u.hp,0));
  console.log(String(tt).padStart(3),'A',`${c(as,'worker')}w${c(as,'rifle')}r${c(as,'tank')}t${c(as,'raider')}a hp${hp(as)} c${Math.round(L.cr[as])}`,'B',`${c(1-as,'worker')}w${c(1-as,'rifle')}r${c(1-as,'tank')}t${c(1-as,'raider')}a hp${hp(1-as)} c${Math.round(L.cr[1-as])}`,'base',Math.round(L.bases[as])+'/'+Math.round(L.bases[1-as]));
}
