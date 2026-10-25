'use strict';
const S=require('./simulation'),{Driver,simulate}=require('./agent'),Old=require('./agent-r2').Driver;
const n=+(process.argv[2]||100),opts=JSON.parse(process.argv[3]||'{"plan":true}'),mode=process.argv[4]||'old',start=+(process.argv[5]||0);
let stats={n,wins:0,finished:0,sum:0,max:0,off:0,collisions:0,maxMs:0,misses:0,failures:[]};
for(let k=start;k<start+n;k++){
 const seed=Math.imul(k+9071,2654435761)>>>0,team=k%2;
 const g=S.createMatch({seed,players:[{name:'us',kind:'api'},{name:'self-test',kind:'api'}]});
 const d=new Driver(S.view(g,team).track,opts), b=new Old(S.view(g,1-team).track,{plan:true});
 while(g.status==='playing'){
  const t=performance.now(),w=d.window(S.view(g,team)).inputs;
  stats.maxMs=Math.max(stats.maxMs,performance.now()-t);
  let other;
  if(mode==='solo')other=Array.from({length:20},()=>[{}]);
  else if(mode==='weave'){
   const c={...g.cars[1-team]};other=[];
   for(let i=0;i<20;i++){
    const u=b.control(c,{frame:g.frame+i,look:10,drift:true,on:3,offset:2.4*Math.sin(g.frame/13)});other.push([u]);
    if(g.countdown<=i)simulate({track:g.track},c,u);
   }
  }else other=b.window(S.view(g,1-team)).inputs;
  for(let i=0;i<20&&g.status==='playing';i++){
   g.cars[team].held=w[i][0];g.cars[1-team].held=other[i][0];S.step(g);
   if(g.cars[team].offRoad)stats.off++;
   const c=g.cars[team],s=d.near(c).s,behind=(s-c.nextCp*d.length/12+d.length)%d.length;
   if(behind>g.track.checkpoints[c.nextCp].radius+1&&behind<d.length/2)stats.misses++;
  }
 }
 const c=g.cars[team];stats.wins+=g.winner===team;stats.collisions+=c.collisions;
 if(c.finished){stats.finished++;stats.sum+=c.finishTime;stats.max=Math.max(stats.max,c.finishTime);}
 else stats.failures.push({seed,team,lap:c.lap,cp:c.nextCp,progress:c.progress});
 console.log(JSON.stringify({seed,team,win:g.winner===team,time:c.finishTime,lap:c.lap,cp:c.nextCp,collisions:c.collisions}));
}
stats.mean=stats.sum/stats.finished;console.log(JSON.stringify(stats));
