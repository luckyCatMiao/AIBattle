'use strict';
const { runMatch, PyAgent, sim } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:d;};
(async()=>{
  const seed=Number(arg('seed',1)), swap=arg('swap','0')==='1';
  const A=new PyAgent(PY,'agent.py',ROOT,'A');
  const f=async v=>bots[arg('b','botKeeper')](v);
  const me=swap?1:0;
  const players=[{name:'A',kind:'api'},{name:'B',kind:'api'}];
  const g=sim.createMatch({id:'m',players,seed});
  let wi=0; const log=[];
  while(g.status==='playing'&&wi<220){
    const v0=sim.view(g,0), v1=sim.view(g,1);
    const w0=swap?await f(v0):JSON.parse(await A.ask(v0)).inputs;
    const w1=swap?JSON.parse(await A.ask(v1)).inputs:await f(v1);
    log.push({f:g.frame, bx:g.ball.x, by:g.ball.y, owner:g.ball.owner, s:[...g.score],
              mine:g.units.filter(u=>u.team===me).map(u=>[u.index,Math.round(u.x),Math.round(u.y)]),
              opps:g.units.filter(u=>u.team!==me).map(u=>[u.index,Math.round(u.x),Math.round(u.y)])});
    sim.advanceWindow(g,[sim.submitWindow(g,0,w0),sim.submitWindow(g,1,w1)]);
    wi++;
  }
  console.log(`seed=${seed} n=${g.teamSize} score=${g.score}`);
  for(const e of g.events.filter(e=>e.type==='goal')){
    console.log(`GOAL frame=${e.frame} by team ${e.team} score=${e.score}`);
    for(const l of log.filter(l=>l.f>=e.frame-40&&l.f<=e.frame)) console.log(`   f=${l.f} ball=(${l.bx.toFixed(1)},${l.by.toFixed(1)}) owner=${l.owner} mine=${JSON.stringify(l.mine)} opps=${JSON.stringify(l.opps)}`);
  }
  A.kill();
})();
