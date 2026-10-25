'use strict';
const sim=require('./simulation'),A=require('./agent'),B=require('./test'),fs=require('fs');
let rows=[];
for(let n=1;n<=6;n++)for(let team=0;team<2;team++)for(let mode=0;mode<4;mode++){
 const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],teamSize:n});
 g.frame=200;g.tick=200;g.freeze=0;
 const sign=team===0?1:-1;
 const mirror=x=>team===0?x:44-x;
 for(const u of g.units){
   const ours=u.team===team;
   u.x=mirror(ours?12+u.index*1.4:26+u.index*1.2);
   u.y=6+u.index*14/Math.max(1,n-1);
 }
 const a=g.units.find(u=>u.team===team),b=g.units.find(u=>u.team!==team);
 if(mode===0){g.ball.x=mirror(24);g.ball.y=13;g.ball.vx=-sign*10;g.ball.vy=2;g.ball.owner=null;}
 if(mode===1){b.x=mirror(16);b.y=13;b.facing={x:-sign,y:0};a.x=mirror(12);a.y=13;g.ball.owner=b.id;g.ball.x=b.x-sign*.62;g.ball.y=13;}
 if(mode===2){a.x=mirror(25);a.y=13;g.ball.owner=a.id;g.ball.x=a.x+sign*.62;g.ball.y=13;b.x=mirror(29);b.y=13;}
 if(mode===3){a.x=mirror(3);a.y=13;g.ball.owner=null;g.ball.x=mirror(9);g.ball.y=11.5;g.ball.vx=-sign*14;g.ball.vy=0;}
 let result='none';
 for(let t=0;t<25;t++){
  let aa=A.decide(sim.view(g,team)).inputs,bb=B.baseline(sim.view(g,1-team),'swarm').inputs;
  sim.advanceWindow(g,team===0?[aa,bb]:[bb,aa]);
  if(g.score[0]+g.score[1]>0){result=g.score[team]>0?'scored':'conceded';break;}
 }
 rows.push({n,team,mode,result});
}
fs.writeFileSync('/workspace/r3_stress_results.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.reduce((a,r)=>(a[r.result]=(a[r.result]||0)+1,a),{})));
console.log(JSON.stringify(rows.filter(r=>r.result!=='scored')));
