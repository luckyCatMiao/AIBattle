'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const myCfg=JSON.parse(process.argv[2]);
const oppCfg=JSON.parse(process.argv[3]);
const seat=parseInt(process.argv[4]||'0');
const every=parseInt(process.argv[5]||'5');
const me=makeEngine(myCfg), opp=makeEngine(oppCfg);
const r=seat===0?runMatch(me,opp,{traceEvery:every}):runMatch(opp,me,{traceEvery:every});
console.log('winner(seat)',r.winner,'dur',r.duration.toFixed(1),'myseat',seat);
for(const f of r.trace){
 const parts=[];
 for(const p of [0,1]){const us=f.units.filter(u=>u.owner===p);const c={};for(const u of us)c[u.type]=(c[u.type]||0)+1;
  const army=us.filter(u=>u.type!=='worker');const cc=army.length?{x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length}:{x:0,y:0};
  parts.push(`s${p}${p===seat?'*':''}:cr${f.players[p].credits} lv${f.players[p].level} hp${f.bases[p].hp.toFixed(0)} ${JSON.stringify(c)} c(${cc.x.toFixed(0)},${cc.y.toFixed(0)}) k${f.players[p].kills}`);}
 console.log('t='+f.now.toFixed(0).padStart(4),parts.join(' | '),'nodes',f.nodes.map(n=>(n.owner===null?'.':n.owner)).join(''));
}
