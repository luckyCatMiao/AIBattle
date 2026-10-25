'use strict';
/* 双向调试：打印两队每次决策的 debug + 事件（只看前几个窗口） */
const sim=require('../engine.js');const path=require('path');
function load(p){const m=require(path.resolve(p));const b=typeof m==='function'?m():m;return o=>b.decide(o);}
const A=load(process.argv[2]||'./dev/variants/s6_autoB.js');
const B=load(process.argv[3]||'./dev/variants/s6_autoB.js');
const g=sim.createMatch({id:'d',seed:1,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
const maxW=parseInt(process.argv[4]||'8',10);
for(let w=0;w<maxW&&g.status==='playing';w++){
  const wins=[];
  for(let t=0;t<2;t++){
    const o=sim.view(g,t);o.yourPlayer=t;
    const r=(t===0?A:B)(o);wins.push(r.frames);
    if(r.debug&&!['rest','idle','serveWait'].includes(r.debug.mode)) console.log(' f'+o.frame,'T'+t,JSON.stringify(r.debug));
  }
  const before=g.events.length;
  sim.advanceWindow(g,[sim.submitWindow(g,0,wins[0]),sim.submitWindow(g,1,wins[1])]);
  for(const e of g.events.slice(before)) if(e.type!=='ready') console.log('  EV',JSON.stringify(e));
}
