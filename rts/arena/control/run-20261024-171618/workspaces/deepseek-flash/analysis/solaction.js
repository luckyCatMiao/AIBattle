const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r1-g1','history-run-20261015-010803-r1-g2','history-run-20261015-010803-r2-g1','history-run-20261015-010803-r2-g2','history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','r1-g1','r1-g2'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tab={};
const add=(k,a)=>{tab[k]=tab[k]||{};tab[k][a]=(tab[k][a]||0)+1;};
for(const id of ids){
 const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol'),E=1-S;
 const fbt=new Map(g.frames.map(f=>[f.tick,f]));
 for(const d of g.decisions){
  const f=fbt.get(d.tick); if(!f) continue;
  const su=f.units.filter(u=>u.owner===S&&u.type==='tank'), eu=f.units.filter(u=>u.owner===E&&u.hp>0);
  if(!su.length) continue;
  const act=new Map();
  for(const c of d.commands[S]) if(c.units) for(const id of c.units) act.set(id,c);
  for(const u of su){
    const foes=eu.filter(v=>v.type!=='worker').sort((a,b)=>dist(u,a)-dist(u,b));
    const near=foes[0];
    if(!near) continue;
    const dEn=dist(u,near);
    const c=act.get(u.id);
    let a=c?c.type:'none';
    if(a==='move'){const L=Math.hypot(c.x-u.x,c.y-u.y);a=L>60?'moveLong':'move50';}
    const dEnB=dEn<150?'<150':dEn<180?'150-180':dEn<260?'180-260':'260+';
    const hpB=u.hp/u.maxHp<0.3?'<30%':u.hp/u.maxHp<0.6?'30-60%':u.hp/u.maxHp<0.95?'60-95%':'full';
    const ready=u.fireAt<=d.now?'Y':'N';
    add('dEn='+dEnB+' '+a, ready);
    add('hp='+hpB+' '+a, ready);
    add('dEn='+dEnB+' hp='+hpB+' '+a, ready);
  }
 }
}
const keys=Object.keys(tab).sort();
for(const k of keys){const o=tab[k];const tot=Object.values(o).reduce((a,b)=>a+b,0);console.log(k.padEnd(34),tot,JSON.stringify(o));}
