'use strict';
const S=require('./simulation'),{Driver}=require('./agent');
let stats={games:200,wins:0,finished:0,off:0,collisions:0,sumTime:0,maxTime:0,failures:[]};
for(let k=0;k<stats.games;k++){
 const seed=Math.imul(k+7001,2246822519)>>>0,team=k%2;
 const g=S.createMatch({seed,players:[{name:'us',kind:'api'},{name:'weaving',kind:'api'}]});
 const d=new Driver(g.track,{plan:true}),b=new Driver(g.track,{look:10,drift:true,on:3});
 while(g.status==='playing'){
  // A legal weaving opponent deliberately changes lateral target every window.
  const other={...g.cars[1-team]},out=[];
  for(let i=0;i<20;i++){
   const u=b.control(other,{frame:g.frame+i,offset:2.2*Math.sin(g.frame/15)});out.push([u]);
   if(g.countdown<=i)require('./agent').simulate({track:g.track},other,u);
  }
  const ours=d.window(S.view(g,team)).inputs;
  for(let i=0;i<20&&g.status==='playing';i++){
   g.cars[team].held=ours[i][0];g.cars[1-team].held=out[i][0];S.step(g);
   stats.off+=g.cars[team].offRoad;
  }
 }
 const c=g.cars[team];stats.wins+=g.winner===team;stats.collisions+=c.collisions;
 if(c.finished){stats.finished++;stats.sumTime+=c.finishTime;stats.maxTime=Math.max(stats.maxTime,c.finishTime);}
 else stats.failures.push({seed,team,lap:c.lap,cp:c.nextCp});
}
stats.meanTime=stats.sumTime/stats.finished;console.log(JSON.stringify(stats));
