'use strict';
/* 详细对局统计：node dev/analyze.js <botA> <botB> [seed] */
const path=require('path');
const sim=require('../engine.js');
const {rules}=require('../catalog.js');
const DT=1/rules.hz;

function load(p){
  const m=require(path.resolve(p));
  const b=typeof m==='function'?m():(m.decide?m:m.default&&m.default());
  return obs=>{
    const r=b.decide(obs);
    const arr=Array.isArray(r)?r:(r&&r.frames)?r.frames:(r&&r.inputs)?r.inputs:null;
    if(!arr) throw new Error('bad decision');
    return arr.slice(0,10).map(f=>{
      let o=Array.isArray(f)?f[0]:f; o=o||{};
      return {move:Math.max(-1,Math.min(1,Number(o.move)||0)),jump:!!o.jump,
        swing:(Number(o.swing)>0.1)?1:(Number(o.swing)<-0.1)?-1:0,
        charge:!!o.charge,sprint:!!o.sprint};
    });
  };
}

function play(decides,seed,names){
  const g=sim.createMatch({id:'an',seed,players:[{name:names[0],kind:'api'},{name:names[1],kind:'api'}]});
  const st=[0,1].map(()=>({swings:0,hits:0,jumps:0,smashes:0,runFrames:0,chargeFrames:0}));
  const points=[];
  let cur={server:g.server, start:0, st0:[100,100], hits:[0,0]};
  let prevSwing=[0,0], prevGround=[true,true], prevHits=[0,0];
  let w=0;
  while(g.status==='playing'&&w<520){
    const wins=[];
    for(let t=0;t<2;t++){
      const obs=sim.view(g,t); obs.yourPlayer=t;
      wins.push(decides[t](obs));
    }
    const subs=wins.map((win,t)=>sim.submitWindow(g,t,win));
    for(let i=0;i<10&&g.status==='playing';i++){
      for(let t=0;t<2;t++){ g.batsmen[t].held=subs[t][i][0]; g.batsmen[t].inputHistory.push(subs[t][i][0]); if(g.batsmen[t].inputHistory.length>8) g.batsmen[t].inputHistory.shift(); }
      const beforeEv=g.events.length;
      sim.step(g);
      for(let t=0;t<2;t++){
        const b=g.batsmen[t];
        if(prevSwing[t]===0&&b.swing>0) st[t].swings++;
        if(prevGround[t]&&!b.onGround&&b.vy>0) st[t].jumps++;
        if(prevHits[t]!==b.hits){ st[t].hits+=b.hits-prevHits[t]; }
        prevSwing[t]=b.swing; prevGround[t]=b.onGround; prevHits[t]=b.hits;
        if(Math.abs(b.vx)>3.2) st[t].runFrames++;
        if(b.held&&b.held.charge) st[t].chargeFrames++;
      }
      for(const e of g.events.slice(beforeEv)){
        if(e.type==='hit') st[e.team].hits2=(st[e.team].hits2||0)+1;
        if(e.type==='point'){
          points.push({server:cur.server,winner:e.team,rally:e.rally,land:e.x,reason:e.reason,
            duration:+(g.frame-cur.start)/20, staminaNow:[+g.batsmen[0].stamina.toFixed(1),+g.batsmen[1].stamina.toFixed(1)],
            startStamina:cur.st0, hits:[g.batsmen[0].hits-cur.hits[0],g.batsmen[1].hits-cur.hits[1]]});
        }
      }
    }
    if(g.phase==='serve'||g.phase==='point'){
      // 新一分开始于 beginServe；记录起点
      if(g.phase==='serve'&&cur.server!==g.server){ cur={server:g.server,start:g.frame,st0:[+g.batsmen[0].stamina.toFixed(1),+g.batsmen[1].stamina.toFixed(1)],hits:[g.batsmen[0].hits,g.batsmen[1].hits]}; }
      else if(g.phase==='serve'&&points.length&&points.length!==cur.pcount){ cur={server:g.server,start:g.frame,st0:[+g.batsmen[0].stamina.toFixed(1),+g.batsmen[1].stamina.toFixed(1)],hits:[g.batsmen[0].hits,g.batsmen[1].hits]}; }
      cur.pcount=points.length;
    }
    w++;
  }
  return {score:g.score.slice(),winner:g.winner,frames:g.frame,reason:g.reason,points,st};
}

if(require.main===module){
  const A=load(process.argv[2]||'./dev/bots/mine.js');
  const B=load(process.argv[3]||'./dev/bots/mine.js');
  const seed=parseInt(process.argv[4]||'1',10);
  const r=play([A,B],seed,['A','B']);
  console.log('SCORE',r.score.join(':'),'frames',r.frames,r.reason);
  const T=[0,1].map(t=>({swings:r.st[t].swings,hits:r.st[t].hits,whiffs:r.st[t].swings-r.st[t].hits,jumps:r.st[t].jumps,runFrames:r.st[t].runFrames}));
  console.log('STATS',JSON.stringify(T));
  const holds=[0,0],serves=[0,0],breaks=[0,0];
  for(const p of r.points){serves[p.server]++; if(p.winner===p.server)holds[p.server]++;else breaks[p.server]++;}
  console.log('SERVE holds',holds,'/',serves,'breaks',breaks);
  console.log('POINTS');
  for(const p of r.points) console.log(` srv${p.server} -> win${p.winner} rally${p.rally} ${p.duration}s stam[${p.staminaNow}] d${p.hits} ${p.reason}@${p.land}`);
}
module.exports={play,load};
