'use strict';
// Subprocess agent vs the exact recorded command stream of the frozen opponent.
const {spawn}=require('child_process');
const path=require('path');
const readline=require('readline');
const SIM=require(path.resolve(__dirname,'..','simulation.js'));
const {loadReplay}=require('./replay_opponent.js');
const {ReplayOpponent}=require('./replay_opponent.js');
function run(file,ourSeat,solSeat,{maxSeconds=500,overlay=0}={}){
 return new Promise(res=>{
  const j=loadReplay(file);
  const hs=j.frames[0].units.filter(u=>u.hero);
  const g=SIM.createMatch({id:'p',seed:1,players:[{name:'A',kind:'api',hero:hs.find(u=>u.owner===0).type},{name:'B',kind:'api',hero:hs.find(u=>u.owner===1).type}]});
  SIM.command(g,0,{type:'start'});
  const opp=new ReplayOpponent(j,solSeat,{defenseOverlay:overlay});
  const child=spawn(process.execPath,[path.resolve(__dirname,'..','agent.js')],{stdio:['pipe','pipe','pipe']});
  const rl=readline.createInterface({input:child.stdout});
  let pending=null;const q=[];
  rl.on('line',l=>{if(pending){const p=pending;pending=null;p(l);}else q.push(l);});
  const next=()=>new Promise(r=>{if(q.length)r(q.shift());else pending=r;});
  let bad=0,maxLat=0,maxCmds=0,stderr='';child.stderr.on('data',d=>stderr+=d);
  (async()=>{
   while(g.status==='playing'&&g.now<maxSeconds){
    const snaps=[],cmds=[[],[]];
    for(const o of [0,1]){const s=SIM.snapshot(g,o);s.decisionSeconds=.25;s.maxCommands=20;s.lastErrors=[];snaps[o]=s;}
    cmds[solSeat]=opp.decide(snaps[solSeat],ourSeat);
    const t0=Date.now();
    child.stdin.write(JSON.stringify(snaps[ourSeat])+'\n');
    const line=await next();maxLat=Math.max(maxLat,Date.now()-t0);
    let out=null;try{out=JSON.parse(line);}catch(e){bad++;}
    if(!out||!Array.isArray(out.commands)){bad++;out={commands:[]};}
    maxCmds=Math.max(maxCmds,out.commands.length);
    cmds[ourSeat]=out.commands.slice(0,20);
    for(const o of [0,1])for(const c of cmds[o])try{SIM.command(g,o,c);}catch(e){}
    for(let i=0;i<5;i++)SIM.step(g);
   }
   child.stdin.end();child.kill();
   res({file:path.basename(file),win:g.winner===ourSeat,winner:g.winner,dur:+g.now.toFixed(1),bad,maxLat,maxCmds,stderr:stderr.slice(0,200)});
  })().catch(e=>res({file,error:String(e)}));
 });
}
if(require.main===module){
 (async()=>{
  for(const [f,our,sol] of [['public-r2-g1.json.gz',0,1],['public-r2-g2.json.gz',1,0]]){
   for(const ov of [0,1000])console.log(JSON.stringify(await run(f,our,sol,{overlay:ov})));
  }
 })();
}
