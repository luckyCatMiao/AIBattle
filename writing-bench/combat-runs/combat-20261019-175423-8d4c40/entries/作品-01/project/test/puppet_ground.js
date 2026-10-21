/* Ground-only player must eventually be able to hit a hovering puppet (dive window). */
const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const pu=w.spawnEnemy('puppet',1); pu.spawnT=0; pu.state='idle';
const hp0=pu.hp;
let landed=0, dives=0, wasDiving=false;
for(let i=0;i<1500;i++){
  // chase on the ground, mash J, never jump
  const dx=pu.x-p.x;
  H.key('KeyD',dx>26); H.key('KeyA',dx<-26);
  H.key('KeyJ',i%2===0); H.key('KeyJ',false);
  H.frame(16);
  const diving = pu.state==='attack' && pu.attackKey==='puppetCast';
  if(diving && !wasDiving){dives++;}
  wasDiving=diving;
  if(p.state==='dead'){H.key('KeyR',true);H.key('KeyR',false);}
}
console.log('puppet hp',pu.hp.toFixed(0),'of',hp0,'cast windows',dives,'playerHP',p.hp.toFixed(0),'kills',w.stats.killCount);
if(pu.hp>=hp0) throw new Error('ground-only attacks never damaged the puppet');
console.log('PUPPET GROUND REACH OK');
