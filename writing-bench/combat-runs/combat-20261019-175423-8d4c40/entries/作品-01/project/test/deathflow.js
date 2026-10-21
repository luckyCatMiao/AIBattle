const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<300;i++)H.frame(16);
// apply lethal damage while passive
p.iframe=0; p.state='idle';
p.takeHit(999,p.x-5,{});
let framesToPanel=0;
for(let i=0;i<200;i++){H.frame(16); if(w.deathT>0.8&&!framesToPanel)framesToPanel=i;}
console.log('deathT',w.deathT.toFixed(2),'playing',w.playing,'panelAtFrame',framesToPanel,'state',JSON.stringify(global.window.combatBenchState()));
// R restart
H.key('KeyR',true);H.key('KeyR',false);
H.frame(16); H.frame(16);
console.log('after R:',JSON.stringify(global.window.combatBenchState()),'playerState',w.player.state,'wave',w.stats.wave,'waveState',w.waveState);
// ensure an enemy can engage within 3 seconds
let engaged=false;
for(let i=0;i<190;i++){H.frame(16); if(w.enemies.some(e=>!e.dead&&Math.abs(e.x-p.x)<500))engaged=true;}
console.log('enemy present within 3s:',engaged,'enemyCount',global.window.combatBenchState().enemyCount);
if(!engaged) throw new Error('no enemies after restart');
console.log('DEATH FLOW OK');
