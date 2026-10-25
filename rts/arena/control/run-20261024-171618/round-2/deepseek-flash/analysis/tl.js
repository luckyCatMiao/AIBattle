const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const id=process.argv[2];
const g=j.find(x=>x.id===id);
console.log('game',id,'seats',g.seats.join(','));
for(const f of g.frames){
  const ps=f.players, units=f.units;
  const fmt=(p)=>{
    const c={};
    for(const u of units) if(u.owner===p) c[u.type]=(c[u.type]||0)+1;
    return 'p'+p+'['+Object.entries(c).map(e=>e[0]+':'+e[1]).join(' ')+'] cr'+ps[p].credits+' lv'+ps[p].level+' k'+ps[p].kills+' dmg'+Math.round(ps[p].damage)+' mined'+Math.round(ps[p].mined)+' sc'+ps[p].score;
  };
  const bases=f.bases.map(b=>'b'+b.owner+':'+Math.round(b.hp)).join(' ');
  const nodes=f.nodes.map(n=>n.id+':'+(n.owner===null?'-':n.owner)+(n.progress>0?'('+Math.round(n.progress*100)+'%)':'')).join(' ');
  console.log('t'+f.now.toFixed(0)+' '+fmt(0)+' | '+fmt(1)+' | '+bases+' | '+nodes);
}
