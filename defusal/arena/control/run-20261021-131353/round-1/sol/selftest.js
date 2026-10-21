'use strict';
const sim = require('./simulation');
const {spawn} = require('child_process');
const readline = require('readline');
const fs = require('fs');
class Controller {
  constructor(style) {
    this.p = spawn('python3',['-u','agent.py',style],{cwd:__dirname});
    this.pending=[];
    this.maxMs=0;
    readline.createInterface({input:this.p.stdout}).on('line',line=>{
      const task=this.pending.shift();
      if(task) {this.maxMs=Math.max(this.maxMs,Date.now()-task.start);task.resolve(JSON.parse(line));}
    });
    this.p.stderr.on('data',d=>process.stderr.write(d));
    this.p.on('exit',code=>{for(const t of this.pending)t.reject(Error('agent exited '+code));});
  }
  act(o) { return new Promise((resolve,reject)=>{this.pending.push({resolve,reject,start:Date.now()});this.p.stdin.write(JSON.stringify(o)+'\n');}); }
  close() {this.p.kill();}
}
async function match(seed,style0,style1) {
 const cs=[new Controller(style0),new Controller(style1)];
 const g=sim.createMatch({seed,players:[{name:style0,kind:'api'},{name:style1,kind:'api'}]});
 let windows=0;
 const start=Date.now();
 while(g.status==='playing' && windows<850) {
   const results=await Promise.all(cs.map((c,i)=>c.act(sim.view(g,i))));
   if(g.phase==='buy') results.forEach((r,i)=>sim.submitBuys(g,i,r.buys));
   else {
    const ws=results.map((r,i)=>{
     if(r.inputs.length!==20 || r.inputs.some(f=>f.length!==5))throw Error('bad shape');
     return sim.submitWindow(g,i,r.inputs);
    });
    sim.advanceWindow(g,ws);windows++;
   }
 }
 const out={seed,styles:[style0,style1],score:g.roundWins,status:g.status,windows,maxMs:cs.map(c=>c.maxMs),elapsedMs:Date.now()-start,rounds:g.roundLog.map(r=>({round:r.round,winner:r.winnerTeam,reason:r.reason,seconds:r.frames/20,alive:r.units.filter(u=>u.alive).map(u=>u.team)}))};
 cs.forEach(c=>c.close());
 console.log(JSON.stringify(out));
 return out;
}
(async()=>{
 const count=Number(process.argv[2]||3),base=Number(process.argv[3]||1),style=process.argv[4]||'plain';
 const results=[];
 for(let s=base;s<base+count;s++)results.push(await match(s,process.argv[5]==='reverse'?style:'main',process.argv[5]==='reverse'?'main':style));
 fs.writeFileSync('test_results_'+style+'_'+base+(process.argv[5]==='reverse'?'_reverse':'')+'.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
