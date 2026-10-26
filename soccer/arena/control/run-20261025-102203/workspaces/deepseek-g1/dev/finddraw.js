'use strict';
const { runMatch, PyAgent, sim } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
(async()=>{
  const opps=['botBlock','botRush','botKeeper','botChase','botSmart'];
  const bySize={};
  for(let s=1;s<4000&&Object.keys(bySize).length<6;s++){const n=sim.createMatch({players:[{name:'a',kind:'api'},{name:'b',kind:'api'}],seed:s}).teamSize; if(!bySize[n])bySize[n]=s;}
  let found=0;
  for(const o of opps){ for(const n of [1,2,3,4,5,6]){ for(let k=0;k<3;k++){ const seed=bySize[n]+k*6;
    for(const swap of [false,true]){
      const A=new PyAgent(PY,'agent.py',ROOT,'A');
      const f=async v=>bots[o](v);
      const g=await runMatch({seed, agentA: swap?f:async v=>JSON.parse(await A.ask(v)).inputs, agentB: swap?async v=>JSON.parse(await A.ask(v)).inputs:f});
      const my=swap?g.score[1]:g.score[0], op=swap?g.score[0]:g.score[1];
      if(my===op&&found<10){ found++; console.log(`DRAW opp=${o} seed=${seed} n=${g.teamSize} swap=${swap} score=${my}:${op} reason=${g.reason} stats=${JSON.stringify(g.stats)}`); }
      A.kill();
    }}}}
})();
