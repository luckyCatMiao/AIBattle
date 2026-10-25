const fs=require('fs');
const {runVsGhost}=require('./ghost.js');
const {makeAgent}=require('./agent3.js');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const cfg=JSON.parse(process.argv[2]||'{}');
let W=0,G=0;
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
  const rep=a.find(x=>x.id===id);
  const solSeat=rep.seats.indexOf('sol');
  const agentSeat=1-solSeat;
  for(const order of ['fwd','rev']){
    const pol=makeAgent(cfg);
    const r=runVsGhost(pol,rep,agentSeat,{maxT:600,order});
    const win=r.winner===agentSeat;
    if(win)W++;G++;
    console.log(id,'agentSeat',agentSeat,order,(win?'WIN ':'LOSS'),'t',r.duration.toFixed(0),'score',r.scores[agentSeat]+':'+r.scores[1-agentSeat],'reason',r.reason);
  }
}
console.log('TOTAL',W+'/'+G);
