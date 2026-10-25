global.bot=null;const s=require('./simulation'),a=require('./agent'),fs=require('fs');
let seat=+(process.argv[2]||0),teams=[['kestrel','aegis','vex'],['kestrel','aegis','vex']],g=s.createMatch({players:teams.map((team,i)=>({name:''+i,kind:'api',team}))}),prev=null,n=0;
while(g.status==='playing'&&n++<600){
 let h=a.hydrate(s.snapshot(g,seat),prev),r=a.decide(h,seat),enemy=a.candidateWindows(g,1-seat);prev=h;h.fighters[seat].inputHistory.push(...r.inputs);h.fighters[seat].inputHistory=h.fighters[seat].inputHistory.slice(-30);
 let w=enemy.map(w=>({w,v:a.rollFixed(g,1-seat,w,r.inputs,75)})).sort((a,b)=>b.v-a.v)[0].w,ins=[];ins[seat]=r.inputs;ins[1-seat]=w;s.advanceWindow(g,ins);
}
let result={description:'opponent sees committed window and uses exact internal state; unfair stress test',seat,winner:g.winner,frames:g.frames,rounds:g.roundLog,hp:g.fighters.map(f=>Math.round(f.hp))};fs.writeFileSync(`adversarial-${seat}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
