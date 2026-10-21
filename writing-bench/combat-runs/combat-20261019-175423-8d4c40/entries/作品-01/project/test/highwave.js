const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<120;i++)H.frame(16);
// jump straight to a high wave
w.beginWave(10);
let botDir=0, maxEn=0, stalledFor=0, lastKills=-1, lastProgress=0;
for(let i=0;i<4200;i++){ // ~70s
  const alive=w.enemies.filter(e=>!e.dead);
  maxEn=Math.max(maxEn,alive.length);
  let e=null,best=1e9;
  for(const c of alive){const d=Math.abs(c.x-p.x);if(d<best){best=d;e=c;}}
  if(e){const dx=e.x-p.x;
    // hysteresis so the bot does not flip facing every frame (a test artifact)
    if(dx>44) botDir=1; else if(dx<-44) botDir=-1;
    H.key('KeyD',botDir>0); H.key('KeyA',botDir<0);
    H.key('KeyJ',i%2===0); H.key('KeyJ',false);
    if(i%47===0){H.key('KeyK',true);} if(i%47===35){H.key('KeyK',false);}
    if(i%131===0){H.key('KeyL',true);H.key('KeyL',false);}
  }
  H.frame(16);
  if(p.state==='dead'){H.key('KeyR',true);H.key('KeyR',false); lastKills=-1; lastProgress=i; continue;}
  // stall detection: no kills for a long stretch WHILE ALIVE (restarts reset counters)
  if(w.stats.killCount!==lastKills){lastKills=w.stats.killCount;lastProgress=i;}
  if(i-lastProgress>1500){stalledFor=i-lastProgress;break;}
}
console.log('waves reached',w.stats.wave,'kills',w.stats.killCount,'maxEnemies',maxEn,'stalledFrames',stalledFor,'queue',w.spawnQueue.length,'state',w.waveState);
if(stalledFor>0) throw new Error('spawn/wave stalled for '+stalledFor+' frames');
if(maxEn>5) throw new Error('too many enemies at once: '+maxEn);
console.log('HIGH WAVE OK');
