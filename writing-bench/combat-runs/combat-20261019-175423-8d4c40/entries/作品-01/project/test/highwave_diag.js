const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<120;i++)H.frame(16);
w.beginWave(10);
for(let i=0;i<4200;i++){
  const alive=w.enemies.filter(e=>!e.dead);
  let e=null,best=1e9;
  for(const c of alive){const d=Math.abs(c.x-p.x);if(d<best){best=d;e=c;}}
  if(e){const dx=e.x-p.x;H.key('KeyD',dx>30);H.key('KeyA',dx<-30);H.key('KeyJ',i%2===0);H.key('KeyJ',false);
    if(i%47===0){H.key('KeyK',true);} if(i%47===35){H.key('KeyK',false);}
    if(i%131===0){H.key('KeyL',true);H.key('KeyL',false);}}
  H.frame(16);
  if(p.state==='dead'){H.key('KeyR',true);H.key('KeyR',false);}
  if(i%400===0){
    console.log('t='+i, 'wave',w.stats.wave,'waveState',w.waveState,'queue',w.spawnQueue.length,
      'enemies',w.enemies.filter(x=>!x.dead).map(x=>x.typeKey+'@'+x.x.toFixed(0)+':'+x.hp.toFixed(0)+'/'+x.state).join(' | '),
      'pHP',p.hp.toFixed(0),'hits',w.stats.hitCount,'kills',w.stats.killCount,'p@',p.x.toFixed(0));
  }
}
