'use strict';
const sim=require('./simulation'),cp=require('child_process'),rl=require('readline'),{performance}=require('perf_hooks');
(async()=>{
 const seat=Number(process.argv[2]||0),entry=require('./entry.json'),opp=require(process.argv[3]||'./agent-previous').makeAgent();
 const child=cp.spawn(entry.command[0],entry.command.slice(1),{cwd:__dirname,stdio:['pipe','pipe','inherit']});
 const lines=rl.createInterface({input:child.stdout})[Symbol.asyncIterator]();
 const g=sim.createMatch({players:[0,1].map(i=>({kind:'api',hero:i===seat?entry.hero:(process.argv[4]||'druid')}))});sim.command(g,0,{type:'start'});
 let count=0,maxMs=0,maxCommands=0,errors=[{},{}];
 while(g.status==='playing'){
  const t=performance.now();child.stdin.write(JSON.stringify(sim.snapshot(g,seat))+'\n');
  let timer;const response=await Promise.race([lines.next(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('5 second deadline')),5000);})]);clearTimeout(timer);
  if(response.done)throw Error('unexpected EOF');const a=JSON.parse(response.value);maxMs=Math.max(maxMs,performance.now()-t);
  if(!Array.isArray(a.commands)||a.commands.length>20)throw Error('invalid commands');maxCommands=Math.max(maxCommands,a.commands.length);
  const b=opp(JSON.parse(JSON.stringify(sim.snapshot(g,1-seat))));
  for(const [o,cs]of [[seat,a.commands],[1-seat,b.commands]])for(const c of cs)try{sim.command(g,o,c)}catch(e){errors[o][e.message]=(errors[o][e.message]||0)+1;}
  for(let k=0;k<5&&g.status==='playing';k++)sim.step(g);count++;
 }
 child.stdin.end();console.log(JSON.stringify({seat,candidateHash:require('crypto').createHash('sha256').update(require('fs').readFileSync(require.resolve('./agent'))).digest('hex'),opponent:process.argv[3]||'./agent-previous',winner:g.winner,win:g.winner===seat,time:g.now,reason:g.reason,decisions:count,maxMs,maxCommands,errors,score:g.players.map(p=>sim.score(g,p))},null,2));
})().catch(e=>{process.stderr.write(e.stack+'\n');process.exit(1);});
