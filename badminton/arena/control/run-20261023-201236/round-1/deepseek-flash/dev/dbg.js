'use strict';
const sim=require('../engine.js');
const brain=require('../brain.js');
const N={move:0,jump:false,swing:0,charge:false,sprint:false};
const fr=n=>Array.from({length:n},()=>({...N}));
function mk(lbl){
  return {decide(obs){
    const r=brain.decide(obs);
    if(lbl&&r.debug&&r.debug.mode!=='rest'){
      console.log(lbl,'f'+obs.frame,'phase',obs.phase,'rally',obs.rally,'last',obs.shuttle&&obs.shuttle.lastTeam,'srv',obs.server,JSON.stringify(r.debug));
    }
    return r.frames;
  }};
}
const A=mk('A'),B=mk('B');
const g=sim.createMatch({id:'d',seed:1,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
for(let w=0;w<8 && g.status==='playing';w++){
  const wins=[];
  for(let t=0;t<2;t++){
    const o=sim.view(g,t);o.yourPlayer=t;
    wins.push(A.decide(o));
    if(t===1){/* swap logger */}
  }
  // use separate loggers
  const wins2=[];
  for(let t=0;t<2;t++){const o=sim.view(g,t);o.yourPlayer=t;const r=brain.decide(o);wins2.push(r.frames);
    if(r.debug.mode!=='rest'&&r.debug.mode!=='idle') console.log(' f'+o.frame,'team'+t,'mode',r.debug.mode,JSON.stringify(r.debug));}
  const before=g.events.length;
  sim.advanceWindow(g,[sim.submitWindow(g,0,wins2[0]),sim.submitWindow(g,1,wins2[1])]);
  for(const e of g.events.slice(before)) console.log('  EV',JSON.stringify(e));
  console.log(' frame now',g.frame,'score',g.score,'shuttle',JSON.stringify(g.shuttle));
  if(g.score[0]+g.score[1]>=2) break;
}
