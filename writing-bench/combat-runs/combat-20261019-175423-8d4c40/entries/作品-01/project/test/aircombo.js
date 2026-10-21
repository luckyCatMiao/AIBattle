const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const e=w.spawnEnemy('gnawer',1);
e.spawnT=0; e.state='idle';
p.x=e.x-60;p.facing=1;
// launcher
p.tryAttack('L4',false);
let launched=false,airHits=0;
for(let i=0;i<80;i++){
  H.frame(16);
  if(e.y<e.y<430) launched=true;
  if(launched && i%6===0){ p.x=e.x-30; p.vy=-300; p.onGround=false; p.state='air'; p.tryAttack('AIR1',false); }
  if(e.state!=='dead' && e.vy<-50) airHits++;
}
console.log('launched:',launched,'airHitsFrames:',airHits,'hits',w.stats.hitCount);
// plunge from air
p.y=300;p.onGround=false;p.vy=0;p.state='air';
p.tryAttack('AIRH',true);
for(let i=0;i<60;i++)H.frame(16);
console.log('after plunge: p.y',p.y.toFixed(1),'state',p.state,'hits',w.stats.hitCount,JSON.stringify(global.window.combatBenchState()));
if(!launched) throw new Error('launcher did not lift enemy');
if(w.stats.hitCount<2) throw new Error('air hits not registered');
console.log('AIR COMBO OK');
