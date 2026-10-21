const H = require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(); const p=w.player;
// 1) enemy damage reachability: stand still next to an enemy, no input
for(let i=0;i<420;i++)H.frame(16);
let dmgTaken=0;
const e=w.enemies.find(x=>!x.dead);
console.log('enemies',w.enemies.map(x=>x.typeKey+':'+x.hp).join(','));
if(e){
  const hp0=p.hp;
  for(let i=0;i<900;i++){ p.x = e.x - 42; p.vx=0; H.frame(16); }
  console.log('standing-still hp', hp0, '->', p.hp, 'playerState',p.state);
}
// 2) parry probe: force player adjacent, press I right when enemy telegraph ends
key: {
  H.key('KeyR',true);H.key('KeyR',false);H.frame(16);
  for(let i=0;i<400;i++)H.frame(16);
  const e2=w.enemies.find(x=>!x.dead);
  if(!e2){ console.log('no enemy for parry'); break key; }
  let parried=0;
  for(let n=0;n<600;n++){
    p.x = e2.x - 46; p.vx=0;
    if(e2.state==='attack'){
      const A = (global.__AT||{}) ;
      const tell = e2.tellT;
      if(e2.attackT>tell-0.06 && e2.attackT<tell+0.02){ H.key('KeyI',true); H.key('KeyI',false); }
    }
    H.frame(16);
    if(w.stats.parryCount>parried){ parried=w.stats.parryCount; }
  }
  console.log('parryCount', w.stats.parryCount, 'playerHP', p.hp);
}
// 3) can the player die from enemies if passive+no dodge
console.log('final state', JSON.stringify(global.window.combatBenchState()));
