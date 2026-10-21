'use strict';
const sim=require('./simulation');
const readline=require('readline');
let g;
const rl=readline.createInterface({input:process.stdin});
rl.on('line',line=>{
 try {
  const m=JSON.parse(line);
  if(m.op==='new') g=sim.createMatch({seed:m.seed,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
  if(m.op==='step') {
   if(g.phase==='buy') for(let t=0;t<2;t++) sim.submitBuys(g,t,m.actions[t].buys||[]);
   else if(g.phase==='live') sim.advanceWindow(g,m.actions.map((a,t)=>sim.submitWindow(g,t,a.inputs)));
  }
  console.log(JSON.stringify({views:[sim.view(g,0),sim.view(g,1)],log:g.roundLog,status:g.status,wins:g.roundWins}));
 } catch(e){console.log(JSON.stringify({error:e.stack}));}
});
