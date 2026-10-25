'use strict';
const core=require('../core.js');
const {rules}=require('../catalog.js');
const NET=rules.netX,L=rules.courtLength;
function show(label,x,y,kind,target,dir=1,boost=0){
  const cs=core.chooseShot(x,y,dir,kind,target);
  const speed=cs.speed*(1+boost);
  const tr=core.shotTrace(x,y,cs.angle,speed,dir);
  console.log(label,'angle',cs.angle.toFixed(2),'base',cs.speed.toFixed(2),'boosted',speed.toFixed(2),'land',tr.landX.toFixed(2),'t',tr.landT.toFixed(2),'netY',tr.netY&&tr.netY.toFixed(2),'netHit',tr.netHit);
}
// 我方(team0)接发：在网前高点 (7.5,2.2) 上手，对手在深区 12 → 引擎目标 short 8.3
show('smash short',7.5,2.2,'smash',NET+1.6,1,0);
show('smash short c0.5',7.5,2.2,'smash',NET+1.6,1,0.275);
show('smash short c1.0',7.5,2.2,'smash',NET+1.6,1,0.55);
// 对手在中场 9.5 → target short 仍更远
show('smash opp9.5',7.5,2.2,'smash',NET+1.6,1,0);
// 对手前压 5.0 → target deep 12.4
show('smash deep',7.5,2.2,'smash',L-1.0,1,0);
show('smash deep c0.5',7.5,2.2,'smash',L-1.0,1,0.275);
show('smash deep c1.0',7.5,2.2,'smash',L-1.0,1,0.55);
// 低点 2.0：不是 smash
show('clear-ish 2.0',7.5,2.0,'clear',11.9,1,0);
show('drop 2.0',7.5,2.0,'drop',NET+2.7,1,0);
// 下手挑高
show('lift',4.1,0.8,'lift',11.4,1,0);
show('lift c1',4.1,0.8,'lift',11.4,1,0.55);
