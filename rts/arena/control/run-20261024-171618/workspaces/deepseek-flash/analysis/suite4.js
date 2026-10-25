const fs=require('fs');
const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent5.js');
const {runVsGhost}=require('./ghost.js');
const replays=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const GHOSTS=['r2-g1','r2-g2','r1-g1','r1-g2'];
// reduced representative box around fitted sol parameters
const BOX=[];
for(const kiteLen of [48,50,52])for(const fireWindow of [0.8,0.9])for(const pushAllNodes of [true,false])BOX.push({kiteLen,fireWindow,engage:186,upReserve:40,pushAllNodes});
const HARD=[
  ['smart',{rebuildWorkers:true,repair:true,focus:'lowhp'}],
  ['aggr',{fireWindow:0.5}],
  ['eng210',{engage:210}],
  ['kite65',{kiteLen:65}],
];
function evalCfg(cfg,opts){
  opts=opts||{};
  let wins=0,games=0;const det=[];
  const play=(sc,tag)=>{
    for(const swap of [0,1]){
      const A=makeAgent(cfg),B=makeSol(sc);
      const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
      const as=swap?1:0;const win=r.winner===as;
      if(win)wins++;games++;
      if(!win&&opts.verbose)det.push(`${tag}:s${as}:L@${r.duration.toFixed(0)}(${r.scores[as]}:${r.scores[1-as]})`);
    }
  };
  for(const sc of BOX)play(sc,'box');
  for(const [n,sc] of HARD)play(sc,n);
  for(const id of GHOSTS){
    const rep=replays.find(x=>x.id===id);
    const solSeat=rep.seats.indexOf('sol');const as=1-solSeat;
    const r=runVsGhost(makeAgent(cfg),rep,as,{maxT:600});
    const win=r.winner===as;
    if(win)wins++;games++;
    if(!win&&opts.verbose)det.push(`ghost-${id}:s${as}:L@${r.duration.toFixed(0)}(${r.scores[as]}:${r.scores[1-as]})`);
  }
  for(const swap of [0,1]){
    const A=makeAgent(cfg),B=makeAgent(cfg);
    const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
    const as=swap?1:0;const win=r.winner===as;
    if(win)wins++;games++;
    if(!win&&opts.verbose)det.push(`mirror:s${as}:L@${r.duration.toFixed(0)}(${r.scores[as]}:${r.scores[1-as]})`);
  }
  return {wins,games,det};
}
module.exports={evalCfg,BOX};
if(require.main===module){
  const cfgs=JSON.parse(process.argv[2]||'[{}]');
  for(const cfg of cfgs){const r=evalCfg(cfg,{verbose:true});console.log(JSON.stringify(cfg).slice(0,100),r.wins+'/'+r.games,(100*r.wins/r.games).toFixed(1)+'%','|',r.det.join(' '));}
}
