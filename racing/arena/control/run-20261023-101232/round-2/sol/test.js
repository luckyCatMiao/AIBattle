'use strict';
const S=require('./simulation'), {Driver}=require('./agent');
function run(seed,opts={}, opponent='idle',team=0) {
 const g=S.createMatch({seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
 const d=new Driver(g.track,opts), b=new Driver(g.track,opponent==='strong'?{look:12,drift:true,on:3,period:6}:opponent==='mirror'?{plan:true}:{look:6});
 let off=0,maxOff=0,span=0;
 while(g.status==='playing') {
  const w=d.window(S.view(g,team)).inputs;
  let other;
  if(opponent==='idle')other=Array.from({length:20},()=>[{}]);
  else other=b.window(S.view(g,1-team)).inputs;
  const windows=[];windows[team]=w;windows[1-team]=other;
  S.advanceWindow(g,windows);
  const c=g.cars[team];if(c.offRoad){off++;span++;maxOff=Math.max(maxOff,span);}else span=0;
 }
 const c=g.cars[team];
 return {seed,team,time:c.finishTime,lap:c.lap,cp:c.nextCp,progress:+c.progress.toFixed(1),off,maxOff,drift:+c.driftTime.toFixed(1),boosts:c.boosts,collisions:c.collisions,win:g.winner===team};
}
if(require.main===module){
 const count=+(process.argv[2]||20), opts=JSON.parse(process.argv[3]||'{}'),opp=process.argv[4]||'idle';
 let results=[];for(let seed=1;seed<=count;seed++){const r=run(seed,opts,opp,seed%2);results.push(r);console.log(JSON.stringify(r));}
 const finished=results.filter(r=>r.time);
 console.log(JSON.stringify({summary:true,n:count,finished:finished.length,mean:finished.reduce((s,r)=>s+r.time,0)/finished.length,max:Math.max(...finished.map(r=>r.time)),off:results.reduce((s,r)=>s+r.off,0),wins:results.filter(r=>r.win).length}));
}
module.exports={run};
