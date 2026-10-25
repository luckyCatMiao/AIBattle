'use strict';
const fs=require('fs'),{performance}=require('perf_hooks'),sim=require('./rules.js'),{choose}=require('./agent.js');
function baseline(o,type){if(type==='previous')return require('./agent_v1.js').choose(o);const rush=type==='rush',northFirst=type==='northTank';if(rush)type='raider';if(northFirst)type='tank';const p=o.players[o.yourPlayer],b=o.bases[o.yourPlayer],us=o.units.filter(u=>u.owner===p.id),army=us.filter(u=>u.type!=='worker');let money=p.credits;const c=[];if(o.now===0){c.push({type:'train',unit:'worker'});money-=50;}if(b.queue.length<2&&money>=sim.TYPES[type].cost&&us.length+b.queue.length<40){c.push({type:'train',unit:type});money-=sim.TYPES[type].cost;}if(p.level<2&&army.length>8&&money>=180+p.level*120)c.push({type:'upgrade'});const n=[...o.nodes].sort((a,z)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(z.x-b.x,z.y-b.y)).find(n=>n.owner!==p.id);const target=rush?o.bases[1-p.id]:(northFirst&&o.nodes[0].owner!==p.id?o.nodes[0]:n||o.bases[1-p.id]);c.push({type:'rally',x:target.x,y:target.y});if(army.length)c.push({type:'attackMove',units:army.map(u=>u.id),x:target.x,y:target.y});return{commands:c};}
const rows=[];let max=0,total=0,calls=0,errors=[];
for(const kind of ['northTank','rush','previous'])for(const seat of [0,1]){
 const g=sim.createMatch({id:'local-'+kind+'-'+seat,players:[{kind:'api'},{kind:'api'}]});g.status='playing';const history=[];
 for(let second=0;second<600&&g.status==='playing';second++){
  const obs=[sim.snapshot(g,0),sim.snapshot(g,1)];
  const actions=obs.map((o,i)=>{const t=performance.now();const a=i===seat||kind==='mirror'?choose(o):baseline(o,kind);if(i===seat){const dt=performance.now()-t;max=Math.max(max,dt);total+=dt;calls++;}return a;});
  for(let i=0;i<2;i++){if(actions[i].commands.length>10)throw Error('budget');for(const c of actions[i].commands)try{sim.command(g,i,c);}catch(e){errors.push({kind,seat,second,i,c,error:e.message});}}
  for(let k=0;k<20;k++)sim.step(g);
  if(second%30===0)history.push({t:second+1,nodes:g.nodes.map(n=>n.owner),units:g.players.map(p=>g.units.filter(u=>u.owner===p.id).length),score:g.players.map(p=>sim.score(g,p)),base:g.bases.map(b=>Math.round(b.hp))});
 }
 const row={kind,seat,winner:g.winner,time:g.now,score:g.players.map(p=>sim.score(g,p)),history};rows.push(row);console.log(JSON.stringify({...row,history:undefined}));
}
const output={rows,performance:{calls,meanMs:total/calls,maxMs:max},errors};fs.writeFileSync('revision3_adversarial.json',JSON.stringify(output,null,2));console.log(JSON.stringify({performance:output.performance,errors:errors.slice(0,5),errorCount:errors.length}));
