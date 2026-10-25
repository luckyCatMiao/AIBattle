'use strict';
const { runMatch, PyAgent, sim } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:d;};
(async()=>{
  const b=arg('b','botBlock');
  let totGoals=0, afterFoul=0, fouls=0, goals=0;
  for(const seed of [1,2,3,8,17,24,9,4]){
    for(const swap of [false,true]){
      const A=new PyAgent(PY,'agent.py',ROOT,'A');
      const f=async v=>bots[b](v);
      const me=swap?1:0;
      const g=await runMatch({seed, agentA: swap?f:async v=>JSON.parse(await A.ask(v)).inputs, agentB: swap?async v=>JSON.parse(await A.ask(v)).inputs:f});
      const myGoals=g.events.filter(e=>e.type==='goal'&&e.team===me);
      const myFouls=g.events.filter(e=>e.type==='foul'&&e.team===me);
      fouls+=myFouls.length; goals+=myGoals.length;
      for(const gl of myGoals){ totGoals++; if(myFouls.some(fo=>fo.frame<gl.frame&&gl.frame-fo.frame<=60)) afterFoul++; }
      A.kill();
    }
  }
  console.log(`vs ${b}: 我的进球 ${goals}, 我的犯规 ${fouls}, 其中「犯规后 3 秒内」进球 ${afterFoul} (${(100*afterFoul/Math.max(1,goals)).toFixed(0)}%)`);
})();
