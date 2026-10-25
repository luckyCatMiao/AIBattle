'use strict';
const {runMatch}=require('./sim.js');
const {makeBot,makeSol}=require('./bots.js');
const cfgs=JSON.parse(process.argv[2]||'[]');
for(const cfg of cfgs){
  const out=[];
  for(const seat of [0,1]){
    const me=makeBot(cfg), sol=makeSol(process.argv[3]?JSON.parse(process.argv[3]):{});
    const r=seat===0?runMatch(me,sol,{}):runMatch(sol,me,{});
    const win=(r.winner===seat);
    out.push(`seat${seat}:${win?'WIN':'LOSS'}@${r.duration.toFixed(0)} me[${r.stats[seat].kills}k ${r.stats[seat].damage.toFixed(0)}dmg] sol[${r.stats[1-seat].kills}k ${r.stats[1-seat].damage.toFixed(0)}dmg]`);
  }
  console.log(JSON.stringify(cfg),'->',out.join('  '));
}
