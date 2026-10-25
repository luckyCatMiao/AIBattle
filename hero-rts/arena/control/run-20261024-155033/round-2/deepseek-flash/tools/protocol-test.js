// Drives agent.js as a real child process over stdin/stdout, lockstep, vs the sparring bot.
const {spawn}=require('child_process');
const path=require('path');
const {SIM}=require('./sim.js');
const {SolBot}=require('./solbot.js');
const readline=require('readline');

function runChild(agentSeat,{solOpts={},maxSeconds=300,hero='necromancer'}={}){
  return new Promise((resolve)=>{
    const heroA=agentSeat===0?hero:'druid',heroB=agentSeat===0?'druid':hero;
    const g=SIM.createMatch({id:'proto',seed:7,players:[{name:'A',kind:'api',hero:heroA},{name:'B',kind:'api',hero:heroB}]});
    SIM.command(g,0,{type:'start'});
    const solSeat=1-agentSeat;
    const sol=new SolBot(solOpts);
    const child=spawn(process.execPath,[path.resolve(__dirname,'..','agent.js')],{stdio:['pipe','pipe','pipe']});
    const rl=readline.createInterface({input:child.stdout});
    let resolveLine=null;
    const lines=[];
    rl.on('line',l=>{ if(resolveLine){const r=resolveLine;resolveLine=null;r(l);} else lines.push(l); });
    let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
    const nextLine=()=>new Promise(res=>{ if(lines.length)res(lines.shift()); else resolveLine=res; });
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    let maxLatency=0,decisions=0,errors=0,badLines=0;
    (async()=>{
      while(g.status==='playing'&&g.now<maxSeconds){
        // sol first (in-process), then agent via pipe
        if(solSeat===0){
          const st=SIM.snapshot(g,0);st.decisionSeconds=.25;st.maxCommands=20;st.lastErrors=[];
          for(const c of (sol.decide(st).commands||[]).slice(0,20)){try{SIM.command(g,0,c);}catch(e){errors++;}}
        }
        const st=SIM.snapshot(g,agentSeat);st.decisionSeconds=.25;st.maxCommands=20;st.lastErrors=[];
        const t0=Date.now();
        child.stdin.write(JSON.stringify(st)+'\n');
        const line=await nextLine();
        const lat=Date.now()-t0;maxLatency=Math.max(maxLatency,lat);
        let out=null;
        try{out=JSON.parse(line);}catch(e){badLines++;}
        if(!out||!Array.isArray(out.commands)){badLines++;out={commands:[]};}
        if(out.commands.length>20)badLines++;
        for(const c of out.commands.slice(0,20)){try{SIM.command(g,agentSeat,c);}catch(e){errors++;}}
        if(solSeat===1){
          const s2=SIM.snapshot(g,1);s2.decisionSeconds=.25;s2.maxCommands=20;s2.lastErrors=[];
          for(const c of (sol.decide(s2).commands||[]).slice(0,20)){try{SIM.command(g,1,c);}catch(e){errors++;}}
        }
        for(let i=0;i<5;i++)SIM.step(g);
        decisions++;
      }
      child.stdin.end();child.kill();
      resolve({win:g.winner===agentSeat,winner:g.winner,dur:g.now,decisions,maxLatencyMs:maxLatency,errors,badLines,stderr:stderr.slice(0,500)});
    })().catch(e=>resolve({error:String(e),stderr}));
  });
}
module.exports={runChild};
if(require.main===module){
  (async()=>{
    for(const seat of [0,1]){
      const r=await runChild(seat,{solOpts:{solr3:true,workerQueue:6},maxSeconds:300});
      console.log('seat',seat,JSON.stringify(r));
    }
  })();
}
