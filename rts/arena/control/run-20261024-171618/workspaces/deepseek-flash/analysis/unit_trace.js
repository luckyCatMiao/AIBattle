const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const id=process.argv[2], uid=process.argv[3], t0=+process.argv[4]||0, t1=+process.argv[5]||300;
const g=a.find(x=>x.id===id);const me=g.seats.indexOf('deepseek-flash'), ss=1-me;
const dist=(u,v)=>Math.hypot(u.x-v.x,u.y-v.y);
for(const d of g.decisions){
 if(d.now<t0-0.01||d.now>t1+0.01) continue;
 const f=g.frames.find(x=>x.tick===d.tick);
 const u=f.units.find(x=>x.id===uid); if(!u) continue;
 const foes=f.units.filter(x=>x.owner===me);
 const near=foes.filter(x=>dist(u,x)<400).sort((p,q)=>dist(u,p)-dist(u,q))[0];
 const b=foes.find(x=>x.type==='base');
 const relevant=(d.commands[ss]||[]).filter(c=>c.units&&c.units.includes(uid));
 const cmds=relevant.map(c=>{let s=c.type;if(c.target)s+='->'+c.target;if(c.x!==undefined)s+='@'+Math.round(c.x)+','+Math.round(c.y);return s;}).join('|');
 const ready=u.fireAt<=d.now+1e-9;
 console.log(`t=${d.now.toFixed(0)} pos=${Math.round(u.x)},${Math.round(u.y)} hp=${Math.round(u.hp)} ready=${ready?'Y':'n'} near=${near?near.id+':'+near.type+'@'+Math.round(dist(u,near)):'-'} | ${cmds||'(no cmd)'}`);
}
