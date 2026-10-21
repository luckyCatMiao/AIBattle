'use strict';
const sim = require('./simulation');
const {spawn} = require('child_process');
const readline = require('readline');

function controller(style) {
  const p=spawn('python3',['/workspace/agent.py',style],{stdio:['pipe','pipe','inherit']});
  const rl=readline.createInterface({input:p.stdout});
  const waiting=[];
  rl.on('line',l=>{const q=waiting.shift(); if(q) q(JSON.parse(l));});
  return {ask(o){return new Promise(resolve=>{waiting.push(resolve);p.stdin.write(JSON.stringify(o)+'\n');});},close(){p.kill();}};
}
async function match(seed,enemy,seat) {
  const g=sim.createMatch({seed,players:[{name:'p0',kind:'api'},{name:'p1',kind:'api'}]});
  const bots=[controller(seat===0?'main':enemy),controller(seat===1?'main':enemy)];
  let n=0,maxms=0,elapsed=0;
  try {
    while(g.status==='playing' && n<850) {
      const obs=[sim.view(g,0),sim.view(g,1)];
      const start=performance.now();
      const out=await Promise.all(bots.map((b,i)=>b.ask(obs[i])));
      const ms=performance.now()-start;
      maxms=Math.max(maxms,ms);elapsed+=ms;
      if(g.phase==='buy') {
        sim.submitBuys(g,0,out[0].buys);sim.submitBuys(g,1,out[1].buys);
      } else {
        sim.advanceWindow(g,[sim.submitWindow(g,0,out[0].inputs),sim.submitWindow(g,1,out[1].inputs)]);
      }
      n++;
    }
    const result={seed,enemy,seat,wins:g.roundWins,finished:g.status==='finished',windows:n,maxms:Math.round(maxms),meanms:Math.round(elapsed/n),rounds:g.roundLog.map(r=>({winner:r.winnerTeam,reason:r.reason,seconds:r.frames/20,kills:r.units.filter(u=>u.team===seat).reduce((s,u)=>s+u.kills,0)}))};
    console.log(JSON.stringify(result));
    return result;
  } finally {bots.forEach(b=>b.close());}
}
(async()=>{
 const seeds=(process.argv[2]||'1').split(',').map(Number);
 const styles=(process.argv[3]||'camp,rush').split(',');
 for(const seed of seeds)for(const style of styles)for(const seat of [0,1])await match(seed,style,seat);
})().catch(e=>{console.error(e);process.exit(1);});
