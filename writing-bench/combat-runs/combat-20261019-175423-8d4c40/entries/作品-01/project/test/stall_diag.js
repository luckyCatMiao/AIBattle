const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<120;i++)H.frame(16);
w.beginWave(10);
let lastKills=-1, lastProgress=0, reported=false, botDir=0;
for(let i=0;i<4200;i++){
  const alive=w.enemies.filter(e=>!e.dead);
  let e=null,best=1e9;
  for(const c of alive){const d=Math.abs(c.x-p.x);if(d<best){best=d;e=c;}}
  if(e){const dx=e.x-p.x;
    if(dx>44) botDir=1; else if(dx<-44) botDir=-1;
    H.key('KeyD',botDir>0); H.key('KeyA',botDir<0);
    if(best<112 && i%2===0){ H.key('KeyJ',true); H.key('KeyJ',false); }
    if(best<140 && i%47===0){H.key('KeyK',true);} if(i%47===35){H.key('KeyK',false);}
    if(best>220 && i%131===0){H.key('KeyL',true);H.key('KeyL',false);}}
  H.frame(16);
  if(p.state==='dead'){H.key('KeyR',true);H.key('KeyR',false);lastKills=-1;lastProgress=i;continue;}
  if(w.stats.killCount!==lastKills){lastKills=w.stats.killCount;lastProgress=i;}
  if(i-lastProgress>1500){reported=true;
    console.log('STALL at frame',i,'wave',w.stats.wave,'playerHP',p.hp.toFixed(0),'pAt',p.x.toFixed(0));
    for(const en of alive){
      console.log(' enemy',en.typeKey,'hp',en.hp.toFixed(0),'state',en.state,'atk',en.attackKey,
        'pos',en.x.toFixed(0),en.y.toFixed(0),'legsImp',en.legsImpaired,'armsLive',en.armsLive(),
        'fireCd',en.fireCd.toFixed(2),'cooldown',en.cooldown.toFixed(2),'tellT',en.tellT.toFixed(2),
        'stun',en.stunT.toFixed(2),'legs',en.limbs.map(l=>l.id+':'+l.severed).join(','));
    }
    break;}
}
if(!reported) console.log('no stall in 3000 frames');
