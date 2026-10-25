const fs=require('fs');
const R=require('../rules.js');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const id=process.argv[2];
const g=j.find(x=>x.id===id);
const m=R.createMatch({id:g.id,players:[{name:'a'},{name:'b'}],seed:1});
// start
R.command(m,0,{type:'start'});
const decs=g.decisions;
let maxDiff=0;
const frames=g.frames;
for(let i=0;i<decs.length;i++){
  const d=decs[i];
  const snap=R.snapshot(m,0);
  // compare with recorded frame at this tick
  const f=frames[i];
  if(!f) break;
  if(Math.abs(snap.now-f.now)>1e-6) console.log('NOW MISMATCH',i,snap.now,f.now);
  for(const b of snap.bases){const rb=f.bases.find(x=>x.id===b.id);if(rb)maxDiff=Math.max(maxDiff,Math.abs(b.hp-rb.hp));}
  // apply recorded commands
  const errs=[];
  for(const p of [0,1]) for(const c of d.commands[p]){
    try{R.command(m,p,c);}catch(e){errs.push('p'+p+' '+e.message+' '+JSON.stringify(c));}
  }
  if(errs.length&&i<3) console.log('errors at',i,errs.slice(0,3));
  // advance 20 steps
  for(let k=0;k<20;k++)R.step(m);
  // compare units
  const sn=R.snapshot(m,0);
  const nf=frames[i+1];
  if(nf){
    let md=0,hd=0;
    for(const u of sn.units){const ru=nf.units.find(x=>x.id===u.id);if(!ru){md=99;continue;}md=Math.max(md,Math.hypot(u.x-ru.x,u.y-ru.y));hd=Math.max(hd,Math.abs(u.hp-ru.hp));}
    if(md>0.01||hd>0.01||sn.units.length!==nf.units.length){ if(i<5||md>1) console.log('t'+(i+1)+' units diff pos'+md.toFixed(2)+' hp'+hd.toFixed(2)+' n '+sn.units.length+'/'+nf.units.length+' basehp '+sn.bases.map(b=>Math.round(b.hp)).join(',')+' vs '+nf.bases.map(b=>Math.round(b.hp)).join(',')); }
  }
}
console.log('final now',m.now,'status',m.status,'winner',m.winner);
console.log('recorded final',g.final.now,g.final.status,g.final.winner);
console.log('basehp',m.bases.map(b=>b.hp),'recorded',g.final.bases.map(b=>b.hp));
