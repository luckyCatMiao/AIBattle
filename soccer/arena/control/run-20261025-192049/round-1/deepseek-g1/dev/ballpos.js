'use strict';
const { runMatch, PyAgent, sim } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:d;};
(async()=>{
  const seed=Number(arg('seed',8)), swap=arg('swap','0')==='1', b=arg('b','botBlock');
  const A=new PyAgent(PY,'agent.py',ROOT,'A');
  const f=async v=>bots[b](v);
  const me=swap?1:0;
  const players=[{name:'A',kind:'api'},{name:'B',kind:'api'}];
  const g=sim.createMatch({id:'m',players,seed});
  let wi=0; const rows=[];
  while(g.status==='playing'&&wi<220){
    const v0=sim.view(g,0), v1=sim.view(g,1);
    const w0=swap?await f(v0):JSON.parse(await A.ask(v0)).inputs;
    const w1=swap?JSON.parse(await A.ask(v1)).inputs:await f(v1);
    const own=g.ball.owner;
    const mineOwn = own && own[1]===String(me);
    rows.push([g.frame, g.ball.x.toFixed(0), g.ball.y.toFixed(0), own?(mineOwn?'ME':'OP'):'--', g.units.filter(u=>u.team===me).map(u=>Math.round(u.x*sgnFix(me))).join('/')]);
    sim.advanceWindow(g,[sim.submitWindow(g,0,w0),sim.submitWindow(g,1,w1)]);
    wi++;
  }
  function sgnFix(m){return m===0?1:-1;}
  console.log(`seed=${seed} n=${g.teamSize} me=team${me} score=${g.score}`);
  // 统计我方控球时的球 x（换算成"距对方门线距离"）
  let my=0,op=0,loose=0; const adv=[];
  for(const r of rows){ if(r[3]==='ME'){my++; adv.push(me===0?43-r[1]:r[1]-1);} else if(r[3]==='OP')op++; else loose++; }
  adv.sort((a,b)=>a-b);
  console.log(`windows=${rows.length} 我控球=${my} 对方控球=${op} 松球=${loose}`);
  console.log('我方控球时距对方门线距离(格) 分位: min',adv[0],'p25',adv[Math.floor(adv.length*0.25)],'中位',adv[Math.floor(adv.length*0.5)],'p75',adv[Math.floor(adv.length*0.75)]);
  console.log(rows.slice(0,40).map(r=>`${r[0]}:(${r[1]},${r[2]})${r[3]} me@${r[4]}`).join('\n'));
  A.kill();
})();
