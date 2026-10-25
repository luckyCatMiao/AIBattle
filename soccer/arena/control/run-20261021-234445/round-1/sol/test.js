'use strict';
const sim=require('./simulation');
const agent=require('./agent');
const fs=require('fs');
const ang=(dx,dy)=>(Math.atan2(dy,dx)*180/Math.PI+360)%360;
const dirs={N:[0,0],U:[0,-1],D:[0,1],L:[-1,0],R:[1,0],UL:[-.7071,-.7071],UR:[.7071,-.7071],DL:[-.7071,.7071],DR:[.7071,.7071]};
function baseline(g,t,kind){
 const b=g.ball,n=g.teamSize,sign=t?-1:1;
 return g.units.filter(u=>u.team===t).map(u=>{
  let tx=b.x,ty=b.y,aim=ang(sign*20,13-u.y),kick=false;
  if(b.owner===u.id){
   tx=t?10.6:33.4;ty=13;
   if(kind==='rush')kick=true;
   else kick=(t?u.x<19:u.x>25);
   if(kind==='corners')aim=ang((t?1:43)-u.x,(u.y<13?15.3:10.7)-u.y);
  }else if(kind!=='rush'&&u.index===0&&n>1){tx=t?40:4;ty=Math.max(10.7,Math.min(15.3,b.y));}
  let best='N',bd=Infinity;
  for(const [d,v]of Object.entries(dirs)){
   const x=u.x+v[0]*.1575,y=u.y+v[1]*.1575;
   if(x<1.4||x>42.6||y<1.4||y>24.6)continue;
   if((t?x<=10.25:x>=33.75)&&y>=5.75&&y<=20.25)continue;
   const dd=Math.hypot(x-tx,y-ty);if(dd<bd){bd=dd;best=d;}
  }
  return {dir:best,aim,kick};
 });
}
function run(n,t,kind,seed){
 const g=sim.createMatch({seed,teamSize:n,players:[{name:'ours',kind:'api'},{name:'test',kind:'api'}]});
 let times=[],windows=0;
 while(g.status==='playing'){
  const start=performance.now();const a=agent.act(sim.view(g,t)).inputs;times.push(performance.now()-start);
  let other;
  if(kind==='mirror')other=agent.act(sim.view(g,1-t)).inputs;
  else if(kind==='oracle'){
   other=null;
  }else{
   const clone=agent.restore(sim.view(g,1-t));other=[];
   for(let f=0;f<20;f++){
    const acts=baseline(clone,1-t,kind);other.push(acts);
    const ourPred=baseline(clone,t,kind);
    for(const u of clone.units)u.held=(u.team===t?ourPred:acts)[u.index];sim.step(clone);
   }
  }
  if(other)sim.advanceWindow(g,t===0?[a,other]:[other,a]);
  else for(let f=0;f<20&&g.status==='playing';f++){
   const opp=agent.policy(g,1-t);for(const u of g.units)u.held=(u.team===t?a[f]:opp)[u.index];sim.step(g);
  }
  if(++windows>145)throw Error('clock');
 }
 const saves=g.events.filter(e=>e.type==='save').length;
 return {n,t,kind,seed,score:t?g.score.slice().reverse():g.score,win:g.winner===t?'W':g.winner===null?'D':'L',fouls:g.stats[t].fouls,kicks:g.stats[t].kicks,possession:g.stats[t].possession,saves,msMax:Math.round(Math.max(...times)),msAvg:Math.round(times.reduce((a,b)=>a+b)/times.length)};
}
if(require.main===module){
 const kinds=process.argv.slice(2);const results=[];
 for(const kind of kinds.length?kinds:['rush','corners','oracle'])for(let n=1;n<=6;n++)for(let t=0;t<2;t++){
  const r=run(n,t,kind,4000+n);results.push(r);console.log(JSON.stringify(r));
 }
 fs.writeFileSync('test_results.json',JSON.stringify(results,null,2));
}
module.exports={run,baseline};
