'use strict';
const sim=require('/workspace/simulation.js');
const {rules,W,H}=sim;
function mkUnit(id,team,index,x,y,fx,fy){return {id,team,index,name:id,x,y,facing:{x:fx,y:fy},held:{dir:'N',aim:null,kick:false},inputHistory:[],kickCd:0,controlLock:0,stealLock:0,foulLock:0,goals:0,kicks:0,touches:0};}
function setup(state){
  const g=sim.createMatch({id:'s',seed:state.seed||1,players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}],teamSize:1});
  g.units=state.units.map(u=>mkUnit(u.id,u.team,u.index,u.x,u.y,u.fx,u.fy));
  g.ball={x:state.ball.x,y:state.ball.y,vx:state.ball.vx||0,vy:state.ball.vy||0,owner:state.ball.owner||null,lastTouch:null,lastTeam:null};
  g.freeze=0; g.score=[0,0]; g.frame=0; g.tick=0; g.golden=false; g.status='playing'; g.half=1; g.kickoffTeam=state.kickoffTeam||0;
  return g;
}
function run(state, frames, inputs){ // inputs: fn(frame,g)->held for each unit id
  const g=setup(state);
  const states=[];
  for(let f=0;f<frames && g.status==='playing';f++){
    for(const u of g.units){u.held=inputs(f,g,u);}
    sim.step(g);
    states.push({score:[...g.score],ball:{x:g.ball.x,y:g.ball.y,vx:g.ball.vx,vy:g.ball.vy,owner:g.ball.owner},units:g.units.map(u=>({id:u.id,x:u.x,y:u.y}))});
  }
  return {g,states};
}
const D=Math.PI/180;
// scenario A: team0 shooter at (33,12), ball at (33.62,12), keeper team1 at (41.5,13)
const A={units:[
  {id:'t0u0',team:0,index:0,x:33,y:12,fx:1,fy:0},
  {id:'t1u0',team:1,index:0,x:41.5,y:13,fx:-1,fy:0},
],ball:{x:33.62,y:12,owner:'t0u0'}};
// mirror: x->44-x, teams swap, vx flip
const B={units:[
  {id:'t1u0',team:1,index:0,x:44-33,y:12,fx:-1,fy:0},
  {id:'t0u0',team:0,index:0,x:44-41.5,y:13,fx:1,fy:0},
],ball:{x:44-33.62,y:12,owner:'t1u0'}};
function shooterInput(team,targetY){return (f,g,u)=>{
  if(u.team===team){ // kick on frame 0 toward own target
    return {dir:'N',aim:Math.atan2(targetY-u.y, (team===0?43:0)-u.x)/D,kick:f===0};
  }
  // keeper moves toward ball y
  const b=g.ball; const gy=13; const ty=Math.max(10.5,Math.min(15.5,b.y));
  const dx=(team===0?43:0)-u.x, dy=ty-u.y;
  const n=Math.hypot(dx,dy)||1;
  const dirs=['R','DR','D','DL','L','UL','U','UR']; let i=Math.round(Math.atan2(dy,dx)/(Math.PI/4));i=((i%8)+8)%8;
  return {dir:dirs[i],aim:null,kick:false};
};}
const ra=run(A,40,shooterInput(0,10.8));
const rb=run(B,40,shooterInput(1,10.8));
console.log("A score",ra.g.score,"frames",ra.states.length,"last ball",ra.states[ra.states.length-1].ball);
console.log("B score",rb.g.score,"frames",rb.states.length,"last ball",rb.states[rb.states.length-1].ball);
// mirror-compare trajectories
const n=Math.min(ra.states.length,rb.states.length);
let maxdiff=0, at=0;
for(let i=0;i<n;i++){
  const a=ra.states[i],b=rb.states[i];
  const dx=Math.abs(a.ball.x-(44-b.ball.x)), dy=Math.abs(a.ball.y-b.ball.y);
  const d=Math.max(dx,dy); if(d>maxdiff){maxdiff=d;at=i;}
}
console.log("max mirror ball diff",maxdiff.toFixed(4),"at frame",at);
for(let i=0;i<n;i+=2){const a=ra.states[i],b=rb.states[i];console.log(i,"A",a.ball.x.toFixed(2),a.ball.y.toFixed(2),a.ball.owner,"| Bmir",(44-b.ball.x).toFixed(2),b.ball.y.toFixed(2),b.ball.owner);}
