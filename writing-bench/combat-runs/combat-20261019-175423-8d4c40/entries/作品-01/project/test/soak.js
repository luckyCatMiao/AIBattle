const H = require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(); const p=w.player;
let maxEn=0, minHp=100, deaths=0, restarts=0;
const t0=Date.now();
for(let i=0;i<3600;i++){ // 60s at ~60fps
  const alive=w.enemies.filter(e=>!e.dead);
  maxEn=Math.max(maxEn,alive.length);
  if(p.state==='dead'){ H.key('KeyR',true);H.key('KeyR',false); restarts++; }
  let e=null,best=1e9;
  for(const c of alive){const d=Math.abs(c.x-p.x); if(d<best){best=d;e=c;}}
  if(e){
    const dx=e.x-p.x;
    H.key('KeyD',dx>34); H.key('KeyA',dx<-34);
    H.key('KeyJ', i%2===0); H.key('KeyJ', false);
    if(i%40===0){H.key('KeyJ',true);}
    if(e.state==='attack'&&e.attackT>e.tellTotal-0.09&&e.attackT<e.tellTotal){H.key('KeyL',true);H.key('KeyL',false);}
    if(i%300===0){H.key('KeyK',true);} if(i%300===70){H.key('KeyK',false);}
    if(i%97===0){H.key('Space',true);H.key('Space',false);}
  }
  minHp=Math.min(minHp,p.hp);
  H.frame(16);
}
const ms=Date.now()-t0;
console.log('60s soak: wave',w.stats.wave,'kills',w.stats.killCount,'hits',w.stats.hitCount,'breaks',w.stats.limbBreakCount,'parries',w.stats.parryCount);
console.log('maxEnemies',maxEn,'minHp',minHp,'restarts',restarts,'severedPieces',w.severed.length,'particles',w.fx.parts.length);
console.log('state',JSON.stringify(global.window.combatBenchState()));
console.log('sim cost', ms+'ms for 3600 frames =>', (ms/3600).toFixed(3)+'ms/frame (logic only)');
if(ms/3600>4) console.log('WARN logic too slow');
