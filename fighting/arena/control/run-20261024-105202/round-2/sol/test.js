global.bot=null;
const sim=require('./simulation'),a=require('./agent'),fs=require('fs');
function run(team,enemy,style,seat=0,limit=500,exact=false){
 let teams=[];teams[seat]=team;teams[1-seat]=enemy;
 let g=sim.createMatch({players:teams.map((team,i)=>({name:''+i,kind:'api',team}))}),times=[],hist=[],prev=null;
 for(let w=0;w<limit&&g.status==='playing';w++){
  let t=performance.now();let obs=sim.snapshot(g,seat);let estimate=exact?g:a.hydrate(obs,prev);let r=a.decide(estimate,seat);times.push(performance.now()-t);
  prev=estimate;prev.fighters[seat].inputHistory.push(...r.inputs);prev.fighters[seat].inputHistory=prev.fighters[seat].inputHistory.slice(-30);
  let oc=a.controller(style),ins=[];
  for(let i=0;i<15&&g.status==='playing';i++){
   ins[seat]=r.inputs[i];ins[1-seat]=a.control(g,1-seat,oc);sim.stepFrame(g,ins);
  }
  if(w%20===0)hist.push([w,...g.fighters.map(f=>[f.char,Math.round(f.hp),Math.round(f.x),f.state])]);
 }
 return {team,enemy,style,seat,winner:g.winner,frames:g.frames,rounds:g.roundLog,hp:g.fighters.map(f=>Math.round(f.hp)),maxMs:Math.max(...times),meanMs:times.reduce((a,b)=>a+b,0)/times.length,hist};
}
if(require.main===module){let style=process.argv[2]||'balanced';let team=(process.argv[3]||'kestrel,aegis,vex').split(',');let enemy=(process.argv[4]||'vex,kestrel,aegis').split(',');let seat=+(process.argv[5]||0);let result=run(team,enemy,style,seat);fs.writeFileSync(`test-${style}-${seat}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
module.exports={run};
