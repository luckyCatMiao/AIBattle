'use strict';
const { runMatch, PyAgent } = require('./arena.js');
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
(async()=>{
  let t0=0,t1=0,d=0;
  for(const seed of [1,2,3,4,5,6,7,8]){
    const A=new PyAgent(PY,'agent.py',ROOT,'A'), B=new PyAgent(PY,'agent.py',ROOT,'B');
    const g=await runMatch({seed, agentA: async v=>JSON.parse(await A.ask(v)).inputs, agentB: async v=>JSON.parse(await B.ask(v)).inputs});
    console.log(`seed=${seed} n=${g.teamSize} team0=${g.score[0]} team1=${g.score[1]} (${g.reason})`);
    if(g.score[0]>g.score[1])t0++; else if(g.score[1]>g.score[0])t1++; else d++;
    A.kill();B.kill();
  }
  console.log(`py(team0) vs py(team1): ${t0}-${t1}-${d}`);
})();
