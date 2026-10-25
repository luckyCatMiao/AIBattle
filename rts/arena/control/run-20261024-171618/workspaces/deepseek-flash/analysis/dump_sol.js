const fs=require('fs');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const games=a.filter(g=>!g.id.startsWith('history-'));
for(const g of games){
  const solSeat=g.seats.indexOf('sol');
  console.log('==== '+g.id+' solSeat='+solSeat+' winner='+g.winner+' dur='+g.duration);
  for(const d of g.decisions){
    const cs=d.commands[solSeat]||[];
    if(!cs.length) continue;
    const compact=cs.map(c=>{
      let s=c.type;
      if(c.unit)s+=':'+c.unit;
      if(c.target)s+='->'+c.target;
      if(c.x!==undefined)s+='@'+Math.round(c.x)+','+Math.round(c.y);
      if(c.units)s+='['+c.units.join(',')+']';
      return s;
    });
    console.log('t='+d.now.toFixed(1)+' '+compact.join(' | '));
  }
}
