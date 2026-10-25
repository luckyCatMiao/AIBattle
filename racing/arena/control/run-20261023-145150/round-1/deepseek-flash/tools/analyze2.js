'use strict';
const sim = require('../simulation.js');
const A = require('../agent.js');
const seed = Number(process.argv[2]);
const cfg = Object.assign({cornerA:20,mpcH:16,edgeMargin:1.2,driftOn:true,driftPulsePeriod:6,driftPulseOn:3,driftKappa:0.1,boostOn:true,boostMode:'always',boostMinEnergy:0.05,debug:true}, process.argv[3]?JSON.parse(process.argv[3]):{});
const agent = new A.Agent(cfg);
const g = sim.createMatch({ id: 'a', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
g.cars[1].x = 2; g.cars[1].y = 2;
const all = [];
while (g.status === 'playing' && all.length < 7000) {
  const obs = sim.view(g, 0);
  const rep = agent.plan(obs);
  const w0 = sim.submitWindow(g, 0, rep.inputs);
  const w1 = sim.submitWindow(g, 1, Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]));
  sim.advanceWindow(g, [w0, w1]);
  g.cars[1].x = 2; g.cars[1].y = 2; g.cars[1].vx = 0; g.cars[1].vy = 0;
  for (const l of agent.lastLog) all.push(l);
}
const from=Number(process.argv[4]||0), to=Number(process.argv[5]||all.length);
console.log('total frames',all.length,'fin',g.cars[0].finishTime,'best',g.cars[0].bestLap,'offroad%',(all.filter(f=>f.off).length/all.length*100).toFixed(2));
for(let i=from;i<Math.min(to,all.length);i++){const f=all[i];
  console.log(i, 's',f.s.toFixed(1),'x',f.x.toFixed(1),'y',f.y.toFixed(1),'v',f.v.toFixed(1),'st',f.steer.toFixed(2),f.drift?'D':'-',f.boost?'B':'-','be',f.be.toFixed(2),f.off?'OFF':'');}
