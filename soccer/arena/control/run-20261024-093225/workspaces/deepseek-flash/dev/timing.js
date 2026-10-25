'use strict';
const { PyAgent } = require('./arena.js');
const fs=require('fs'), path=require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
(async()=>{
  const ex=JSON.parse(fs.readFileSync(path.join(ROOT,'example.json'),'utf8'));
  delete ex.exampleWindow; delete ex.catalog;
  const ag=new PyAgent(PY,'agent.py',ROOT,'t');
  let worst=0,sum=0;
  for(let i=0;i<60;i++){
    const t=Date.now();
    const r=await ag.ask(ex);
    const dt=Date.now()-t; worst=Math.max(worst,dt); sum+=dt;
    if(!r) throw new Error('no output');
    JSON.parse(r);
  }
  console.log('per-window ms: max',worst,'avg',(sum/60).toFixed(1));
  ag.kill();
})();
