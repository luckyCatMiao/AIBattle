// node harness.js "cmdA" "cmdB" [seed] -> runs a full game, agent A = player0 (west)
const R=require('/workspace/rules.js');const {spawn}=require('child_process');const readline=require('readline');
const [a,b]=process.argv.slice(2,4);const quiet=process.argv[4]==='q';
function mk(cmd){const p=spawn('sh',['-c',cmd],{stdio:['pipe','pipe','inherit']});const rl=readline.createInterface({input:p.stdout});const q=[];let w=null;rl.on('line',l=>{if(w){const f=w;w=null;f(l)}else q.push(l)});return {p,ask(o){p.stdin.write(JSON.stringify(o)+'\n');return new Promise(r=>{if(q.length)r(q.shift());else w=r})}}}
(async()=>{const g=R.createMatch({players:[{name:'A'},{name:'B'}]});g.status='playing';const ag=[mk(a),mk(b)];const errs=[[],[]];let maxt=0;
while(g.status==='playing'){const obs=[0,1].map(i=>({...R.snapshot(g,i),lastErrors:errs[i],decisionSeconds:1,maxCommands:10}));
 const t0=Date.now();const res=await Promise.all(ag.map((x,i)=>x.ask(obs[i])));maxt=Math.max(maxt,Date.now()-t0);
 for(let i=0;i<2;i++){errs[i]=[];let cs=JSON.parse(res[i]).commands||[];cs.slice(0,10).forEach(c=>{try{R.command(g,i,c)}catch(e){errs[i].push(String(e.message))}});}
 if(!quiet&&Math.round(g.now)%(+process.env.EVERY||60)===0){if(process.env.V){const c={};g.units.forEach(u=>{const k=u.owner+u.type[0]+u.type[1];c[k]=(c[k]||0)+1});console.log(JSON.stringify(c),res.map(r=>JSON.parse(r).note).join(" ; "))}const s=R.snapshot(g,0);console.log(Math.round(g.now),s.players.map(p=>`p${p.id} sc${p.score} cr${p.credits} pop${p.population} b${Math.round(s.bases[p.id].hp)}`).join(' | '),s.nodes.map(n=>n.owner).join(','));}
 for(let k=0;k<20;k++)R.step(g);}
const s=R.snapshot(g,0);console.log('RESULT winner',g.winner,g.reason,'t',Math.round(g.now),s.players.map(p=>p.score).join(' '),'maxms',maxt);ag.forEach(x=>x.p.kill());process.exit(0)})();
