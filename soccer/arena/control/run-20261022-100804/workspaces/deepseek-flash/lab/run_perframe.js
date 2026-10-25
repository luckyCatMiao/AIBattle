'use strict';
// Per-frame recorder: same protocol as tools/harness.js but dumps every physics frame.
const path=require('path'); const {spawn}=require('child_process'); const readline=require('readline');
const sim=require('/workspace/simulation.js');
class ProcAgent{
  constructor(name,cmd){this.name=name;this.child=spawn(cmd[0],cmd.slice(1),{stdio:['pipe','pipe','pipe']});
    this.rl=readline.createInterface({input:this.child.stdout});this.queue=[];this.waiters=[];
    this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.queue.push(l);});
    this.child.stderr.on('data',d=>{if(process.env.V)process.stderr.write('['+name+']'+d);});
    this.child.on('exit',()=>{while(this.waiters.length)this.waiters.shift()(null);});}
  request(obs){return new Promise((res,rej)=>{const line=JSON.stringify(obs);this.child.stdin.write(line+'\n');
    const t=setTimeout(()=>rej(new Error(this.name+' timeout')),5000);
    const take=l=>{clearTimeout(t); if(l==null)return rej(new Error(this.name+' died')); try{res(JSON.parse(l));}catch(e){rej(e);}};
    if(this.queue.length)take(this.queue.shift());else this.waiters.push(take);});}
  close(){try{this.child.stdin.end();this.child.kill();}catch(e){}}
}
async function main(){
  const o={p0:'python3 /workspace/agent.py',p1:'python3 /workspace/tools/noisy_agent.py 1 4',seed:9001,n:3,maxWin:200,out:null};
  const a=process.argv.slice(2); for(let i=0;i<a.length;i++){const k=a[i];
    if(k==='--p0')o.p0=a[++i]; else if(k==='--p1')o.p1=a[++i]; else if(k==='--seed')o.seed=+a[++i];
    else if(k==='--n')o.n=+a[++i]; else if(k==='--out')o.out=a[++i];}
  const agents=[new ProcAgent('p0',o.p0.split(' ')),new ProcAgent('p1',o.p1.split(' '))];
  const g=sim.createMatch({id:'p',seed:o.seed,players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}],teamSize:o.n});
  const fs=require('fs'); const out=[];
  let win=0;
  while(g.status==='playing'&&win<o.maxWin){
    const v0=sim.view(g,0),v1=sim.view(g,1);
    const [r0,r1]=await Promise.all([agents[0].request(v0),agents[1].request(v1)]);
    const w0=sim.submitWindow(g,0,r0.inputs),w1=sim.submitWindow(g,1,r1.inputs);
    for(let i=0;i<20&&g.status==='playing';i++){
      for(const u of g.units){const fr=(u.team===0?w0:w1)[i];u.held=fr[u.index];u.inputHistory.push(u.held);if(u.inputHistory.length>8)u.inputHistory.shift();}
      const before={score:[...g.score]};
      sim.step(g);
      out.push({f:g.frame,half:g.half,score:[...g.score],ball:{x:g.ball.x,y:g.ball.y,vx:g.ball.vx,vy:g.ball.vy,owner:g.ball.owner},
        units:g.units.map(u=>({id:u.id,x:u.x,y:u.y,fx:u.facing.x,fy:u.facing.y,hasBall:g.ball.owner===u.id})),
        events:g.events.filter(e=>e.frame===g.frame).map(e=>({type:e.type,team:e.team,unit:e.unit,text:e.text}))});
    }
    win++;
  }
  agents.forEach(x=>x.close());
  const data={seed:o.seed,n:o.n,frames:out,result:g.score,winner:g.winner,reason:g.reason,stats:g.stats};
  if(o.out)fs.writeFileSync(o.out,JSON.stringify(data)); else console.log(JSON.stringify({result:g.score,winner:g.winner,reason:g.reason,frames:out.length}));
}
main().catch(e=>{console.error(e);process.exit(1);});
