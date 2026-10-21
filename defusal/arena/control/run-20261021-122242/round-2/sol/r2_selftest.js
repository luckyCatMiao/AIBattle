'use strict';
const sim = require('./simulation');
const {spawn} = require('child_process');
const readline = require('readline');
const fs = require('fs');
class Client {
  constructor(style) {
    this.proc = spawn('python3', [style === 'old' ? 'round1_agent.py' : 'agent.py', style === 'old' ? 'main' : style], {cwd: __dirname, stdio:['pipe','pipe','inherit']});
    this.lines = readline.createInterface({input:this.proc.stdout});
    this.waiters = [];
    this.lines.on('line', line => { const fn=this.waiters.shift(); if(fn) fn(JSON.parse(line)); });
    this.maxMs=0; this.calls=0;
  }
  async ask(o) {
    const begin=performance.now();
    const result=await new Promise(resolve => {this.waiters.push(resolve); this.proc.stdin.write(JSON.stringify(o)+'\n');});
    this.maxMs=Math.max(this.maxMs,performance.now()-begin); this.calls++;
    if(o.phase==='live') {
      if(!Array.isArray(result.inputs)||result.inputs.length!==20||result.inputs.some(f=>!Array.isArray(f)||f.length!==5)) throw Error('bad shape');
    }
    return result;
  }
  close(){this.proc.kill();}
}
async function match(style, seat, seed) {
  const a=new Client('main'), b=style.startsWith('ind')?new (require('./baseline'))(style):new Client(style);
  const clients=seat===0?[a,b]:[b,a];
  const g=sim.createMatch({players:[{name:seat===0?'main':style,kind:'api'},{name:seat===1?'main':style,kind:'api'}],seed});
  let windows=0;
  while(g.status==='playing') {
    const obs=[sim.view(g,0),sim.view(g,1)];
    const acts=await Promise.all(clients.map((c,i)=>c.ask(obs[i])));
    if(g.phase==='buy') { for(let i=0;i<2;i++) sim.submitBuys(g,i,acts[i].buys); }
    else {sim.advanceWindow(g,acts.map((x,i)=>sim.submitWindow(g,i,x.inputs))); windows++;}
    if(windows>1000) throw Error('stuck');
  }
  const result={style,seat,seed,score:[g.roundWins[seat],g.roundWins[1-seat]],winner:g.winner===null?'draw':g.winner===seat?'main':style,maxMs:Math.round(a.maxMs),calls:a.calls,
    rounds:g.roundLog.map(r=>({round:r.round,win:r.winnerTeam===seat,reason:r.reason,seconds:r.frames/20,alive:r.units.filter(u=>u.team===seat&&u.alive).length}))};
  a.close();b.close();
  return result;
}
(async()=>{
  const results=[];
  const styles=process.argv.slice(2).length?process.argv.slice(2):['rushA','rushB','mid','cheap'];
  for(const style of styles) for(const seat of [0,1]) {
    const r=await match(style,seat,Number(process.env.TEST_SEED||13)+seat);results.push(r);console.log(JSON.stringify(r));
    fs.writeFileSync(__dirname+'/r2_results.json',JSON.stringify(results,null,2));
  }
})().catch(e=>{console.error(e);process.exit(1);});
