'use strict';
// 记录逐窗口状态的本地对局工具（自测用）
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sim = require('/workspace/simulation.js');
const { teamSizeForSeed } = require('/workspace/catalog.js');
function parseArgs(argv){const a={};for(let i=2;i<argv.length;i+=2)a[argv[i].replace(/^--/,'')]=argv[i+1];return a;}
const args=parseArgs(process.argv);
const seed=Number(args.seed||1);
const teamSize=args.teamSize?Number(args.teamSize):teamSizeForSeed(seed);
const aCmd=(args.a||'python3 /workspace/agent.py').split(' ');
const bCmd=(args.b||'python3 /workspace/agents/baseline.py').split(' ');
const logDir=args.logdir||'/tmp/matchlogs';
fs.mkdirSync(logDir,{recursive:true});
function startAgent(cmd,tag){
  const p=spawn(cmd[0],cmd.slice(1),{stdio:['pipe','pipe','pipe']});
  p.stderr.pipe(fs.createWriteStream(path.join(logDir,tag+'.err')));
  let buf='';const waiters=[];
  p.stdout.on('data',d=>{buf+=d.toString();let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(waiters.length)waiters.shift()(line);}});
  p.on('exit',()=>{while(waiters.length)waiters.shift()(null);});
  return {p,ask(line,timeoutMs=5000){return new Promise(resolve=>{let done=false;const t=setTimeout(()=>{if(!done){done=true;resolve({timeout:true});}},timeoutMs);waiters.push(l=>{if(!done){done=true;clearTimeout(t);resolve(l==null?{eof:true}:{line:l});}});p.stdin.write(line+'\n');});},kill(){try{p.kill('SIGKILL');}catch(e){}}};
}
async function main(){
  const g=sim.createMatch({id:'trace',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed,teamSize});
  const A=startAgent(aCmd,'a'),B=startAgent(bCmd,'b');
  const states=[];let windows=0;
  try{
    while(g.status==='playing'&&windows<200){
      const views=[sim.view(g,0),sim.view(g,1)];
      const resps=await Promise.all([A.ask(JSON.stringify(views[0])),B.ask(JSON.stringify(views[1]))]);
      const frames=[];
      for(let t=0;t<2;t++){
        const r=resps[t]; if(!r||r.timeout||r.eof){frames.push(null);continue;}
        let obj;try{obj=JSON.parse(r.line);}catch(e){frames.push(null);continue;}
        try{frames.push(sim.submitWindow(g,t,obj.inputs));}catch(e){frames.push(null);}
      }
      if(!frames[0]||!frames[1]){g.status='finished';g.winner=frames[0]?1:0;g.reason='technical';break;}
      const before={frame:g.frame,score:[...g.score],half:g.half,
        ball:{x:g.ball.x,y:g.ball.y,vx:g.ball.vx,vy:g.ball.vy,owner:g.ball.owner},
        units:g.units.map(u=>({id:u.id,team:u.team,index:u.index,x:u.x,y:u.y,facing:{...u.facing},kickCd:u.kickCd,controlLock:u.controlLock,stealLock:u.stealLock}))};
      const inA=frames[0].map(f=>f.map(u=>({dir:u.dir,aim:u.aim,kick:u.kick})));
      sim.advanceWindow(g,frames);
      states.push({before,after_score:[...g.score],inputsA:inA,events:g.events.slice(-4)});
      windows++;
    }
  }finally{A.kill();B.kill();}
  console.log(JSON.stringify({seed,teamSize,status:g.status,winner:g.winner,reason:g.reason,score:g.score,stats:g.stats,windows,states,events:g.events}));
}
main().catch(e=>{console.error(e);process.exit(1);});
