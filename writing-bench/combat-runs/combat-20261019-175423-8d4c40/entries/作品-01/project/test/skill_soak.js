/* 60s soak with skills mixed into normal play; checks stability and caps. */
const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
let bad=null, maxEn=0, maxParts=0, skillUses=0, deaths=0;
for(let i=0;i<3600;i++){
  const alive=w.enemies.filter(e=>!e.dead);
  maxEn=Math.max(maxEn,alive.length);
  let e=null,best=1e9;
  for(const c of alive){const d=Math.abs(c.x-p.x);if(d<best){best=d;e=c;}}
  if(e){const dx=e.x-p.x;
    if(dx>44){H.key('KeyD',true);H.key('KeyA',false);}
    else if(dx<-44){H.key('KeyA',true);H.key('KeyD',false);}
    else {H.key('KeyA',false);H.key('KeyD',false);}
    if(best<112&&i%2===0){H.key('KeyJ',true);H.key('KeyJ',false);}
  } else { H.key('KeyA',false);H.key('KeyD',false); }
  // fire a skill whenever one is off cooldown
  if(i%15===0 && p.state!=='skill' && p.state!=='dead'){
    for(let k=0;k<4;k++) if(p.skillCd[k]<=0){ H.key('Digit'+(k+1),true); H.key('Digit'+(k+1),false); skillUses++; break; }
  }
  H.frame(16);
  if(p.state==='dead'){H.key('KeyR',true);H.key('KeyR',false);deaths++;}
  maxParts=Math.max(maxParts,w.fx.parts.length);
  if(!Number.isFinite(p.x)||!Number.isFinite(p.hp)){bad='player NaN';break;}
  for(const en of w.enemies) if(!Number.isFinite(en.x)||!Number.isFinite(en.y)||!Number.isFinite(en.hp)){bad='enemy NaN';break;}
  if(w.fx.parts.length>340){bad='particles '+w.fx.parts.length;break;}
  if(w.bladeRain.length>40){bad='bladerain '+w.bladeRain.length;break;}
  if(w.severed.length>60){bad='severed '+w.severed.length;break;}
  if(bad)break;
}
console.log('skill soak:',bad||'OK','| waves',w.stats.wave,'kills',w.stats.killCount,'hits',w.stats.hitCount,'breaks',w.stats.limbBreakCount,'skillPresses',skillUses,'deaths',deaths,'maxEnemies',maxEn,'maxParts',maxParts);
if(bad) throw new Error(bad);
console.log('SKILL SOAK OK');
