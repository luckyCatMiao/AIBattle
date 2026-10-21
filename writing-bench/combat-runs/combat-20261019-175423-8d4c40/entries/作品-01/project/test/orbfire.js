const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const pu=w.spawnEnemy('puppet',1); pu.spawnT=0; pu.state='idle';
let orbs=0; const seen=new Set();
for(let i=0;i<900;i++){
  p.x=pu.x-300; p.vx=0;
  H.frame(16);
  for(const o of w.orbs) if(!seen.has(o)){seen.add(o);orbs++;}
}
console.log('puppet orbs spawned:',orbs,'orbs live',w.orbs.length,'puppet hp',pu.hp,'state',pu.state);
if(orbs<1) throw new Error('puppet never fired');
// reflected orb damages puppet
const o=w.orbs.find(x=>!x.reflected)||null;
if(o){ w.reflectOrb(o,p); for(let i=0;i<60;i++)H.frame(16); console.log('after reflect puppet hp',pu.hp); }
console.log('ORB OK');
