'use strict';
const {runMatch} = require('./sim.js');
const {makeBot, makeSol} = require('./bots.js');
const cfg=JSON.parse(process.argv[2]||'{}');
const seat=parseInt(process.argv[3]||'0');
const me=makeBot(cfg), sol=makeSol({});
const r=seat===0?runMatch(me,sol,{traceEvery:5}):runMatch(sol,me,{traceEvery:5});
console.log('winner',r.winner,'dur',r.duration.toFixed(1));
for(const f of r.trace){
  const parts=[];
  for(const p of [0,1]){
    const us=f.units.filter(u=>u.owner===p);
    const c={};for(const u of us)c[u.type]=(c[u.type]||0)+1;
    const b=f.bases[p];
    parts.push(`s${p}:cr${f.players[p].credits} lv${f.players[p].level} hp${b.hp.toFixed(0)} ${JSON.stringify(c)} q${b.queue.map(x=>x.type[0]).join('')} k${f.players[p].kills}`);
  }
  console.log('t='+f.now.toFixed(0).padStart(4),parts.join(' | '));
}
