const H=require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world(),p=w.player;
for(let i=0;i<200;i++)H.frame(16);
const gn=w.spawnEnemy('gnawer',-1); gn.spawnT=0; gn.state='idle';
for(let i=0;i<3;i++)H.frame(16);
gn.updateLimbPositions();
const legs=gn.getLimb('legs'); legs.hp=1;
gn.takeHit(legs,{dmg:99,dir:1,kb:200,lift:0,heavy:true,x:p.x,y:legs.y,limbMul:5}); w.freeze=0;
console.log('impaired',gn.legsImpaired,'vx right after sever',gn.vx.toFixed(1));
let peak=-1,peakFrame=-1,peakState='';
for(let i=0;i<180;i++){
  p.x=gn.x-400;
  H.frame(16);
  const v=Math.abs(gn.vx);
  if(v>peak){peak=v;peakFrame=i;peakState=gn.state+'/'+(gn.attackKey||'')+'/onGround='+gn.onGround+'/y='+gn.y.toFixed(0);}
}
console.log('peak |vx|',peak.toFixed(1),'at frame',peakFrame,'state',peakState,'impaired',gn.legsImpaired,'dead',gn.dead);
// sample first 20
let s='';
for(let i=0;i<12;i++){p.x=gn.x-400;H.frame(16);s+=gn.vx.toFixed(0)+',';}
console.log('first vx samples',s);
