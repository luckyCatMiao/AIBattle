const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
const finite=v=>Number.isFinite(v);
let bad=null;
for(let i=0;i<4000;i++){
  const alive=w.enemies.filter(e=>!e.dead);
  let e=null,best=1e9;
  for(const c of alive){const d=Math.abs(c.x-p.x);if(d<best){best=d;e=c;}}
  if(e){const dx=e.x-p.x;H.key('KeyD',dx>30);H.key('KeyA',dx<-30);H.key('KeyJ',i%2===0);H.key('KeyJ',false);
    if(i%50===0){H.key('KeyK',true);} if(i%50===40){H.key('KeyK',false);}
    if(i%211===0){H.key('KeyL',true);H.key('KeyL',false);}
    if(i%151===0){H.key('KeyI',true);H.key('KeyI',false);}
    if(i%83===0){H.key('Space',true);H.key('Space',false);}
  }
  H.frame(16);
  if(p.state==='dead'){H.key('KeyR',true);H.key('KeyR',false);}
  // invariants
  if(!finite(p.x)||!finite(p.y)||!finite(p.hp)){bad='player non-finite at '+i;break;}
  for(const en of w.enemies){ if(!finite(en.x)||!finite(en.y)||!finite(en.hp)){bad='enemy non-finite at '+i;break;} }
  for(const s of w.severed){ if(!finite(s.x)||!finite(s.y)){bad='severed non-finite at '+i;break;} }
  if(w.severed.length>40){bad='severed exploded '+w.severed.length;break;}
  if(w.fx.parts.length>330){bad='particles exploded '+w.fx.parts.length;break;}
  if(w.orbs.length>30){bad='orbs exploded '+w.orbs.length;break;}
  if(bad)break;
}
console.log('invariants:',bad||'OK','waves',w.stats.wave,'kills',w.stats.killCount,'hits',w.stats.hitCount,'breaks',w.stats.limbBreakCount,'severed',w.severed.length,'parts',w.fx.parts.length);
if(bad)throw new Error(bad);
console.log('INVARIANTS OK');
