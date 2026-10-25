'use strict';
const sim=require('../simulation');
const g=sim.createMatch({id:'pc',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:5011});
const c0=g.cars[0];
const inputs=[];
for(let i=0;i<260;i++){
  const st=Math.sin(i*0.05)*0.35;
  inputs.push({throttle:1,steer:(i%40<10?0.6:(i%40<20?-0.4? -0.4:0.4:st)),drift:(i%30<8),boost:(i%50<12)});
}
// fix steer expression properly
for(let i=0;i<260;i++){ const st=Math.sin(i*0.05)*0.35; inputs[i]={throttle:1,steer:(i%40<10?0.6:(i%40<20?-0.4:st)),drift:(i%30<8),boost:(i%50<12)}; }
const states=[];
for(let w=0; w<13; w++){
  const win=[]; for(let k=0;k<20;k++){ const inp=inputs[w*20+k]; win.push([sim.normalizeUnitInput(inp)]); }
  sim.advanceWindow(g,[win,Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}])]);
  g.cars[1].x=1.5; g.cars[1].y=1.5; g.cars[1].vx=0; g.cars[1].vy=0;
  states.push([+c0.x.toFixed(6),+c0.y.toFixed(6),+c0.angle.toFixed(6),+c0.vx.toFixed(6),+c0.vy.toFixed(6),+c0.boostEnergy.toFixed(6),+c0.driftCharge.toFixed(6),c0.driftTime,c0.boosts]);
}
console.log(JSON.stringify({inputs,states}));
