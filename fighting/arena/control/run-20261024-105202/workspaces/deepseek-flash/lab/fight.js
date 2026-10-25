// 对抗测试台: node fight.js <myTeam> <oppSpec> <oppTeam> <n> [startSeed]
// oppSpec:  "py:bot.py:smart" | "py:old_agent.py" | "py:agent.py"
const path=require('path');
const {makeProc,playMatch}=require('./harness.js');
const WS=path.resolve(__dirname,'..');
const PY=process.env.PY||'python';

function mkOpp(spec){
  const parts=spec.split(':');
  if(parts[0]==='py') return makeProc(PY,[path.join(__dirname,parts[1]),...parts.slice(2)],__dirname);
  throw new Error('bad opp '+spec);
}
async function one(seed,teamA,oppSpec,teamB,swap){
  const a=makeProc(PY,[path.join(WS,'agent.py')],WS);
  const b=mkOpp(oppSpec);
  a.proc.stderr.on('data',d=>process.stderr.write('AERR:'+d));
  b.proc.stderr.on('data',d=>process.stderr.write('BERR:'+d));
  let r;
  try{
    // seat swap: 我在席位 1（后手方）
    if (swap){ r=await playMatch(b,a,teamB,teamA,seed); r.swap=true; }
    else r=await playMatch(a,b,teamA,teamB,seed);
  } finally { a.kill(); b.kill(); }
  const g=r.g;
  const myIdx = r.swap? 1:0;
  return {winner:g.winner, myIdx, win: (g.winner===myIdx)?1:(g.winner===null?0.5:0),
    errors:r.errors, frames:g.frames, rounds:g.roundLog.map(x=>`${x.winnerChar}(${x.winnerHp})>${x.loserChar}(${x.loserHp}):${x.frames}f`),
    wins:g.players[myIdx].wins, dmg:g.players[myIdx].damageDealt, taken:g.players[1-myIdx].damageDealt};
}
async function main(){
  const teamA=(process.argv[2]||'vex,kestrel,aegis').split(',');
  const oppSpec=process.argv[3]||'py:bot.py:smart';
  const teamB=(process.argv[4]||'torv,nyx,sable').split(',');
  const N=parseInt(process.argv[5]||'4',10);
  const s0=parseInt(process.argv[6]||'100',10);
  let w=0,t=0,err=0;
  const lines=[];
  for(let i=0;i<N;i++){
    const swap = i%2===1;
    const r=await one(s0+i*97,teamA,oppSpec,teamB,swap);
    t++; if(r.errors)err++;
    w+=r.win;
    lines.push(`${r.win===1?'W':(r.win===0.5?'D':'L')} seed=${s0+i*97}${swap?'(swap)':''} ${r.wins}-${r.frames}f dmg${r.dmg}/${r.taken} ${r.rounds.join(' ')}`);
  }
  lines.forEach(l=>console.log(l));
  console.log(`VS ${oppSpec}: ${w}/${t} = ${(100*w/t).toFixed(1)}%  errors=${err}`);
}
main();
