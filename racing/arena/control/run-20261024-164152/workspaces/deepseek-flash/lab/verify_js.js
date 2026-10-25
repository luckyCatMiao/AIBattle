// Verify soft-cap top speed using the OFFICIAL simulation.js
const sim = require('../simulation.js');
const g = sim.createMatch({ id:'v', seed: 6011, players:[{name:'a',kind:'api'},{name:'b',kind:'api'}] });
g.countdown = 0; g.phase='live';
const a = g.cars[0];
a.boostEnergy = 1.0;
const win = Array.from({length:20},()=>[{throttle:1,steer:0,drift:false,boost:true}]);
const neutral = Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}]);
for (let w=0; w<40; w++) {
  sim.advanceWindow(g, [win, neutral]);
  if (w%5===0) console.log('w',w,'speed',Math.hypot(a.vx,a.vy).toFixed(2),'vx',a.vx.toFixed(2),'vy',a.vy.toFixed(2),'energy',a.boostEnergy.toFixed(2),'off',a.offRoad,'x',a.x.toFixed(1),'y',a.y.toFixed(1));
}
