// Full-game subprocess test: the shipped agent is driven exactly as the arena
// drives it (one JSON line in, one JSON line out per 0.25s decision).
const {spawn}=require('child_process');
const path=require('path');
const {SIM}=require('./sim.js');
const {SolClone}=require('./solclone.js');
const readline=require('readline');

function runChild(agentSeat,{cloneOpts={},maxSeconds=400,hero='necromancer'}={}){
  return new Promise((resolve)=>{
    const heroA=agentSeat===0?hero:'druid',heroB=agentSeat===0?'druid':hero;
    const g=SIM.createMatch({id:'proto',seed:7,players:[{name:'A',kind:'api',hero:heroA},{name:'B',kind:'api',hero:heroB}]});
    SIM.command(g,0,{type:'start'});
    const other=new SolClone(cloneOpts);
    const child=spawn(process.execPath,[path.resolve(__dirname,'..','agent.js')],{stdio:['pipe','pipe','pipe']});
    const rl=readline.createInterface({input:child.stdout});
    let pending=null;const queue=[];
    rl.on('line',l=>{if(pending){const p=pending;pending=null;p(l);}else queue.push(l);});
    let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
    const nextLine=()=>new Promise(res=>{if(queue.length)res(queue.shift());else pending=res;});
    let maxLatency=0,decisions=0,rejected=0,badLines=0,maxCmds=0;
    (async()=>{
      while(g.status==='playing'&&g.now<maxSeconds){
        const otherSeat=1-agentSeat;
        const st=SIM.snapshot(g,otherSeat);st.decisionSeconds=.25;st.maxCommands=20;st.lastErrors=[];
        for(const c of (other.decide(st).commands||[]).slice(0,20))try{SIM.command(g,otherSeat,c);}catch(e){}
        const snap=SIM.snapshot(g,agentSeat);snap.decisionSeconds=.25;snap.maxCommands=20;snap.lastErrors=[];
        const t0=Date.now();
        child.stdin.write(JSON.stringify(snap)+'\n');
        const line=await nextLine();
        maxLatency=Math.max(maxLatency,Date.now()-t0);
        let out=null;try{out=JSON.parse(line);}catch(e){badLines++;}
        if(!out||!Array.isArray(out.commands)){badLines++;out={commands:[]};}
        if(out.commands.length>20)badLines++;
        maxCmds=Math.max(maxCmds,out.commands.length);
        for(const c of out.commands.slice(0,20))try{SIM.command(g,agentSeat,c);}catch(e){rejected++;}
        for(let i=0;i<5;i++)SIM.step(g);
        decisions++;
      }
      child.stdin.end();child.kill();
      resolve({win:g.winner===agentSeat,winner:g.winner,dur:+g.now.toFixed(1),decisions,maxLatencyMs:maxLatency,rejected,badLines,maxCmds,stderr:stderr.slice(0,300)});
    })().catch(e=>resolve({error:String(e),stderr}));
  });
}
module.exports={runChild};
if(require.main===module){
  (async()=>{
    for(const seat of [0,1]){
      const r=await runChild(seat,{cloneOpts:{}});
      console.log('seat',seat,JSON.stringify(r));
    }
  })();
}
