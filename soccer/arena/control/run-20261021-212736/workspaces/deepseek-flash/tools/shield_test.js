'use strict';
const sim = require('/workspace/simulation.js');
const DIRV = [[1,0],[Math.SQRT1_2,Math.SQRT1_2],[0,1],[-Math.SQRT1_2,Math.SQRT1_2],[-1,0],[-Math.SQRT1_2,-Math.SQRT1_2],[0,-1],[Math.SQRT1_2,-Math.SQRT1_2]];
function mk(n) {
  const g = sim.createMatch({ id:'shield', players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}], teamSize:n });
  g.freeze = 0;
  const A = g.units.filter(u=>u.team===0), B = g.units.filter(u=>u.team===1);
  A[0].x=22; A[0].y=13; A[0].facing={x:1,y:0};
  A.slice(1).forEach((u,i)=>{ u.x=8; u.y=6+i*3; });
  B.forEach((u,i)=>{ u.x=24+i*0.9; u.y=13+(i%2?0.5:-0.5); });
  g.ball.x=22.62; g.ball.y=13; g.ball.owner=A[0].id; g.ball.vx=0; g.ball.vy=0;
  return g;
}
function dirName(dx,dy){const a=Math.atan2(dy,dx);const k=Math.round(a/(Math.PI/4));return ['R','DR','D','DL','L','UL','U','UR'][(k+8)%8];}
// owner: aim exactly away from nearest opponent (weighted centroid), move given dir
function run(n, ownerMove, chaserCount) {
  const g=mk(n);
  const A0=g.units.find(u=>u.id==='t0u0');
  let lost=0, first=-1;
  for(let f=0; f<600 && g.status==='playing'; f++){
    const b=g.ball;
    for(const u of g.units){
      if(u.team===0){ u.held={dir:'N',aim:null,kick:false}; continue; }
      // chasers: move toward ball
      const dx=b.x-u.x, dy=b.y-u.y;
      u.held={dir:dirName(dx,dy),aim:null,kick:false};
    }
    // owner shields away from weighted nearest chasers (only closest matters for steal)
    const opps=g.units.filter(u=>u.team===1).slice(0,chaserCount);
    let ax=0,ay=0;
    for(const o of opps){ const d=Math.hypot(o.x-A0.x,o.y-A0.y); const w=1/(d*d+0.01); ax+=(o.x-A0.x)*w; ay+=(o.y-A0.y)*w; }
    const l=Math.hypot(ax,ay)||1;
    const aim=Math.atan2(-ay/l,-ax/l)*180/Math.PI;
    A0.held={dir:ownerMove,aim:aim,kick:false};
    sim.step(g);
    if(g.ball.owner!=='t0u0'){lost++; if(first<0)first=f;}
  }
  return {lost,first,owner:g.ball.owner,pos:[A0.x.toFixed(2),A0.y.toFixed(2)],ball:[g.ball.x.toFixed(2),g.ball.y.toFixed(2)]};
}
for(const n of [2,3,6]){
  for(const mv of ['N','R','L','D','U','DR','UL']){
    for(const cc of [1,2,3]){
      const r=run(n,mv,cc);
      console.log(`n=${n} move=${mv} chasers=${cc} lost=${r.lost} first=${r.first} owner=${r.owner} A=${r.pos} ball=${r.ball}`);
    }
  }
}
