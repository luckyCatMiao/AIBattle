'use strict';
const { runMatch } = require('./arena.js');
const bots = require('./bots.js');
const name = process.argv[2] || 'botKeeper';
(async()=>{
  let t0=0,t1=0,d=0;
  for(const seed of [1,2,3,4,5,6,7,8,9,10]){
    const f = async v => bots[name](v);
    const g=await runMatch({seed, agentA:f, agentB:f});
    console.log(`seed=${seed} n=${g.teamSize} team0=${g.score[0]} team1=${g.score[1]}`);
    if(g.score[0]>g.score[1])t0++; else if(g.score[1]>g.score[0])t1++; else d++;
  }
  console.log(`${name} mirror: team0 ${t0} - team1 ${t1} - draw ${d}`);
})();
