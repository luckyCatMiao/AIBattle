const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol');
 console.log('====',id,'solSeat',ss);
 const trains=[],ups=[],rally=[];
 for(const d of g.decisions){const f=g.frames.find(x=>x.tick===d.tick);const p=f.players[ss];const b=f.bases.find(x=>x.owner===ss);
   for(const c of d.commands[ss]){
     if(c.type==='train')trains.push(`${d.now.toFixed(0)}:${c.unit}(cr${p.credits},q${b.queue.length})`);
     if(c.type==='upgrade')ups.push(`${d.now.toFixed(0)}(cr${p.credits},L${p.level})`);
     if(c.type==='rally')rally.push(`${d.now.toFixed(0)}@${Math.round(c.x)},${Math.round(c.y)}`);
   } }
 console.log('trains',trains.join(' '));
 console.log('ups',ups.join(' '));
 console.log('rallies',rally.join('  '));
}
