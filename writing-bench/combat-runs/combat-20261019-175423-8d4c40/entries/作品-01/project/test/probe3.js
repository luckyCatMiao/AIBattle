const H = require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(); const p=w.player;
let log={};
for(let i=0;i<500;i++)H.frame(16);
let e=w.enemies.find(x=>!x.dead);
let parryPresses=0, parryWindows=0;
for(let n=0;n<900;n++){
  const en=w.enemies.find(x=>!x.dead); if(!en) { H.frame(16); continue; }
  p.x = en.x - 46; p.vx=0;
  if(en.state==='attack'){
    const tell=en.tellTotal;
    if(en.attackT>tell-0.08 && en.attackT<tell-0.02){ H.key('KeyI',true); H.key('KeyI',false); parryPresses++; }
  }
  if(p.state==='parry') parryWindows++;
  H.frame(16);
  if(!log.firstAtk && en.state==='attack'){ log.firstAtk={tell:en.tellTotal, key:en.attackKey}; }
}
console.log('first attack', JSON.stringify(log.firstAtk));
console.log('parry presses',parryPresses,'frames in parry',parryWindows,'parryCount',w.stats.parryCount,'pstate',p.state,'hp',p.hp,'parryCd',p.parryCd.toFixed(2));
console.log('player iframe',p.iframe,'freeze',w.freeze);
