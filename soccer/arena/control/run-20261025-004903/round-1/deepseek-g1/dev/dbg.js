'use strict';
const { runMatch, PyAgent } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:d;};
(async()=>{
  const seed=Number(arg('seed',24)), swap=arg('swap','0')==='1';
  const A=new PyAgent(PY,'agent.py',ROOT,'A');
  const f=async v=>bots[arg('b','botSmart')](v);
  const g=await runMatch({seed, agentA: swap?f:async v=>JSON.parse(await A.ask(v)).inputs, agentB: swap?async v=>JSON.parse(await A.ask(v)).inputs:f});
  console.log('score',g.score,'stats',JSON.stringify(g.stats));
  const lines=A.err.split('\n').filter(l=>l.startsWith('W'));
  console.log('lines',lines.length);
  console.log(lines.slice(0,50).join('\n'));
  A.kill();
})();
