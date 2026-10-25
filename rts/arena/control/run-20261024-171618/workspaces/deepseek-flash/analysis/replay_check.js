const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const R=require('../rules.js');
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);
 const m=R.createMatch({id,players:[{name:'a'},{name:'b'}],seed:1});
 R.command(m,0,{type:'start'});
 let bad=0, applied=0;
 for(const d of g.decisions){
  while(m.now+1e-9 < d.now){ // should align
    R.step(m);
  }
  for(let p=0;p<2;p++)for(const c of d.commands[p]||[]){try{R.command(m,p,c);applied++;}catch(e){bad++;}}
  for(let k=0;k<20;k++)R.step(m);
 }
 const f=g.final;
 console.log(id,'now',m.now.toFixed(4),'vs',f.now.toFixed(4),'winner',m.winner,'vs',f.winner,
   'score',m.players.map(p=>R.score(m,p)).join(':'),'vs',f.players.map(p=>p.score).join(':'),
   'bad',bad,'applied',applied);
}
