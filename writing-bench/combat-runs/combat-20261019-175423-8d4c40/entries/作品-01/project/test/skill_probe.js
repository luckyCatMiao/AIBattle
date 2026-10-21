/* Why did skills 2/3 appear inert? Check firing/cooldown with and without targets. */
const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const press=c=>{H.key(c,true);H.key(c,false);};
// clear arena, then fire skill 2 and 3 with no enemies
w.enemies.forEach(e=>e.dead=true);
p.skillCd.forEach((_,i)=>p.skillCd[i]=0);
const log=[];
for (const [k,code] of [[1,'Digit2'],[2,'Digit3']]) {
  p.state='idle'; p.x=400; press(code);
  const s0=w.stats.hitCount;
  log.push({skill:k,stateAfterPress:p.state,cd:p.skillCd[k], skillId:p.skillId});
  for(let i=0;i<90;i++)H.frame(16);
  log.push({skill:k,stateEnd:p.state,cdAfter:p.skillCd[k],hits:w.stats.hitCount-s0});
}
console.log(JSON.stringify(log,null,1));
// with a target, skill2 detonation damage
const e=w.spawnEnemy('samurai',1); e.spawnT=0; e.state='idle';
for(let i=0;i<5;i++)H.frame(16);
e.x=p.x+80; p.facing=1; p.skillCd[1]=0; p.state='idle';
const hp0=e.hp; press('Digit2');
for(let i=0;i<90;i++)H.frame(16);
console.log('skill2 with target dmg', (hp0-e.hp).toFixed(0), 'markedSeen', e._shadowMarked);
if (e.hp>=hp0) throw new Error('skill2 still inert with a target');
console.log('PROBE OK');
