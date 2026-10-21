/* Attack presses made during hit-stop must stay buffered and fire on recovery. */
const H = require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const e=w.spawnEnemy('gnawer',1); e.spawnT=0; e.state='idle';
p.x=e.x-58; p.facing=1;
p.tryAttack('L1',false);
// wait until the strike lands and freeze begins
let landed=false, presses=0, chain=0;
for(let i=0;i<40;i++){
  H.frame(16);
  if(w.freeze>0 && !landed){
    landed=true;
    // press J 6 times during the frozen window
    for(let k=0;k<6;k++){ H.key('KeyJ',true); H.key('KeyJ',false); H.frame(16); presses++; }
  }
}
for(let i=0;i<30;i++)H.frame(16);
console.log('hitstop observed:',landed,'presses during freeze:',presses,'combo chain reached:',p.stage,'hits:',w.stats.hitCount);
if(!landed) throw new Error('never hit');
if(w.stats.hitCount<2) throw new Error('buffered presses did not produce follow-up hits');
console.log('BUFFER OK');
