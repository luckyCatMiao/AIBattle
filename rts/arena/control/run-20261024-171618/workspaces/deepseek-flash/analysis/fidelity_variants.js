const fs=require('fs');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const {makeSol}=require('./solbot2.js');
const V={
 base:{}, fw05:{fireWindow:0.5}, fw07:{fireWindow:0.7}, fw11:{fireWindow:1.1},
 engage174:{engage:174}, engage186:{engage:186}, engage195:{engage:195}, engage210:{engage:210},
 kite40:{kiteLen:40}, kite60:{kiteLen:60},
 focuslow:{focus:'lowhp'},
};
function classOf(cmds,uid,ebaseId){
  const cs=(cmds||[]).filter(c=>c.units&&c.units.includes(uid));
  if(cs.some(c=>c.type==='move'))return 'move';
  const at=cs.find(c=>c.type==='attack');
  if(at)return at.target===ebaseId?'attackBase':'attackU';
  if(cs.some(c=>c.type==='attackMove'))return 'AM';
  if(cs.some(c=>c.type==='stop'))return 'stop';
  return 'none';
}
const games=['r1-g1','r1-g2','r2-g1','r2-g2'];
for(const [vn,vc] of Object.entries(V)){
  let tot=0,mt=0,totT=0,mtT=0;
  for(const id of games){
    const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol');
    const bot=makeSol(vc);
    for(const d of g.decisions){
      const f=g.frames.find(x=>x.tick===d.tick); if(!f)continue;
      const pred=bot({...f,yourPlayer:ss});
      const ebase=f.bases.find(b=>b.owner!==ss);
      const recAll=(d.commands[ss]||[]).filter(c=>c.type!=='train'&&c.type!=='upgrade'&&c.type!=='rally'&&c.type!=='gather');
      for(const u of f.units.filter(x=>x.owner===ss&&x.hp>0&&x.type!=='worker')){
        const k1=classOf(recAll,u.id,ebase.id),k2=classOf(pred,u.id,ebase.id);
        tot++;if(k1===k2)mt++;
        // target accuracy when both attackU
        if(k1==='attackU'&&k2==='attackU'){
          const c1=recAll.find(c=>c.type==='attack'&&c.units.includes(u.id));
          const c2=pred.find(c=>c.type==='attack'&&c.units.includes(u.id));
          totT++;if(c1&&c2&&c1.target===c2.target)mtT++;
        }
      }
    }
  }
  console.log(vn.padEnd(10),'class',(100*mt/tot).toFixed(1)+'%','target',(100*mtT/Math.max(1,totT)).toFixed(1)+'%');
}
