'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const cloneVariants=[
  {},
  {pushAt:150,aggroRange:1100,defenseBias:1},
];
const grid=[];
for(const camp of [true,false])
 for(const departAt of [26,30,34,38])
  for(const departFootmen of [8,10,12])
   grid.push({camp,departAt,departFootmen});
const rows=[];
for(const g of grid){
  let w=0,n=0,dmg=0,durs=[];
  for(const cv of cloneVariants)for(const seat of [0,1]){
    const us=new Agent(g),cl=new SolClone(Object.assign({},cv));
    const A=seat===0?us:cl,B=seat===0?cl:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:330});
    n++;if(r.winner===seat)w++;
    const oppTH=r.th.find(x=>x.startsWith((1-seat)+':'));
    dmg+=3200-(oppTH?parseInt(oppTH.split(':')[1]):0);durs.push(r.duration);
  }
  rows.push({...g,w,n,dmg:Math.round(dmg/n),avgdur:Math.round(durs.reduce((a,b)=>a+b,0)/durs.length)});
}
rows.sort((a,b)=>b.w-a.w||b.dmg-a.dmg);
for(const r of rows)console.log(`camp${r.camp?'Y':'N'} dep${r.departAt} n${r.departFootmen}  ${r.w}/${r.n}  dmg${r.dmg}  dur${r.avgdur}`);
