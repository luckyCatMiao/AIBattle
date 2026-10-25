'use strict';
const sim=require('./simulation');
const agent=require('./agent');
function baseline(g,team,mode){
 const s=agent.local(g,team),b=s.ball;
 const dirs=[['N',0,0],['U',0,-1],['D',0,1],['L',-1,0],['R',1,0],['UL',-.707,-.707],['UR',.707,-.707],['DL',-.707,.707],['DR',.707,.707]];
 let closest=s.us.filter(u=>s.n===1||u.index!==0).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
 return s.us.map(u=>{
 let t={x:b.x,y:b.y};let kick=false,aim=0;
 if(u.id===b.owner){
  t={x:33.4,y:13};
  let gy=13;
  if(mode==='corners'){const k=s.them.find(v=>v.index===0);gy=k&&k.y>13?10.7:15.3;}
  aim=(Math.atan2(gy-u.y,43-u.x)*180/Math.PI+360)%360;
  kick=u.x>24||s.them.some(e=>Math.hypot(u.x-e.x,u.y-e.y)<1.6);
 }else if(u.index===0&&s.n>1){
  let gy=b.y;if(b.vx<-.1)gy=b.y+b.vy*(3-b.x)/b.vx;
  t={x:3,y:Math.max(10.7,Math.min(15.3,gy))};
 }else if(u!==closest&&mode!=='swarm')t={x:Math.max(10,Math.min(31,b.x-4)),y:Math.max(3,Math.min(23,b.y+(u.index%2?4:-4)))};
 t.x=Math.min(33.4,t.x);
 let best='N',v=Infinity;
 for(const [d,dx,dy] of dirs){let x=u.x+dx*.1575,y=u.y+dy*.1575;if(x>=33.8&&y>=5.8&&y<=20.2)continue;let w=Math.hypot(x-t.x,y-t.y)+(d==='N'?.02:0);if(w<v){v=w;best=d;}}
 if(team){best=({L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'})[best]||best;aim=(180-aim+360)%360;}
 return {dir:best,aim,kick};
 });
}
function run(n,seat,mode,seed){
 const g=sim.createMatch({teamSize:n,seed,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});let ms=0,windows=0;
 while(g.status==='playing'){
  let now=performance.now();const a=agent.decide(sim.view(g,seat)).inputs;ms=Math.max(ms,performance.now()-now);windows++;
  // Baseline has the same one-second open-loop restriction, with its own
  // predicted self-play trajectory, rather than privileged live inputs.
  const pred=agent.restore(sim.view(g,1-seat));const opp=[];
  for(let i=0;i<20;i++){
   let b=baseline(pred,1-seat,mode),c=baseline(pred,seat,mode);opp.push(b);
   for(const u of pred.units)u.held=(u.team===1-seat?b:c)[u.index];sim.step(pred);
  }
  let w=[];w[seat]=a;w[1-seat]=opp;
  sim.submitWindow(g,seat,a);sim.submitWindow(g,1-seat,opp);sim.advanceWindow(g,w);
 }
 return {n,seat,mode,seed,score:g.score,win:g.winner===null?'draw':g.winner===seat?'win':'loss',fouls:g.stats.map(s=>s.fouls),kicks:g.stats.map(s=>s.kicks),maxMs:Math.round(ms),windows};
}
if(require.main===module){const full=process.argv.includes('--full');for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++)for(const mode of (full?['swarm','corners']:['corners']))console.log(JSON.stringify(run(n,seat,mode,4001+n)));}
module.exports={run,baseline};
