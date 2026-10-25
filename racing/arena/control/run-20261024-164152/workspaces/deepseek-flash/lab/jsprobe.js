'use strict';
const { spawn } = require('child_process');
const sim = require('../simulation.js');
const seed = Number(process.argv[2] || 10);
const cmd = process.argv.slice(3);
const g = sim.createMatch({ id:'p', seed, players:[{name:'a',kind:'api'},{name:'b',kind:'api'}] });
const child = spawn(cmd[0], cmd.slice(1), { stdio:['pipe','pipe','pipe'] });
let buf=''; const waiting=[];
child.stdout.on('data', d=>{ buf+=d.toString(); let i;
  while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i); buf=buf.slice(i+1); const cb=waiting.shift(); if(cb) cb(line); } });
child.stderr.on('data', d=>process.stderr.write('[agent] '+d.toString()));
const ask = p => new Promise((res)=>{ waiting.push(l=>res(l)); child.stdin.write(JSON.stringify(p)+'\n'); });
const neutral = Array.from({length:20},()=>[{throttle:0,steer:0,drift:false,boost:false}]);
(async()=>{
  let lastLap=0;
  while (g.status==='playing' && g.frame < 300*20) {
    const line = await ask(sim.view(g,0));
    const frames = sim.submitWindow(g, 0, JSON.parse(line).inputs);
    sim.advanceWindow(g, [frames, neutral]);
    const c=g.cars[0];
    if (c.lap !== lastLap) { console.log('LAP', c.lap, 't', (g.frame/20).toFixed(2), 'nextCp', c.nextCp); lastLap=c.lap; }
    if (g.frame % 20 === 0) {
      console.log('f',g.frame,'t',(g.frame/20).toFixed(1),'x',c.x.toFixed(1),'y',c.y.toFixed(1),
        'v',Math.hypot(c.vx,c.vy).toFixed(1),'cp',c.nextCp,'lap',c.lap,'off',c.offRoad,'E',c.boostEnergy.toFixed(2));
    }
  }
  console.log('DONE', g.frame, g.cars[0].lap, g.cars[0].finishTime);
  child.stdin.end(); setTimeout(()=>child.kill(),100);
})();
