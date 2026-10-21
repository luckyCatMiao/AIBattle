const fs=require('fs'),R=require('./rules.js'),records=JSON.parse(fs.readFileSync('public_replays.json')).slice(-2);
for(const name of process.argv.slice(2)){
const decide=require('./'+name).decide;let rows=[];
for(const rec of records)for(const time of [0,5,10,15,20]){
let g=structuredClone(rec.frames.find(f=>Math.abs(f.now-time)<.1)),seat=rec.seats.indexOf('astra');g.nextId=1+Math.max(...g.units.map(u=>+u.id.slice(1)));g.eventId=100000;
let errors=0;
for(let t=time;t<time+30&&g.status==='playing';t++){
 const own=decide(R.snapshot(g,seat)).commands, recorded=rec.decisions.find(d=>Math.abs(d.now-t)<.1).commands[1-seat];
 for(let i=0;i<2;i++)for(const c of i===seat?own:recorded)try{R.command(g,i,c)}catch(e){if(i===seat)errors++}
 for(let j=0;j<20;j++)R.step(g);
}
const army=i=>g.units.filter(u=>u.owner===i).reduce((v,u)=>v+u.hp*(u.type==='worker'?1: u.type==='tank'?1:1.5),0);
rows.push([rec.id,time,R.score(g,g.players[seat])-R.score(g,g.players[1-seat]),Math.round(army(seat)-army(1-seat)),errors]);
}console.log(name,JSON.stringify(rows));
}
