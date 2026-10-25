'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const myCfg=JSON.parse(process.argv[2]);
const oppKind=process.argv[3];
const oppCfg=JSON.parse(process.argv[4]||'{}');
const seat=parseInt(process.argv[5]||'1');
const every=parseInt(process.argv[6]||'50');
function getOpp(){if(oppKind==='sol2')return require('./sol2.js').makeSol2(oppCfg);return makeEngine(oppCfg);}
const me=makeEngine(myCfg),opp=getOpp();
const r=seat===0?runMatch(me,opp,{traceEvery:5}):runMatch(opp,me,{traceEvery:5});
console.log('winner(seat)',r.winner,'dur',r.duration.toFixed(1),'myseat',seat,'scores',r.scores);
const step=parseInt(process.argv[7]||'5');
for(const f of r.trace){
 if(f.now%every>2) continue;
 const parts=[];
 for(const p of [0,1]){const us=f.units.filter(u=>u.owner===p);const c={};for(const u of us)c[u.type]=(c[u.type]||0)+1;
  const army=us.filter(u=>u.type!=='worker');
  const cc=army.length?{x:(army.reduce((s,u)=>s+u.x,0)/army.length)|0,y:(army.reduce((s,u)=>s+u.y,0)/army.length)|0}:{x:0,y:0};
  parts.push(`s${p}${p===seat?'*':''}:cr${f.players[p].credits} lv${f.players[p].level} hp${f.bases[p].hp.toFixed(0)} ${JSON.stringify(c)} c(${cc.x},${cc.y}) k${f.players[p].kills} ctl${f.players[p].controlTime.toFixed(0)}`);}
 console.log('t='+f.now.toFixed(0).padStart(4),parts.join(' | '),'nodes',f.nodes.map(n=>n.owner===null?'.':n.owner).join(''));
}
