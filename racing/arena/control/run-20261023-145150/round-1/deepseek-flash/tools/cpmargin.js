'use strict';
const sim=require('../simulation.js');
const {Agent}=require('../agent.js');
const cfg=process.argv[2]?JSON.parse(process.argv[2]):{};
const seeds=(process.argv[3]||'4000,4001,4002,4003,4004,4005').split(',').map(Number);
let margins=[];
for(const seed of seeds){
  const agent=new Agent(cfg);
  const g=sim.createMatch({id:'t',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
  g.cars[1].x=2;g.cars[1].y=2;
  const neutralW=Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}]);
  let w=0, minD=1e9, cp=null, framesLeft=0;
  while(g.status==='playing'&&w<340){
    const obs=sim.view(g,0); obs.decisionWindows=true; obs.framesPerWindow=20;
    const rep=agent.plan(obs);
    const w0=sim.submitWindow(g,0,rep.inputs), w1=sim.submitWindow(g,1,neutralW);
    for(let i=0;i<20&&g.status==='playing';i++){
      g.cars[0].held=w0[i][0]; g.cars[1].held=w1[i][0];
      const c0=g.cars[0], cp0=g.track.checkpoints[c0.nextCp], before=c0.nextCp;
      sim.step(g); g.cars[1].x=2;g.cars[1].y=2;g.cars[1].vx=0;g.cars[1].vy=0;
      const c=g.cars[0];
      if(cp0){const d=Math.hypot(c.x-cp0.x,c.y-cp0.y); if(d<minD)minD=d;}
      if(c.nextCp!==before&&cp0){margins.push(+(cp0.radius-minD).toFixed(2)); minD=1e9;}
    }
    w++;
  }
}
margins.sort((a,b)=>a-b);
const n=margins.length;
const mean=margins.reduce((a,b)=>a+b,0)/n;
console.log(JSON.stringify(cfg|0||cfg),'n',n,'meanMargin',mean.toFixed(2),'min',margins[0],'p5',margins[Math.floor(n*0.05)],'p25',margins[Math.floor(n*0.25)],'median',margins[Math.floor(n*0.5)],'missed(<=0)',margins.filter(m=>m<=0).length);
