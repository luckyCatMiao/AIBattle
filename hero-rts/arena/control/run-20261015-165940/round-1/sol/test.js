'use strict';
const sim=require('./simulation'),{makeAgent}=require('./agent');
const {performance}=require('perf_hooks');
const mode=process.argv[2]||'idle',seat=+(process.argv[3]||0);const heroes=seat===0?['druid','ranger']:['ranger','druid'];
if(process.argv[4])heroes[1-seat]=process.argv[4];
const g=sim.createMatch({players:heroes.map((hero,i)=>({name:'test'+i,kind:'api',hero}))});sim.command(g,0,{type:'start'});
const a=makeAgent(),b=makeAgent();let errors={},maxMs=0,cmds=0,decisions=0;
function opponent(o){const p=g.players[o],us=g.units.filter(u=>u.owner===o),bs=g.buildings.filter(b=>b.owner===o),enemy=g.buildings.find(b=>b.owner!==o&&b.type==='townhall');let c=[];
if(mode==='idle')return c;
if(mode==='mirror')return b(JSON.parse(JSON.stringify(sim.snapshot(g,o)))).commands;
if(g.tick%40===0){for(const building of bs.filter(b=>b.type==='barracks'&&b.queue.length<2))if(p.gold>=90&&p.wood>=10&&sim.population(g,o)+2<=sim.popCap(g,o))c.push({type:'train',unit:'footman',building:building.id});
if(us.filter(u=>u.type==='worker').length<12&&p.gold>60)c.push({type:'train',unit:'worker'});
if(enemy)c.push({type:'attackMove',units:us.filter(u=>u.type!=='worker').map(u=>u.id),x:enemy.x,y:enemy.y});}
return c;}
while(g.status==='playing'){
 const t=performance.now(),out=a(JSON.parse(JSON.stringify(sim.snapshot(g,seat))));maxMs=Math.max(maxMs,performance.now()-t);if(!Array.isArray(out.commands)||out.commands.length>20)throw Error('protocol');cmds+=out.commands.length;decisions++;
 const oc=opponent(1-seat);for(const [o,cs]of [[seat,out.commands],[1-seat,oc]])for(const c of cs){try{sim.command(g,o,c);}catch(e){const key=o+':'+c.type+':'+(c.unit||c.building||c.skill||c.tech||'')+':'+e.message;errors[key]=(errors[key]||0)+1;}}
 for(let k=0;k<5&&g.status==='playing';k++)sim.step(g);
 if(g.tick%4000===0)process.stderr.write(JSON.stringify({now:g.now,score:g.players.map(p=>sim.score(g,p)),units:g.players.map(p=>g.units.filter(u=>u.owner===p.id).length),res:g.players.map(p=>[Math.floor(p.gold),Math.floor(p.wood)]),nodes:g.nodes.map(n=>n.owner)})+'\n');
}
console.log(JSON.stringify({mode,seat,winner:g.winner,reason:g.reason,time:g.now,decisions,cmds,maxMs,score:g.players.map(p=>sim.score(g,p)),errors},null,2));
