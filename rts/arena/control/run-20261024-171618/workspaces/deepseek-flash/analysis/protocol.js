const {spawn}=require('child_process');
const R=require('../rules.js');
const {makeSol}=require('./solbot.js');
const readline=require('readline');

function runGame(agentSeat, solCfg, maxT){
  return new Promise((resolve)=>{
    const child=spawn(process.execPath,['agent.js'],{cwd:require('path').resolve(__dirname,'..')});
    const rl=readline.createInterface({input:child.stdout});
    const lines=[];
    let waiting=null;
    rl.on('line',(l)=>{lines.push(l); if(waiting){const w=waiting;waiting=null;w();}});
    let stderr='';
    child.stderr.on('data',d=>{stderr+=d.toString();});
    const ask=(obs)=>new Promise((res)=>{
      waiting=()=>{const l=lines.shift();res(l);};
      child.stdin.write(JSON.stringify(obs)+'\n');
    });
    const m=R.createMatch({id:'sub',players:[{name:'a'},{name:'b'}],seed:1});
    R.command(m,0,{type:'start'});
    const sol=makeSol(solCfg||{});
    let lastErrors=[[],[]];
    const times=[];
    (async()=>{
      while(m.status==='playing'&&m.now<maxT){
        const obs=JSON.parse(JSON.stringify(R.snapshot(m,agentSeat)));
        obs.lastErrors=lastErrors[agentSeat];
        const t0=Date.now();
        let resp=null;
        try{resp=JSON.parse(await ask(obs));}catch(e){resp={commands:[]};}
        times.push(Date.now()-t0);
        const acmds=Array.isArray(resp.commands)?resp.commands.slice(0,10):[];
        const scmds=(sol(R.snapshot(m,1-agentSeat))||[]).slice(0,10);
        const cmds=agentSeat===0?[acmds,scmds]:[scmds,acmds];
        lastErrors=[[],[]];
        for(let p=0;p<2;p++)for(const c of cmds[p]){try{R.command(m,p,c);}catch(e){lastErrors[p].push(e.message);}}
        for(let k=0;k<20;k++)R.step(m);
      }
      child.stdin.end();child.kill();
      resolve({winner:m.winner,reason:m.reason,duration:m.now,scores:m.players.map(p=>R.score(m,p)),
        maxMs:Math.max(...times),avgMs:(times.reduce((a,b)=>a+b,0)/times.length),n:times.length,stderr:stderr.slice(0,300)});
    })();
  });
}
(async()=>{
  for(const seat of [0,1]){
    const r=await runGame(seat,{},600);
    const win=r.winner===seat;
    console.log('agentSeat',seat,win?'WIN':'LOSS',JSON.stringify({t:+r.duration.toFixed(1),reason:r.reason,scores:r.scores,maxMs:r.maxMs,avgMs:+r.avgMs.toFixed(2),n:r.n}));
    if(r.stderr)console.log('  STDERR:',r.stderr);
  }
})();
