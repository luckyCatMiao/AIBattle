const fs=require('fs'),R=require('./rules.js');
let source=fs.readFileSync('test.js','utf8');const opp=Function('R',source.slice(source.indexOf('function opp('),source.indexOf('for(let variant=0;variant<3'))+'; return opp;')(R);
const records=JSON.parse(fs.readFileSync('public_replays.json')).filter(r=>r.id.startsWith('r'));
for(const filename of process.argv.slice(2)){
 const decide=require('./'+filename).decide;let results=[];
 for(const rec of records)for(const time of [15,40,65,100]){
  const seat=rec.seats.indexOf('astra');let g=structuredClone(rec.frames.reduce((a,b)=>Math.abs(a.now-time)<Math.abs(b.now-time)?a:b));
  g.nextId=1+Math.max(...g.units.map(u=>+u.id.slice(1)));g.eventId=100000;let errors=0;
  while(g.status==='playing'){const outs=[0,1].map(i=>i===seat?decide(R.snapshot(g,i)):opp(R.snapshot(g,i),2));for(let i=0;i<2;i++)for(const c of outs[i].commands)try{R.command(g,i,c)}catch(e){errors++}for(let j=0;j<20;j++)R.step(g)}
  results.push([rec.id,time,g.winner===seat,Math.round(g.now),errors]);
 }console.log(filename,JSON.stringify(results));
}
