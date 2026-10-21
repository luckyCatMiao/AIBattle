/* A disarmed enemy standing its ground must be killable by ordinary ground attacks. */
const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const s=w.spawnEnemy('samurai',1); s.spawnT=0; s.state='idle'; s.cooldown=99;
for(let i=0;i<3;i++)H.frame(16);
s.updateLimbPositions();
const wa=s.getLimb('armR'); wa.hp=1;
s.takeHit(wa,{dmg:2,dir:1,kb:0,lift:0,heavy:true,x:p.x,y:wa.y,limbMul:1}); w.freeze=0;
console.log('weapon arm severed:',wa.severed,'armsLive',s.armsLive(),'hp',s.hp);
let t=0;
for(let i=0;i<420 && !s.dead;i++){
  // stable stance: face it, stay at ~60px, tap J with a normal rhythm
  p.x=s.x-60; p.facing=1; p.vx=0;
  if(i%6===0){ H.key('KeyJ',true); }
  if(i%6===2){ H.key('KeyJ',false); }
  H.frame(16); t+=16;
  if(p.state==='dead'){ H.key('KeyR',true);H.key('KeyR',false); }
}
console.log('target dead:',s.dead,'time',(t/1000).toFixed(2)+'s','hits',w.stats.hitCount);
if(!s.dead) throw new Error('disarmed enemy could not be finished in 6.7s');
if(t>4000) throw new Error('finishing took too long');
console.log('HELPLESS KILL OK');
