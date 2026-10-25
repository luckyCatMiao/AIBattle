const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent3.js');
const cfg=JSON.parse(process.argv[2]||'{}');
const solCfg=JSON.parse(process.argv[3]||'{}');
const swap=+(process.argv[4]||0);
const A=makeAgent(cfg),B=makeSol(solCfg);
const r=runMatch(swap?[B,A]:[A,B],{maxT:600,log:true});
const as=swap?1:0;
console.log('winner',r.winner,'(agent',as+')','t',r.duration.toFixed(1),'scores',r.scores.join(':'),'levels',r.level.join(','),'errs',r.errs,r.errs1);
const log=r.log||[];
for(const L of log){
  if(Math.abs(L.t-Math.round(L.t))>0.06)continue;
  const tt=Math.round(L.t); if(tt%10)continue;
  const cnt=(p,ty)=>L.units.filter(u=>u.o===p&&u.ty===ty).length;
  const hp=p=>Math.round(L.units.filter(u=>u.o===p).reduce((s,u)=>s+u.hp,0));
  const f=p=>`${cnt(p,'worker')}w ${cnt(p,'rifle')}r ${cnt(p,'tank')}t hp${hp(p)} c${Math.round(L.cr[p])}`;
  console.log(String(tt).padStart(3),'A['+f(as)+'] B['+f(1-as)+'] base',Math.round(L.bases[as])+'/'+Math.round(L.bases[1-as]));
}
