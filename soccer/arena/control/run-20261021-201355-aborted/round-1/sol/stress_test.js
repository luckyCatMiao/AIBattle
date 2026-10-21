'use strict';
const sim=require('./simulation'),ag=require('./agent'),{baseline}=require('./test'),fs=require('fs');
function internal(g){return {u:g.units.map(u=>({x:u.x,y:u.y,team:u.team,index:u.index,fx:u.facing.x,fy:u.facing.y,cd:u.kickCd,lock:u.controlLock,steal:u.stealLock,vx:0,vy:0})),b:{...g.ball,owner:g.units.findIndex(u=>u.id===g.ball.owner)},freeze:g.freeze};}
function run(team,kind,scenario){
 const g=sim.createMatch({id:`feedback-${team}-${kind}-${scenario}`,players:[{name:'agent',kind:'api'},{name:'feedback',kind:'api'}]});
 if(scenario===1){g.ball.x=team===0?14:30;g.ball.y=11;g.ball.vx=team===0?-12:12;g.ball.vy=1.2;}
 if(scenario===2){g.ball.owner=`t${1-team}u1`;g.units[(1-team)*3+1].x=team===0?16:28;g.units[(1-team)*3+1].y=17;g.units[(1-team)*3+1].facing={x:team===0?-1:1,y:0};g.ball.x=team===0?15.38:28.62;g.ball.y=17;}
 if(scenario===3){g.ball.x=22;g.ball.y=2;g.ball.vx=5;g.ball.vy=-9;g.units[team*3+1].y=4;}
 let n=0,ms=0,max=0;
 while(g.status==='playing'){
  const now=performance.now(),w=ag.plan(sim.view(g,team)).inputs,dt=performance.now()-now;ms+=dt;max=Math.max(max,dt);n++;
  sim.submitWindow(g,team,w);
  for(let f=0;f<20&&g.status==='playing';f++){
   // Deliberately stronger information: this opponent sees the real state each physics frame.
   const op=kind==='feedback-smart'?ag.policy(internal(g),1-team):baseline(g,1-team,kind);
   for(const u of g.units)u.held=(u.team===team?w[f]:op)[u.index];sim.step(g);
  }
 }
 return {team,kind,scenario,score:g.score,winner:g.winner,frame:g.frame,responseMs:{mean:ms/n,max}};
}
let out=[];for(const kind of ['rush','shoot','dribble','feedback-smart'])for(let team=0;team<2;team++)for(let scenario=0;scenario<4;scenario++){let r=run(team,kind,scenario);out.push(r);console.log(JSON.stringify(r));}
fs.writeFileSync('/workspace/stress_results.json',JSON.stringify(out,null,2));
