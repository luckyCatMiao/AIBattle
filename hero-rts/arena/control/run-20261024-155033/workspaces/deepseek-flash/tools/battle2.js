'use strict';
const {runDuel}=require('./duel');
const {Agent}=require('../agent.js');
const {SolClone}=require('./solclone.js');
const seat=parseInt(process.argv[2]||'0',10);
const agOpts=process.argv[3]?JSON.parse(process.argv[3]):{};
const us=new Agent(agOpts),cl=new SolClone({});
const A=seat===0?us:cl,B=seat===0?cl:us;
let last=-1;
const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:400,onFrame:(g)=>{
  const t=g.now;if(t<60||t>115||t-last<4)return;last=t;
  const mine=g.units.filter(u=>u.owner===seat&&u.hp>0&&u.type!=='worker');
  const foe=g.units.filter(u=>u.owner===1-seat&&u.hp>0);
  const th=g.buildings.find(b=>b.type==='townhall'&&b.owner===1-seat);
  const os={};for(const u of mine){const o=u.order?.type||'?';os[o]=(os[o]||0)+1;}
  const thHitters=mine.filter(u=>u.order?.type==='attack'&&u.order.target===th?.id).length;
  const nearTH=mine.filter(u=>th&&Math.hypot(u.x-th.x,u.y-th.y)<130).length;
  console.log(`t=${t.toFixed(0)} [${us.mem.phase}] orders=${JSON.stringify(os)} targetTH=${thHitters} nearTH=${nearTH} TH=${th?Math.round(th.hp):'X'} foe=${foe.length} our=${mine.length}`);
  console.log('   our@', mine.slice(0,6).map(u=>u.type[0]+Math.round(u.x)+','+Math.round(u.y)+':'+(u.order?.type||'')+(u.order?.target?'>'+u.order.target:'')).join(' '));
}});
console.log('RESULT',r.winner,r.duration.toFixed(1));
