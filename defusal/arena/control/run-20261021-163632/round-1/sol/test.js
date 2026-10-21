'use strict';
const sim=require('./simulation');
const {spawn}=require('child_process');
const fs=require('fs');
function client(command){
 const p=spawn('python3',command,{cwd:'/workspace',stdio:['pipe','pipe','inherit']});
 let buf='', pending=[];let maxMs=0,total=0,count=0;
 p.stdout.on('data',d=>{buf+=d;let n;while((n=buf.indexOf('\n'))>=0){let line=buf.slice(0,n);buf=buf.slice(n+1);let item=pending.shift();if(!item)throw Error('unexpected output');clearTimeout(item.timer);let ms=performance.now()-item.start;maxMs=Math.max(ms,maxMs);total+=ms;count++;try{item.resolve(JSON.parse(line));}catch(e){item.reject(e);}}});
 return {ask(o){return new Promise((resolve,reject)=>{let item={resolve,reject,start:performance.now()};item.timer=setTimeout(()=>reject(Error('agent exceeded 5 sec')),5000);pending.push(item);p.stdin.write(JSON.stringify(o)+'\n');});},close(){p.kill();},stats(){return {maxMs,meanMs:total/count,count};}};
}
async function match(seed,style,seat){
 let clients=style==='self'?[client(['agent.py']),client(['agent.py'])]:(seat===0?[client(['agent.py']),client(['baseline.py',style])]:[client(['baseline.py',style]),client(['agent.py'])]);
 let g=sim.createMatch({seed,players:[{name:'left',kind:'api'},{name:'right',kind:'api'}]});
 let rounds=[],windows=0;
 try{
 while(g.status==='playing'&&windows<1000){
  let actions=await Promise.all(clients.map((c,t)=>c.ask(sim.view(g,t))));
  if(g.phase==='buy'){
   sim.submitBuys(g,0,actions[0].buys);sim.submitBuys(g,1,actions[1].buys);
  }else{
   let ws=actions.map((a,t)=>sim.submitWindow(g,t,a.inputs));sim.advanceWindow(g,ws);windows++;
  }
  while(rounds.length<g.roundLog.length){let r=g.roundLog[rounds.length];rounds.push({round:r.round,winner:r.winnerTeam,reason:r.reason,seconds:r.frames/20,alive:r.units.filter(u=>u.alive).map(u=>u.team+':'+u.index)});}
  if(g.events.length>1200)g.events=g.events.slice(-300);
 }
 const result={seed,style,seat,wins:g.roundWins,winner:g.winner,rounds,windows,timing:clients.map(c=>c.stats())};
 console.log(JSON.stringify(result));return result;
 }finally{clients.forEach(c=>c.close());}
}
(async()=>{
 let seed=+(process.argv[2]||1),style=process.argv[3]||'turret',seat=+(process.argv[4]||0),count=+(process.argv[5]||1);
 let results=[];for(let i=0;i<count;i++)results.push(await match(seed+i,style,seat));
 fs.writeFileSync('/workspace/test_'+style+'_'+seed+'_'+seat+'.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
