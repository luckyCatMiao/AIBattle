'use strict';
/* 测量：我方发球后，大脑作为接发方，记录逐帧球路/触球/落点 */
const sim=require('../engine.js');
const brain=require('../brain.js');
const {rules}=require('../catalog.js');
const N={move:0,jump:false,swing:0,charge:false,sprint:false};
function frames(n){return Array.from({length:n},()=>({...N}));}
function run(seed, srvStamina=100){
  const g=sim.createMatch({id:'p',seed,players:[{name:'server',kind:'api'},{name:'recv',kind:'api'}]});
  // 强制 team0 发球
  g.server=0;
  const rows=[]; let serveFrame=-1;
  for(let w=0;w<12;w++){
    const o1=sim.view(g,1);
    const f1=w===0?brain.decide({...o1,yourPlayer:1}).frames:brain.decide({...o1,yourPlayer:1}).frames;
    const before=g.events.length;
    sim.advanceWindow(g,[sim.submitWindow(g,0,frames(10)),sim.submitWindow(g,1,f1)]);
    for(const e of g.events.slice(before)) if(e.type==='serve') serveFrame=e.frame;
    const b=g.batsmen;
    rows.push({f:g.frame,sx:+g.shuttle.x.toFixed(2),sy:+g.shuttle.y.toFixed(2),svx:+g.shuttle.vx.toFixed(2),svy:+g.shuttle.vy.toFixed(2),rx:+b[1].x.toFixed(2),ry:+b[1].y.toFixed(2),rs:b[1].swing,se:b[1].swingElapsed,st:+b[1].stamina.toFixed(1)});
    const hits=g.events.slice(before).filter(e=>e.type==='hit');
    if(hits.length) console.log('HIT',JSON.stringify(hits));
    if(g.events.slice(before).some(e=>e.type==='point')){console.log('POINT',JSON.stringify(g.lastPoint),'score',g.score);break;}
  }
  console.log('serveFrame',serveFrame);
  console.log(JSON.stringify(rows));
  // 打印发球后 12 帧的完整球路
  const g2=sim.createMatch({id:'p2',seed,players:[{name:'s',kind:'api'},{name:'r',kind:'api'}]});
  const path=[]; let sf=-1;
  for(let w=0;w<4 && g2.score[0]+g2.score[1]===0;w++){
    const o1=sim.view(g2,1);
    // 接发方超早接：冲到网前，球一过网就跳杀手动？此处置空看球路
    const b=g2.batsmen[1];
    const seq=Array.from({length:10},(_,i)=>({move: b.x>8.4?-1:(Math.abs(b.x-8.4)>0.05?1:0)}));
    const before=g2.events.length;
    sim.advanceWindow(g2,[sim.submitWindow(g2,0,frames(10)),sim.submitWindow(g2,1,seq)]);
    for(const e of g2.events.slice(before)) if(e.type==='serve') sf=e.frame;
    if(sf>0) path.push({f:g2.frame,x:+g2.shuttle.x.toFixed(2),y:+g2.shuttle.y.toFixed(2)});
    if(g2.events.slice(before).some(e=>e.type==='point')) break;
  }
  console.log('no-hit serve path sample',JSON.stringify(path.slice(0,40)));
}
run(1);
