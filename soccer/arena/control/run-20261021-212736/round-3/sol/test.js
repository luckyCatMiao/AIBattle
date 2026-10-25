'use strict';
const sim=require('./simulation');
const A=require('./agent');
const V1=require('./agent_v1');
const fs=require('fs');
const dirs={N:[0,0],U:[0,-1],D:[0,1],L:[-1,0],R:[1,0],UL:[-.7071067811865476,-.7071067811865476],UR:[.7071067811865476,-.7071067811865476],DL:[-.7071067811865476,.7071067811865476],DR:[.7071067811865476,.7071067811865476]};
const angle=(x,y)=>(Math.atan2(y,x)*180/Math.PI+360)%360;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function go(u,x,y){let best='N',bv=1e9;for(const [k,d]of Object.entries(dirs)){let v=Math.hypot(u.x+d[0]*.1575-x,u.y+d[1]*.1575-y);if(v<bv){best=k;bv=v;}}return best;}
function baseline(o,mode) {
 const s=A.makeState(o),team=o.yourTeam,out=[];
 for(let f=0;f<20;f++){
  let own=s.units.filter(u=>u.team===team),b=s.ball,gx=team===0?43:1,home=team===0?1:43,sgn=team===0?1:-1;
  let nearest=own.reduce((a,u)=>distance(u,b)<distance(a,b)?u:a), keeper=own.reduce((a,u)=>Math.abs(u.x-home)<Math.abs(a.x-home)?u:a);
  let acts=own.map(u=>{
   let tx=b.x,ty=b.y,kick=false,aim=angle(gx-u.x,13-u.y);
   if(b.owner===u.id){
    if(mode==='dribble'){tx=gx;ty=13;kick=Math.abs(gx-u.x)<4;}
    else {let shot=A.shot(s,u);tx=gx;ty=13;aim=shot.aim;kick=mode==='swarm'||shot.score>-.8||Math.abs(gx-u.x)<12;}
   }else if(mode==='defense'&&own.length>=2&&keeper.id===u.id&&nearest.id!==u.id){
    tx=home+sgn*1.2;ty=Math.max(10.6,Math.min(15.4,b.y));
   }else if(mode==='defense'&&u.id!==nearest.id){tx=home+sgn*(3+u.index*1.5);ty=10.8+u.index%3*2.1;}
   else if(mode==='dribble'&&u.id!==nearest.id){tx=b.x-sgn*3;ty=5+u.index*(16/Math.max(1,own.length-1));}
   if(distance(u,b)<1.4&&mode!=='dribble')kick=true;
   return {dir:go(u,tx,ty),aim,kick};
  });
  out.push(acts);
  const neutral=s.units.filter(u=>u.team!==team).map(u=>({dir:'N',aim:angle(b.x-u.x,b.y-u.y),kick:false}));
  A.step(s,team===0?[...acts,...neutral]:[...neutral,...acts]);
 }
 return {inputs:out};
}
function physicsCheck(){
 let g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],teamSize:6});
 let s=A.makeState(sim.view(g,0));let max=0;
 let seed=42;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let f=0;f<2800;f++){
  const acts=g.units.map(u=>({dir:Object.keys(dirs)[Math.floor(rand()*9)],aim:rand()*360,kick:rand()<.3}));
  // Periodic ball and unit arrangements exercise kicks, tackles, bounces and goals.
  if(f%80===0&&g.status==='playing'){
   let u=g.units[Math.floor(rand()*12)];g.ball.owner=u.id;g.ball.x=u.x+u.facing.x*.62;g.ball.y=u.y+u.facing.y*.62;
   s=A.makeState(sim.view(g,0));
  }
  g.units.forEach((u,i)=>u.held=acts[i]);sim.step(g);A.step(s,acts);
  if(g.status==='finished')break;
  let err=Math.max(...g.units.map((u,i)=>distance(u,s.units[i])),distance(g.ball,s.ball));max=Math.max(max,err);
  if(err>.1)throw Error('physics mismatch frame '+f+' err '+err);
 }
 return max;
}
function game(n,seat,mode){
 let g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:101+n,teamSize:n});
 let calls=0,total=0,max=0;
 while(g.status==='playing'){
  let t=performance.now();let a=A.decide(sim.view(g,seat));let took=performance.now()-t;total+=took;max=Math.max(max,took);calls++;
  let b=mode==='v1'?V1.decide(sim.view(g,1-seat)):mode==='mirror'?A.decide(sim.view(g,1-seat)):baseline(sim.view(g,1-seat),mode);
  let wa=sim.submitWindow(g,seat,a.inputs),wb=sim.submitWindow(g,1-seat,b.inputs);
  sim.advanceWindow(g,seat===0?[wa,wb]:[wb,wa]);
 }
 let row={n,seat,mode,score:g.score,result:g.winner==null?'draw':g.winner===seat?'win':'loss',calls,meanMs:Math.round(total/calls*100)/100,maxMs:Math.round(max*100)/100,goals:g.events.filter(e=>e.type==='goal').map(e=>({t:e.t,team:e.team}))};
 console.log(JSON.stringify(row));return row;
}
if(require.main===module){
 if(process.argv[2]==='physics'){console.log({maxError:physicsCheck()});process.exit();}
 let modes=process.argv[2]?[process.argv[2]]:['swarm','dribble','defense'];
 let results=[];for(const mode of modes)for(let n=1;n<=6;n++)for(let seat=0;seat<=1;seat++)results.push(game(n,seat,mode));
 fs.writeFileSync('test_results_'+modes.join('_')+'.json',JSON.stringify(results,null,2));
}
module.exports={baseline,game};
