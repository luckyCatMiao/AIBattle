'use strict';
const sim=require('./simulation');
const {DIRS}=require('./catalog');
const {Agent,move,bulletStep}=require('./agent');
const fs=require('fs');
function rng(seed) {return ()=> {seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};}
class Opponent {
 constructor(type,seed) {this.type=type;this.random=rng(seed);this.dir='U';}
 act(o) {
  const p=o.players[o.yourPlayer], e=o.players[1-o.yourPlayer];
  let bullets=o.bullets.filter(b=>b.owner!==o.yourPlayer).map(b=>[b.x,b.y,b.vx,b.vy]);
  const future=[];for(let i=0;i<12;i++){bullets=bullets.map(bulletStep);future.push(bullets);}
  if(o.frame%30===0)this.dir=Object.keys(DIRS)[1+Math.floor(this.random()*8)];
  let best='N',score=-Infinity;
  for(const [d,v] of Object.entries(DIRS)) {
    let x=p.x,y=p.y,s=0;
    for(let t=0;t<12;t++) {
      [x,y]=move(x,y,...v);
      for(const b of future[t]) {
        const dis=Math.hypot(x-b[0],y-b[1]);
        if(dis<.72)s-=10000/(t+1);
        s-=Math.exp(-dis*dis/3)*.5;
      }
    }
    const de=Math.hypot(x-e.x,y-e.y);
    if(this.type==='rush')s-=de*.8;
    if(this.type==='kite')s-=Math.abs(de-12)*.2;
    if(this.type==='wander')s+=d===this.dir?.5:0;
    if(this.type==='turret')s+=d==='N'?1:0;
    if(this.type==='orbit') {
      const a=o.frame*.012+o.yourPlayer*Math.PI;
      s-=Math.hypot(x-(20+14*Math.cos(a)),y-(15+10*Math.sin(a)))*.2;
    }
    s+=this.random()*.0001;
    if(s>score){score=s;best=d;}
  }
  let [x,y]=move(p.x,p.y,...DIRS[best]);
  const aim=sim.vecToDir(e.x-x,e.y-y);
  return {inputs:Array.from({length:3},()=>({dir:best,aim,fire:true}))};
 }
}
const types=process.argv.slice(2).length?process.argv.slice(2):['turret','rush','kite','wander','orbit'];
const results=[];
for(const type of types)for(let seat=0;seat<2;seat++) {
 const g=sim.createMatch({id:`${type}-${seat}`,players:[{name:'A'},{name:'B'}]});
 const a=new Agent(),b=type==='self'?new Agent():new Opponent(type,123+seat);
 let maxMS=0,totalMS=0,n=0;
 while(g.status==='playing') {
  const start=performance.now(); const aw=a.act(sim.view(g,seat));
  const elapsed=performance.now()-start;maxMS=Math.max(maxMS,elapsed);totalMS+=elapsed;n++;
  const bw=b.act(sim.view(g,1-seat));
  const ws=[];ws[seat]=sim.submitWindow(g,seat,aw.inputs);ws[1-seat]=sim.submitWindow(g,1-seat,bw.inputs);
  sim.advanceWindow(g,ws);
 }
 const r={type,seat,winner:g.winner,outcome:g.winner===null?'draw':g.winner===seat?'win':'loss',seconds:+g.now.toFixed(2),shots:g.players.map(p=>p.shots),maxMS:+maxMS.toFixed(2),meanMS:+(totalMS/n).toFixed(2)};
 results.push(r);console.log(JSON.stringify(r));
 fs.writeFileSync('test_results.json',JSON.stringify(results,null,2));
}
