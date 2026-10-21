const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const gn=w.spawnEnemy('gnawer',-1); gn.spawnT=0; gn.state='idle'; gn.cooldown=99;
for(let i=0;i<3;i++)H.frame(16);
gn.updateLimbPositions();
const legs=gn.getLimb('legs'); legs.hp=1;
gn.takeHit(legs,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:legs.y,limbMul:1}); w.freeze=0;
gn.cooldown=99;
let peak=0, rows=[];
for(let i=0;i<180;i++){
  p.x=gn.x-400;
  H.frame(16);
  gn.cooldown=99; // force walking only
  const v=Math.abs(gn.vx);
  if(v>peak){peak=v;rows.push({i,v:+v.toFixed(0),state:gn.state,key:gn.attackKey,onG:gn.onGround,y:+gn.y.toFixed(0),imp:gn.legsImpaired});}
}
console.log('walk-only peak',peak.toFixed(1),'base',gn.def.speed,'expected',(gn.def.speed*0.42).toFixed(1));
console.log('peaks',JSON.stringify(rows.slice(-5)));
// now allow attacks and log which attack keys fire and their speeds
let maxAtk=0, keys={};
for(let i=0;i<900;i++){
  p.x=gn.x-70;
  H.frame(16);
  if(gn.state==='attack'&&gn.attackKey){keys[gn.attackKey]=(keys[gn.attackKey]||0)+1;maxAtk=Math.max(maxAtk,Math.abs(gn.vx));}
  if(gn.dead)break;
}
console.log('attack keys used',JSON.stringify(keys),'max vx during attacks',maxAtk.toFixed(0),'dead',gn.dead);
