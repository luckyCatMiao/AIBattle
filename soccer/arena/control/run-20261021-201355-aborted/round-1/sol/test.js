'use strict';
const sim=require('./simulation');
const agent=require('./agent');
const SQ=Math.SQRT1_2,ds=[['N',0,0],['R',1,0],['DR',SQ,SQ],['D',0,1],['DL',-SQ,SQ],['L',-1,0],['UL',-SQ,-SQ],['U',0,-1],['UR',SQ,-SQ]];
const a=(dir='N',aim=0,kick=false)=>({dir,aim,kick});
function go(u,x,y){let best='N',score=Math.hypot(x-u.x,y-u.y);for(const d of ds){let s=Math.hypot(x-u.x-d[1]*.1575,y-u.y-d[2]*.1575);if(s<score){score=s;best=d[0];}}return best;}
const ang=(x,y)=>(Math.atan2(y,x)*180/Math.PI+360)%360;
function baseline(g,t,kind){
 const own=g.units.filter(u=>u.team===t),b=g.ball,sg=t===0?1:-1,gx=t===0?43:1;
 const near=own.reduce((p,u)=>Math.hypot(u.x-b.x,u.y-b.y)<Math.hypot(p.x-b.x,p.y-b.y)?u:p,own[1]);
 return own.map((u,i)=>{
  if(b.owner===u.id){
   const dx=gx-u.x,dy=13-u.y,d=Math.hypot(dx,dy);
   const shoot=kind==='rush'||(d<20&&kind!=='dribble')||d<5;
   return a(go(u,gx,13),ang(dx,dy),shoot);
  }
  if(kind==='rush'||u===near)return a(go(u,b.x,b.y),ang(gx-u.x,13-u.y),true);
  if(i===0)return a(go(u,t===0?3:41,Math.max(10.6,Math.min(15.4,b.y))),ang(gx-u.x,13-u.y),true);
  return a(go(u,b.x-sg*3,b.y<13?17:9),ang(gx-u.x,13-u.y),true);
 });
}
function opponentWindow(g,t,kind){
 const copy=structuredClone(g),out=[];
 for(let f=0;f<20;f++){
  let aa=baseline(copy,t,kind),bb=baseline(copy,1-t,'rush');out.push(aa);
  for(const u of copy.units)u.held=(u.team===t?aa:bb)[u.index];sim.step(copy);
 }return out;
}
function match(team,kind){
 const g=sim.createMatch({players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 let timings=[],n=0;
 while(g.status==='playing'){
  let before=performance.now(),win=agent.plan(sim.view(g,team));timings.push(performance.now()-before);
  const other=kind==='self'?agent.plan(sim.view(g,1-team)):opponentWindow(g,1-team,kind);
  const ws=team===0?[win.inputs,other.inputs||other]:[other.inputs||other,win.inputs];
  sim.submitWindow(g,0,ws[0]);sim.submitWindow(g,1,ws[1]);sim.advanceWindow(g,ws);n++;
 }
 return {team,kind,score:g.score,winner:g.winner,frames:g.frame,kicks:g.stats.map(s=>s.kicks),possession:g.stats.map(s=>s.possession),responseMs:{mean:timings.reduce((a,b)=>a+b,0)/n,max:Math.max(...timings)},events:g.events.filter(e=>e.type==='goal').map(e=>({frame:e.frame,team:e.team}))};
}
if(require.main===module){for(const kind of process.argv.slice(2).length?process.argv.slice(2):['rush','shoot','dribble','self'])for(let t=0;t<2;t++)console.log(JSON.stringify(match(t,kind)));}
module.exports={match,baseline};
