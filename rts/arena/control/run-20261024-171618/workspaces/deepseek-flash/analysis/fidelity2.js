const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const {makeSol}=require('./solbot2.js');
const dist=(u,v)=>Math.hypot(u.x-v.x,u.y-v.y);
function classify(cmds,uid,foes,ebase){
  const cs=(cmds||[]).filter(c=>c.units&&c.units.includes(uid));
  if(cs.some(c=>c.type==='move'))return 'move';
  const at=cs.find(c=>c.type==='attack');
  if(at) return at.target===ebase.id?'attackBase':'attackU';
  if(cs.some(c=>c.type==='attackMove'))return 'AM';
  if(cs.some(c=>c.type==='stop'))return 'stop';
  return 'none';
}
let total=0,match=0,per={};
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol');
 const bot=makeSol();
 let tot=0,mt=0;
 for(const d of g.decisions){
  const f=g.frames.find(x=>x.tick===d.tick); if(!f)continue;
  const predMap=bot({...f,yourPlayer:ss});
  const ebase=f.bases.find(b=>b.owner!==ss);
  const foes=f.units.filter(u=>u.owner!==ss&&u.hp>0);
  for(const u of f.units.filter(x=>x.owner===ss&&x.hp>0&&x.type!=='worker')){
    const rec=[...d.commands[ss]].filter(c=>c.type!=='train'&&c.type!=='upgrade'&&c.type!=='rally'&&c.type!=='gather');
    const k1=classify(rec,u.id,foes,ebase), k2=classify(predMap,u.id,foes,ebase);
    tot++; if(k1===k2) mt++;
  }
 }
 console.log(id,'class fidelity',mt+'/'+tot,'=',(100*mt/tot).toFixed(0)+'%');
 total+=tot;match+=mt;
}
console.log('TOTAL',match+'/'+total,(100*match/total).toFixed(1)+'%');
