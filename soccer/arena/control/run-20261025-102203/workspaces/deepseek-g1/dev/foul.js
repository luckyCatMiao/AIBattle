'use strict';
const { PyAgent, sim } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:d;};
(async()=>{
  const seed=Number(arg('seed',24)), swap=arg('swap','0')==='1', b=arg('b','botBlock');
  const A=new PyAgent(PY,'agent.py',ROOT,'A');
  const f=async v=>bots[b](v);
  const me=swap?1:0;
  const g=sim.createMatch({id:'m',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
  let wi=0, seen=new Set(), fouls=[];
  while(g.status==='playing'&&wi<220){
    const v0=sim.view(g,0), v1=sim.view(g,1);
    const prev=v0.units.filter(u=>u.team===me).map(u=>({id:u.id,x:u.x,y:u.y,index:u.index}));
    const prevBall={x:v0.ball.x,y:v0.ball.y,owner:v0.ball.owner};
    const w0=swap?await f(v0):JSON.parse(await A.ask(v0)).inputs;
    const w1=swap?JSON.parse(await A.ask(v1)).inputs:await f(v1);
    sim.advanceWindow(g,[sim.submitWindow(g,0,w0),sim.submitWindow(g,1,w1)]);
    for(const e of g.events){ if(e.type==='foul'&&!seen.has(e.id)){seen.add(e.id);
      if(e.team===me){ const p=prev.find(u=>u.id===e.unit)||{};
        fouls.push({f:e.frame,unit:e.unit,prev,ball:prevBall,nx:e.x,ny:e.y}); } } }
    wi++;
  }
  console.log(`seed=${seed} n=${g.teamSize} me=team${me} score=${g.score} myFouls=${g.stats[me].fouls}`);
  for(const f of fouls.slice(0,8)) console.log(`foul f=${f.f} unit=${f.unit} prevPos=(${f.prev.x},${f.prev.y}) ball=(${f.ball.x.toFixed(1)},${f.ball.y.toFixed(1)}) owner=${f.ball.owner} -> moved to (${f.nx},${f.ny})  myunits=${JSON.stringify(f.prev.map(u=>[u.index,u.x,u.y]))}`);
  A.kill();
})();
