const path=process.argv[2]; const sim=require('./simulation.js');
const {spawn}=require('child_process'); const readline=require('readline');
function agent(cmd){const p=spawn(cmd[0],cmd.slice(1),{cwd:path});const rl=readline.createInterface({input:p.stdout});const q=[];rl.on('line',l=>q.shift()(l));p.stderr.on('data',d=>process.stderr.write(d));
 return {ask:o=>new Promise(r=>{q.push(r);p.stdin.write(JSON.stringify(o)+'\n')}),kill:()=>p.kill()};}
function randomAgent(){return {ask:async()=>JSON.stringify({inputs:Array.from({length:20},()=>({dir:'NUDLR'[Math.floor(Math.random()*5)],btn:Math.random()<.1?'BOMB':null}))}),kill(){}}}
(async()=>{const seed=+process.argv[3]||1; const mode=process.argv[4]||'self';
 const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
 const A=agent(['python','agent.py']); const B=mode==='self'?agent(['python','agent.py']):randomAgent();
 let rnd=g.round, maxT=0;
 while(g.status==='playing'){const t0=Date.now();
  const [ra,rb]=await Promise.all([A.ask(sim.snapshot(g,0)),B.ask(sim.snapshot(g,1))]);maxT=Math.max(maxT,Date.now()-t0);
  if(process.env.DUMP&&g.roundFrames==+process.env.DUMP)require('fs').writeFileSync('dump.json',JSON.stringify(sim.snapshot(g,0)));if(process.env.TR){const f=g.fighters;console.log(g.roundFrames,JSON.parse(ra).note,f[0].x,f[0].y,f[0].bombs,f[0].blast,'|',JSON.parse(rb).note,f[1].x,f[1].y, g.tiles.filter(v=>v==2).length)}
  const ia=sim.submitWindow(g,0,JSON.parse(ra).inputs), ib=sim.submitWindow(g,1,JSON.parse(rb).inputs);
  sim.advanceWindow(g,[ia,ib]);
  if(g.round!==rnd||g.status!=='playing'){const L=g.roundLog[g.roundLog.length-1];console.log(JSON.stringify(L));rnd=g.round;}
 }
 console.log('final',g.players.map(p=>p.wins),'maxms',maxT);A.kill();B.kill();process.exit(0);})();
