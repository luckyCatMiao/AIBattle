const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);

// --- both arms severed => enemy must never attack again ---
const g=w.spawnEnemy('gnawer',1); g.spawnT=0; g.state='idle';
for(let i=0;i<3;i++)H.frame(16);
g.updateLimbPositions();
const arms=g.limbs.filter(l=>l.func==='claw');
for(const a of arms){ a.hp=1; g.takeHit(a,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:a.y,limbMul:1}); w.freeze=0; }
console.log('gnawer arms live:',g.armsLive());
let attacked=false;
for(let i=0;i<600;i++){ p.x=g.x-50; p.vx=0; H.frame(16); if(g.state==='attack')attacked=true; if(g.dead)break; }
console.log('gnawer attacked after losing arms:',attacked,'hp',g.hp,'dead',g.dead);
if(attacked) throw new Error('enemy attacked without arms');
console.log('gnawer survived procedure:',!g.dead);

// --- legs severed => movement slower and puppet loses hover ---
const gn=w.spawnEnemy('gnawer',-1); gn.spawnT=0; gn.state='idle';
for(let i=0;i<3;i++)H.frame(16);
gn.updateLimbPositions();
const legs=gn.getLimb('legs'); legs.hp=1;
gn.takeHit(legs,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:legs.y,limbMul:1}); w.freeze=0;
console.log('gnawer legsImpaired:',gn.legsImpaired);
if(!gn.legsImpaired) throw new Error('legs sever had no effect');
let maxMove=0;
for(let i=0;i<240;i++){ p.x=gn.x-400; H.frame(16);
  if(gn.state!=='hurt' && gn.stunT<=0) maxMove=Math.max(maxMove,Math.abs(gn.vx)); }
console.log('impaired max speed:',maxMove.toFixed(0),'(base '+gn.def.speed+')');
if(gn.dead) throw new Error('enemy died during speed test');
if(maxMove>gn.def.speed*0.6) throw new Error('impaired enemy still moves near full speed');

const pu=w.spawnEnemy('puppet',1); pu.spawnT=0; pu.state='idle';
for(let i=0;i<20;i++)H.frame(16);
const pl=pu.getLimb('legs'); pl.hp=1;
pu.updateLimbPositions();
pu.takeHit(pl,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:pl.y,limbMul:1}); w.freeze=0;
for(let i=0;i<120;i++)H.frame(16);
console.log('puppet after leg sever: y',pu.y.toFixed(0),'legsImpaired',pu.legsImpaired);
if(pu.y < 455) throw new Error('puppet did not fall after legs severed');

// --- vital head => death ---
const s2=w.spawnEnemy('samurai',1); s2.spawnT=0; s2.state='idle';
for(let i=0;i<3;i++)H.frame(16);
s2.updateLimbPositions();
const head=s2.getLimb('head'); head.hp=1;
s2.takeHit(head,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:head.y,limbMul:1});
console.log('samurai dead after head sever:',s2.dead,'limbBreakCount',w.stats.limbBreakCount);
if(!s2.dead) throw new Error('vital limb sever did not kill');
console.log('LIMB EFFECTS OK');
