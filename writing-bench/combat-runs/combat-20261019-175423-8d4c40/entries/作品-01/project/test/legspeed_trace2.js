const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const gn=w.spawnEnemy('gnawer',-1); gn.spawnT=0; gn.state='idle';
for(let i=0;i<3;i++)H.frame(16);
gn.updateLimbPositions();
const legs=gn.getLimb('legs'); legs.hp=1;
gn.takeHit(legs,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:legs.y,limbMul:1}); w.freeze=0;
let peak={v:0};
for(let i=0;i<240;i++){
  p.x=gn.x-400;
  H.frame(16);
  const v=Math.abs(gn.vx);
  if(gn.state!=='hurt' && gn.stunT<=0 && v>peak.v){
    peak={v,i,state:gn.state,key:gn.attackKey,onG:gn.onGround,adx:Math.abs(p.x-gn.x).toFixed(0),y:gn.y.toFixed(0)};
  }
}
console.log('peak',JSON.stringify(peak),'base',gn.def.speed,'impairedTarget',(gn.def.speed*0.42).toFixed(0));
