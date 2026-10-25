const sim = require('../simulation.js');
const g = sim.createMatch({ id:'r', seed: Number(process.argv[2]||10),
  players:[{name:'a',kind:'api'},{name:'b',kind:'api'}] });
const seq = [];
for (let i=0;i<300;i++) seq.push([{throttle:1, steer:0.3*Math.sin(i*0.11), drift:(i%7)!==0, boost:true}]);
g.countdown = 0; g.phase='live';
const a=g.cars[0]; a.boostEnergy=1.0;
const neutral = Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}]);
let idx=0;
while (idx<300) {
  const win = seq.slice(idx, idx+20);
  idx += 20;
  sim.advanceWindow(g, [win, neutral]);
}
console.log(JSON.stringify({x:a.x,y:a.y,ang:a.angle,vx:a.vx,vy:a.vy,be:a.boostEnergy,de:a.driftCharge,lap:a.lap,nextCp:a.nextCp,off:a.offRoad}));
