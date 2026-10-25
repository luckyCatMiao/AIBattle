'use strict';
const { runMatch, PyAgent, sim } = require('./arena.js');
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
(async()=>{
  const seed=Number(process.argv[2]||1);
  const A=new PyAgent(PY,'agent.py',ROOT,'A'), B=new PyAgent(PY,'agent.py',ROOT,'B');
  const players=[{name:'A',kind:'api'},{name:'B',kind:'api'}];
  const g=sim.createMatch({id:'m',players,seed});
  let wi=0;
  const log=[];
  while(g.status==='playing'&&wi<220){
    const v0=sim.view(g,0), v1=sim.view(g,1);
    const w0=JSON.parse(await A.ask(v0)).inputs, w1=JSON.parse(await B.ask(v1)).inputs;
    log.push({wi, frame:g.frame, ball:{x:g.ball.x,y:g.ball.y}, owner:g.ball.owner, score:[...g.score]});
    sim.advanceWindow(g,[sim.submitWindow(g,0,w0),sim.submitWindow(g,1,w1)]);
    wi++;
  }
  console.log(`seed=${seed} n=${g.teamSize} score=${g.score}`);
  for(const e of g.events){ if(e.type==='goal'){ console.log(`GOAL t=${e.t} team=${e.team} scorer=${e.scorer} score=${e.score}`); } }
  // 打印进球前后各窗口的球位置
  const goals=g.events.filter(e=>e.type==='goal');
  for(const e of goals){
    const near=log.filter(l=>Math.abs(l.frame-e.frame)<45);
    console.log('--- around goal frame',e.frame);
    for(const l of near) console.log(`   f=${l.frame} ball=(${l.ball.x.toFixed(1)},${l.ball.y.toFixed(1)}) owner=${l.owner} score=${l.score}`);
  }
  A.kill();B.kill();
})();
