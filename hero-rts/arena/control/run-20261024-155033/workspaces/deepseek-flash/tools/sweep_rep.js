'use strict';
const {runDuel}=require('./duel_replay.js');
const {Agent}=require(process.env.AGENT_FILE||'../agent.js');
const games=[['public-r2-g1.json.gz',0,1],['public-r2-g2.json.gz',1,0]];
const variants=JSON.parse(process.argv[2]);
for(const v of variants){
  const out=[];
  for(const [f,ourSeat,solSeat] of games){
    const a=new Agent(Object.assign({},v.opts));
    const r=runDuel(a,{replay:f,ourSeat,solSeat,maxSeconds:700,overlay:+(v.overlay||0)});
    const win=r.winner===ourSeat;
    const th=r.th.find(x=>x.startsWith(solSeat+':'));
    out.push(`${f.includes('g1')?'g1':'g2'}:${win?'W':'L'}${r.duration.toFixed(0)} ${win?'':'(enemyTH '+th+')'}`);
  }
  console.log(v.name.padEnd(22),out.join('  '));
}
