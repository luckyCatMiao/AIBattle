'use strict';
/* 直接检验裁判是否严格镜像对称：team1 收到 team0 输入的镜像，状态应保持镜像。 */
const { sim } = require('./arena.js');
const DMAP={N:'N',U:'U',D:'D',L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'};
const DMIR=w=>w.map(fr=>fr.map(u=>({dir:DMAP[u.dir],aim:u.aim==null?null:((180-u.aim)%360+360)%360,kick:u.kick})));
let s=12345; const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff;};
(async()=>{
 for(const seed of [1,2]){
  const g=sim.createMatch({id:'m',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
  let wi=0,bad=0,first=null;
  while(g.status==='playing'&&wi<200){
    const n=g.teamSize;
    const w=[];
    for(let f=0;f<20;f++){const fr=[];for(let i=0;i<n;i++){
      const dirs=['N','U','D','L','R','UL','UR','DL','DR'];
      fr.push({dir:dirs[Math.floor(rnd()*9)],aim:null,kick:rnd()<0.12});
    } w.push(fr);}
    sim.advanceWindow(g,[sim.submitWindow(g,0,w),sim.submitWindow(g,1,DMIR(w))]);
    // 检查镜像
    const t0=g.units.filter(u=>u.team===0).sort((a,b)=>a.index-b.index);
    const t1=g.units.filter(u=>u.team===1).sort((a,b)=>a.index-b.index);
    for(let i=0;i<n;i++){
      const dx=Math.abs((44-t0[i].x)-t1[i].x), dy=Math.abs(t0[i].y-t1[i].y);
      if(dx>1e-9||dy>1e-9){bad++; if(!first)first=`win${wi} i${i} t0=(${t0[i].x.toFixed(3)},${t0[i].y.toFixed(3)}) t1=(${t1[i].x.toFixed(3)},${t1[i].y.toFixed(3)}) exp=(${(44-t0[i].x).toFixed(3)},${t0[i].y.toFixed(3)}) ball=(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)})`;}
    }
    wi++;
  }
  console.log(`seed=${seed} n=${g.teamSize} score=${g.score} mirror-violations=${bad} first=${first||'none'}`);
 }
})();
