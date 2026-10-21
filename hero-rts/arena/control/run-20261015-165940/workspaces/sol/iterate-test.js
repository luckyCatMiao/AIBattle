'use strict';
const sim=require('./simulation'),{performance}=require('perf_hooks'),fs=require('fs');
const crypto=require('crypto');
const candidateHash=crypto.createHash('sha256').update(fs.readFileSync(require.resolve(process.argv[4]||'./agent'))).digest('hex');
const opponentPath=process.argv[5]||(['self','caster'].includes(process.argv[3])?(process.argv[4]||'./agent'):'./agent-previous');
const opponentHash=crypto.createHash('sha256').update(fs.readFileSync(require.resolve(opponentPath))).digest('hex');
const seat=Number(process.argv[2]||0), mode=process.argv[3]||'previous',candidate=process.argv[4]||'./agent';
const a=require(candidate).makeAgent(),b=require(process.argv[5]||(['self','caster'].includes(mode)?candidate:'./agent-previous')).makeAgent();
const g=sim.createMatch({players:[0,1].map(i=>({kind:'api',hero:i===seat?(process.argv[6]||'druid'):['fire','caster'].includes(mode)?'pyromancer':'druid'}))});sim.command(g,0,{type:'start'});
let errors=[{},{}],maxMs=0,maxCommands=0,frames=0,checkpoints=[],deaths=[{},{}],peak=0;
while(g.status==='playing'){
 let outputs=[];
 for(let o=0;o<2;o++){
 const s=JSON.parse(JSON.stringify(sim.snapshot(g,o))),t=performance.now();let out=(o===seat?a:b)(s);if(o===seat){maxMs=Math.max(maxMs,performance.now()-t);maxCommands=Math.max(maxCommands,out.commands.length);}
 // A deliberately aggressive pressure variant, using our own economic controller.
 if(o!==seat&&mode==='fire'&&g.now>45&&g.tick%20===0){const enemy=g.buildings.find(x=>x.owner===seat&&x.type==='townhall');const casting=new Set(out.commands.filter(c=>c.type==='cast').map(c=>c.unit));const ids=g.units.filter(x=>x.owner===o&&x.type!=='worker'&&!x.casting&&!x.attack&&!casting.has(x.id)).map(x=>x.id);out.commands=out.commands.filter(c=>!['attack','attackMove','move','hold'].includes(c.type));if(ids.length)out.commands.push({type:'attackMove',units:ids,x:enemy.x,y:enemy.y});out.commands=out.commands.slice(0,20);}
 if(!Array.isArray(out.commands)||out.commands.length>20)throw Error('protocol');outputs[o]=out.commands;
 }
 for(let o=0;o<2;o++)for(const c of outputs[o])try{sim.command(g,o,c)}catch(e){const key=c.type+':'+(c.skill||c.tech||c.unit||c.building||'')+':'+e.message;errors[o][key]=(errors[o][key]||0)+1;}
 const before=new Map(g.units.filter(x=>x.owner>=0).map(x=>[x.id,x]));
 for(let k=0;k<5&&g.status==='playing';k++)sim.step(g);
 const ids=new Set(g.units.map(x=>x.id));for(const [id,u]of before)if(!ids.has(id)&&!u.summoned)deaths[u.owner][u.type]=(deaths[u.owner][u.type]||0)+1;
 if(g.tick%1200===0)checkpoints.push({time:Math.round(g.now),players:g.players.map(p=>({gold:Math.floor(p.gold),wood:Math.floor(p.wood),population:sim.population(g,p.id),control:p.controlTime,heroes:p.heroes.map(h=>[h.type,h.level])})),units:g.players.map(p=>Object.fromEntries([...new Set(g.units.filter(u=>u.owner===p.id).map(u=>u.type))].map(t=>[t,g.units.filter(u=>u.owner===p.id&&u.type===t).length])))});
 frames++;
}
console.log(JSON.stringify({seat,mode,candidate,candidateHash,opponentPath,opponentHash,winner:g.winner,win:g.winner===seat,time:g.now,reason:g.reason,frames,maxMs,maxCommands,errors,score:g.players.map(p=>sim.score(g,p)),deaths,checkpoints},null,2));
