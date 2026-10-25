// 综合评测: node bench.js <myTeam> [reps]
const path=require('path');
const {makeProc,playMatch}=require('./harness.js');
const WS=path.resolve(__dirname,'..');
const PY=process.env.PY||'python';
const myTeam=(process.argv[2]||'vex,kestrel,aegis').split(',');
const REP=parseInt(process.argv[3]||'1',10);
const CONC=parseInt(process.env.CONC||'8',10);
const TEAMS=[['torv','nyx','sable'],['kestrel','vex','aegis'],['aegis','torv','nyx'],
             ['nyx','sable','vex'],['sable','kestrel','torv'],['vex','nyx','torv']];
const OPPS=[['rush','bot.py','rush'],['turtle','bot.py','turtle'],['zone','bot.py','zone'],
            ['random','bot.py','random'],['smart','bot.py','smart'],['old','old_agent.py']];
async function one(seed,opp,oppTeam,swap){
  const a=makeProc(PY,[path.join(WS,'agent.py')],WS);
  const b=makeProc(PY,[path.join(__dirname,opp[1]),...opp.slice(2)],__dirname);
  let r;
  try{ r = swap? await playMatch(b,a,oppTeam,myTeam,seed) : await playMatch(a,b,myTeam,oppTeam,seed); }
  finally{ a.kill(); b.kill(); }
  const g=r.g; const myIdx=swap?1:0;
  return {win:(g.winner===myIdx)?1:(g.winner===null?0.5:0), err:r.errors, frames:g.frames,
          wins:g.players[myIdx].wins, dmg:g.players[myIdx].damageDealt, taken:g.players[1-myIdx].damageDealt};
}
async function main(){
  const jobs=[];
  for(const opp of OPPS) for(const t of TEAMS) for(let rep=0;rep<REP;rep++) for(const swap of [false,true])
    jobs.push({opp,team:t,swap,seed:100+rep*7});
  let idx=0; const res={};
  async function worker(){
    while(idx<jobs.length){
      const j=jobs[idx++];
      const r=await one(j.seed,j.opp,j.team,j.swap);
      const k=j.opp[0];
      res[k]=res[k]||{w:0,t:0,f:0,err:0};
      res[k].w+=r.win; res[k].t++; res[k].f+=r.frames; if(r.err)res[k].err++;
    }
  }
  await Promise.all(Array.from({length:CONC},worker));
  let tw=0,tt=0;
  for(const opp of OPPS){ const r=res[opp[0]]; tw+=r.w; tt+=r.t;
    console.log(`${opp[0].padEnd(10)} ${r.w}/${r.t} ${(100*r.w/r.t).toFixed(0)}%  avgF=${Math.round(r.f/r.t)} err=${r.err}`); }
  console.log(`TOTAL ${tw}/${tt} = ${(100*tw/tt).toFixed(1)}%`);
}
main();
