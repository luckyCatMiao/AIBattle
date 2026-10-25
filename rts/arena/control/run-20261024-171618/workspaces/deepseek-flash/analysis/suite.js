const fs=require('fs');
const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent5.js');
const {runVsGhost}=require('./ghost.js');
const replays=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));

const CLONES=[
  ['base',{}],
  ['smart',{rebuildWorkers:true,repair:true,focus:'lowhp'}],
  ['aggr',{fireWindow:0.5}],
  ['eng210',{engage:210}],
];
const GHOSTS=['r2-g1','r2-g2','r1-g1','r1-g2'];

function evalCfg(cfg,verbose){
  let wins=0,games=0;const det=[];
  for(const [name,sc] of CLONES){
    for(const swap of [0,1]){
      const A=makeAgent(cfg),B=makeSol(sc);
      const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
      const as=swap?1:0;const win=r.winner===as;
      if(win)wins++;games++;
      if(verbose||!win)det.push(`${name}:s${as}:${win?'W':'L'}@${r.duration.toFixed(0)}(${r.scores[as]}:${r.scores[1-as]})`);
    }
  }
  for(const id of GHOSTS){
    const rep=replays.find(x=>x.id===id);
    const solSeat=rep.seats.indexOf('sol');const as=1-solSeat;
    const r=runVsGhost(makeAgent(cfg),rep,as,{maxT:600});
    const win=r.winner===as;
    if(win)wins++;games++;
    if(verbose||!win)det.push(`ghost-${id}:s${as}:${win?'W':'L'}@${r.duration.toFixed(0)}(${r.scores[as]}:${r.scores[1-as]})`);
  }
  return {wins,games,det};
}
module.exports={evalCfg};
if(require.main===module){
  const cfgs=JSON.parse(process.argv[2]||'[{}]');
  let tot=0,all=0;
  for(const cfg of cfgs){
    const r=evalCfg(cfg,true);
    tot+=r.wins;all+=r.games;
    console.log(JSON.stringify(cfg).slice(0,110).padEnd(50),r.wins+'/'+r.games,'|',r.det.join(' '));
  }
  console.log('TOTAL',tot+'/'+all,(100*tot/all).toFixed(1)+'%');
}
