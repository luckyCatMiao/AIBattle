'use strict';
// 射门价值图：射手在 (sx,sy)，门将在 (kx,ky)（模拟 Sol：门线内 2.3 格、居中），
// 找出最优落点并统计「静止门将」下能否进球；再按窗口反应帧数判断可否被补救。
const sim=require('../simulation.js'); const {rules,W}=require('../catalog');
function shotResult(sx,sy,kx,ky,ty,team){
  const g=sim.createMatch({id:'x',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:1,teamSize:3});
  g.freeze=0; g.ball.owner=null;
  const sh=g.units.find(u=>u.team===team&&u.index===1);
  const gk=g.units.find(u=>u.team===1-team&&u.index===0);
  sh.x=sx; sh.y=sy; gk.x=kx; gk.y=ky;
  // 其余人挪到场外角落
  for(const u of g.units){ if(u!==sh&&u!==gk){ u.x=(u.team===0?0.6:W-0.6); u.y=(u.index%2?0.6:25.4);} }
  const gx=team===1?1.0:W-1.0;
  const dx=gx-sx,dy=ty-sy,l=Math.hypot(dx,dy),ux=dx/l,uy=dy/l;
  const off=rules.unitRadius+rules.ballRadius+0.03;
  g.ball.x=sx+ux*off; g.ball.y=sy+uy*off;
  if(sim.circleHitsWall(g,g.ball.x,g.ball.y,rules.ballRadius)){g.ball.x=sx;g.ball.y=sy;}
  g.ball.vx=ux*rules.kickPower; g.ball.vy=uy*rules.kickPower;
  g.ball.lastTouch=sh.id; g.ball.lastTeam=team;
  const neutral=g.units.map(()=>({dir:'N',aim:null,kick:false}));
  for(let i=0;i<90&&g.status==='playing';i++){ for(const u of g.units)u.held=neutral[g.units.indexOf(u)]; sim.step(g); if(g.score[team]>0)return true; }
  return g.score[team]>0;
}
function flightFrames(dist){ let d=0,v=11; for(let f=1;f<400;f++){ d+=v*0.05; v*=0.978; if(d>=dist)return f;} return 400; }
const kx=W-1-2.3, ky=12.8;   // Sol 式门将（守右门 x=43）
let rows=[];
for(let sy=2; sy<=24; sy+=2){
  let row='';
  for(let sx=8; sx<=42; sx+=1){
    // 跳过对方禁区（team0 进攻右门，禁区 x>=34 且 6<=y<=20）
    const inBox = sx>=34 && sy>=6 && sy<=20;
    if(inBox){ row+=' '; continue; }
    let ok=false, bestQ=-1;
    for(let ty=10.6; ty<=15.4; ty+=0.2){
      if(shotResult(sx,sy,kx,ky,ty,0)){ ok=true; break; }
    }
    const dist=Math.hypot(43-sx,13-sy);
    const nArr=flightFrames(dist);
    const react=Math.max(0,nArr-20);
    if(ok){
      if(react<=0) row+='A';        // 门将零反应
      else if(react<=5) row+='b';
      else if(react<=10) row+='c';
      else row+='.';
    } else row+='.';
  }
  rows.push(String(sy).padStart(2)+' '+row);
}
console.log('   x=8'+' '.repeat(0)+' .. 42   A=门将零反应可进 b=<=5帧 c=<=10帧 .=无');
for(const r of rows) console.log(r);
