'use strict';
const readline=require('readline');
const sim=require('./simulation');
let g;
readline.createInterface({input:process.stdin}).on('line',line=>{
 try {
 const q=JSON.parse(line);
 if(q.op==='new') g=sim.createMatch({players:[{name:'candidate',kind:'api'},{name:'baseline',kind:'api'}],seed:q.seed||1});
 if(q.op==='buy') {sim.submitBuys(g,0,q.actions[0].buys);sim.submitBuys(g,1,q.actions[1].buys);}
 if(q.op==='step') sim.advanceWindow(g,q.actions.map((a,i)=>sim.submitWindow(g,i,a.inputs)));
 if(q.op==='scenario') {
   sim.submitBuys(g,0,[]);sim.submitBuys(g,1,[]);
   for(const change of q.units||[]) Object.assign(g.units.find(u=>u.id===change.id),change);
   if(q.bomb) Object.assign(g.bomb,q.bomb);
 }
 console.log(JSON.stringify({views:[sim.view(g,0),sim.view(g,1)],log:g.roundLog,status:g.status,wins:g.roundWins,events:g.events.slice(-30)}));
 } catch(e) {console.log(JSON.stringify({error:e.stack}));}
});
