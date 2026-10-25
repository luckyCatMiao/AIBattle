'use strict';
const sim=require('../simulation.js');
const {Agent}=require('../agent.js');
const seed=Number(process.argv[2]||2000);
const agent=new Agent(process.argv[3]?JSON.parse(process.argv[3]):undefined);
const g=sim.createMatch({id:'t',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
g.cars[1].x=2;g.cars[1].y=2;
const neutralW=Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}]);
let w=0,lastCp=1,minD=1e9,rows=[];
while(g.status==='playing'&&w<340){
  const obs=sim.view(g,0); obs.decisionWindows=true; obs.framesPerWindow=20;
  const rep=agent.plan(obs);
  const c0=g.cars[0];
  // per-frame checkpoint distance tracking
  const w0=sim.submitWindow(g,0,rep.inputs);
  const w1=sim.submitWindow(g,1,neutralW);
  for(let i=0;i<20&&g.status==='playing';i++){
    g.cars[0].held=w0[i][0]; g.cars[1].held=w1[i][0];
    const cp=g.track.checkpoints[g.cars[0].nextCp];
    const before=g.cars[0].nextCp, lapBefore=g.cars[0].lap;
    sim.step(g);
    g.cars[1].x=2;g.cars[1].y=2;g.cars[1].vx=0;g.cars[1].vy=0;
    const c=g.cars[0];
    if(cp){const d=Math.hypot(c.x-cp.x,c.y-cp.y); if(d<minD)minD=d;}
    if(c.nextCp!==before||c.lap!==lapBefore){rows.push({t:(g.frame/20).toFixed(1),cp:before+'->'+c.nextCp,lap:c.lap,minD:minD.toFixed(2),r:cp?cp.radius.toFixed(2):'?',v:Math.hypot(c.vx,c.vy).toFixed(1)});minD=1e9;}
  }
  w++;
}
console.log('seed',seed,'fin',g.cars[0].finishTime,'lap',g.cars[0].lap,'best',g.cars[0].bestLap);
const bad=rows.filter(r=>+r.minD>+r.r-0.6);
console.log('events',rows.length,'tight passes (< r-0.6 margin):',bad.length);
console.log(rows.slice(0,20).map(r=>`${r.t} ${r.cp} L${r.lap} d${r.minD}/r${r.r} v${r.v}`).join('\n'));
console.log('tightest:',rows.map(r=>+r.minD-+r.r).sort((a,b)=>b-a).slice(0,5));
