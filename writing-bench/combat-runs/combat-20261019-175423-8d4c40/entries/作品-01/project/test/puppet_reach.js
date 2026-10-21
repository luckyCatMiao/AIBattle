const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const pu=w.spawnEnemy('puppet',1); pu.spawnT=0; pu.state='idle'; pu.legsImpaired=false;
// park the puppet over the player
pu.x=p.x+40; pu.vx=0;
let maxJumpTop=0, hits=0;
const hp0=pu.hp;
for(let trial=0; trial<6; trial++){
  pu.hp=pu.maxHp; p.hp=100; w.orbs.length=0;
  p.x=pu.x-46; p.facing=1; p.onGround=true; p.y=470; p.vy=0; p.state='idle'; p.attack=null; p.attackT=0;
  // jump, then air attack at apex
  H.key('Space',true); H.key('Space',false);
  for(let i=0;i<18;i++){ H.frame(16); }
  const top = p.y; maxJumpTop=Math.max(maxJumpTop, 470-top);
  p.tryAttack('AIR1',false);
  for(let i=0;i<30;i++){ H.frame(16); if(p.onGround){p.vy=-640;p.onGround=false;p.y=470-110;p.state='air';p.tryAttack('AIR1',false);} }
  hits += (hp0-pu.hp)>0?1:0;
  console.log('trial',trial,'player topY',top.toFixed(0),'puppet feetY',pu.y.toFixed(0),'puppet body top',(pu.y-pu.h).toFixed(0),'puppetHP',pu.hp.toFixed(0));
}
console.log('max jump rise',maxJumpTop.toFixed(0),'trials that hit puppet:',hits);
console.log('puppet hover', pu.def.hover);
