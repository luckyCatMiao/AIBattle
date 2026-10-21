const H = require('./harness_lib.js');
H.key('Enter',true);H.key('Enter',false);H.frame(16);
const w=H.world();
for(let i=0;i<300;i++)H.frame(16);
const e=w.enemies.find(x=>!x.dead);
console.log('enemy', e && e.typeKey, e && e.x, e && e.y, e&&e.hp, 'hits',w.stats.hitCount);
if(e){
  e.vx=0;
  for(let n=0;n<6;n++){
    w.player.x=e.x-70; w.player.facing=1; w.player.vx=0;
    const limb=e.hitTest({x:w.player.x+24,y:w.player.y-78,w:132,h:104});
    console.log('n',n,'enemyhp',e.hp,'dead',e.dead,'limbTest',limb===undefined?'none':(limb===null?'body':limb.id),'limb hps',e.limbs.map(l=>l.id+':'+l.hp).join(','));
    w.player.tryAttack('H3',true);
    for(let i=0;i<40;i++)H.frame(16);
    console.log('   after: hits',w.stats.hitCount,'breaks',w.stats.limbBreakCount,'enemyhp',e.hp,'dead',e.dead);
  }
}
