'use strict';
/* Replay r2-g1 exactly up to decision frame F0, then substitute our agent's
 * decisions while the opponent keeps its recorded inputs.  Used to A/B the
 * fatal close-range sequence: old (DUEL_KEEP=0) must reproduce the loss.
 * usage: node dev/branch_test.js <gid> <F0> [--env K=V,...]
 */
const fs=require('fs'), zlib=require('zlib'), path=require('path');
const {spawn}=require('child_process'); const readline=require('readline');
const sim=require('../simulation.js');
const ROOT=path.resolve(__dirname,'..');
const BASE='D:/extraProj/AIBattle/duel/arena/control/run-20261025-233938';
const load=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const parseEnv=s=>{const e={};if(!s)return e;for(const kv of s.split(',')){const i=kv.indexOf('=');if(i>0)e[kv.slice(0,i).trim()]=kv.slice(i+1).trim();}return e;};
async function main(){
  const gid=process.argv[2]||'r2-g1', F0=parseInt(process.argv[3]||'2091');
  let envArg=null; for(let i=4;i<process.argv.length;i++) if(process.argv[i]==='--env') envArg=process.argv[i+1];
  const d=load(path.join(BASE,gid+'.json.gz')); const ours=d.seats.indexOf('deepseek-flash');
  const g=sim.createMatch({id:gid+'-br',seed:d.seed,players:d.seats.map(s=>({name:s}))});
  const proc=spawn(process.env.PYTHON||'python',['agent.py'],{cwd:ROOT,env:Object.assign({},process.env,parseEnv(envArg)),stdio:['pipe','pipe','pipe'],windowsHide:true});
  const rl=readline.createInterface({input:proc.stdout}); let pending=null;
  rl.on('line',l=>{if(!pending)return;const p=pending;pending=null;try{p.resolve(JSON.parse(l));}catch(e){p.reject(e);}});
  const ask=s=>new Promise((res,rej)=>{pending={resolve:res,reject:rej};proc.stdin.write(JSON.stringify(s)+'\n');});
  let branch=null, minSepAfter=Infinity, hit=null, sepTrace=[];
  try{
    for(const w of d.windows){
      if(g.status!=='playing')break;
      const snap=sim.snapshot(g,ours);
      const ans=await ask(snap);
      const acting = g.frame>=F0;
      const mine = acting ? ans.inputs : w.inputs[ours];
      if(acting && branch===null){branch={frame:g.frame,agent:ans.inputs,recorded:w.inputs[ours]};}
      if(acting && JSON.stringify(ans.inputs)!==JSON.stringify(w.inputs[ours]) && branch && branch.firstDiff===undefined) branch.firstDiff=g.frame;
      const pair=[]; pair[ours]=mine; pair[1-ours]=w.inputs[1-ours];
      sim.advanceWindow(g,pair);
      for(let f=0;f<3;f++){
        const me=g.players[ours],op=g.players[1-ours];
        const sep=Math.hypot(me.x-op.x,me.y-op.y);
        if(acting && sep<minSepAfter)minSepAfter=sep;
        if(acting)sepTrace.push({frame:g.frame-2+f,sep:+sep.toFixed(3)});
      }
      if(g.status==='finished')break;
    }
  }finally{proc.stdin.end();proc.kill();}
  const me=g.players[ours],op=g.players[1-ours];
  console.log(JSON.stringify({gid,F0,env:envArg||'(default)',status:g.status,winner:g.winner,
    endFrame:g.frame,simSeconds:+(g.frame*.05).toFixed(2),branchFrame:branch&&branch.frame,
    branchFirstDiff:branch&&branch.firstDiff,minSepAfter:+minSepAfter.toFixed(3),
    alive:[me.alive,op.alive],reason:g.reason,
    sepTrace:sepTrace.filter(x=>x.frame>=F0).slice(0,30)},null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
