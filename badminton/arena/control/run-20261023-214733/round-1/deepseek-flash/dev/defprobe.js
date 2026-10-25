'use strict';
/* 发球方防守扫描：我方(team0)发球后站到 P，绝对帧 S 起拍(type)，对手=当前 brain。
 * 记录：我方触球是否晚于对方触球、是否得分、球路。 */
const sim=require('../engine.js');
const brain=require('../brain.js');
const {rules}=require('../catalog.js');
const N={move:0,jump:false,swing:0,charge:false,sprint:false};
function frames(n){return Array.from({length:n},()=>({...N}));}
function moveSeq(me,target,n){
  let x=me.x,vx=me.vx;const seq=[];
  const maxS=rules.playerSpeed;
  for(let i=0;i<n;i++){
    const d=target-x;let mv=0;
    if(Math.abs(d)>0.03||Math.abs(vx)>0.3){
      const brake=Math.sqrt(2*14*Math.abs(d));
      const desired=Math.sign(d)*Math.min(maxS,brake,Math.abs(d)*10);
      mv=Math.max(-1,Math.min(1,desired/maxS));
    }
    if(mv!==0) vx+=Math.max(-rules.playerAccel*0.05,Math.min(rules.playerAccel*0.05,mv*maxS-vx));
    else vx*=Math.exp(-rules.playerFriction*0.05);
    x+=vx*0.05;seq.push(mv);
  }
  return seq;
}
function run(P,S,type,jumpAt=-1,seed=1){
  const g=sim.createMatch({id:'d',seed,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
  g.server=0;
  for(let w=0;w<6;w++){
    const me=g.batsmen[0], o0=sim.view(g,0), o1=sim.view(g,1);
    let f0;
    const scripted=(g.phase==='serve'||g.phase==='rally') && g.server===0 && g.rally<=1 && g.frame<=42;
    if(scripted){
      const seq=moveSeq(me,P,10);
      f0=Array.from({length:10},(_,i)=>{
        const f=g.frame+i+1; // 输入作用于 step 后 frame=f
        const sw=f===S?type:0;
        return {move:sw?0:seq[i],jump:f===jumpAt,swing:sw,charge:false,sprint:false};
      });
    } else f0=brain.decide({...o0,yourPlayer:0}).frames;
    const f1=brain.decide({...o1,yourPlayer:1}).frames;
    const before=g.events.length;
    sim.advanceWindow(g,[sim.submitWindow(g,0,f0),sim.submitWindow(g,1,f1)]);
    if(g.events.slice(before).some(e=>e.type==='point')) break;
  }
  const hits=g.events.filter(e=>e.type==='hit');
  const h1=hits.find(e=>e.team===1), h0=hits.find(e=>e.team===0);
  return {score:g.score.slice(),point:g.lastPoint,legal:!!(h0&&h1&&h0.frame>h1.frame),hits:hits.map(e=>`${e.team}:${e.kind}@${e.x}/${e.y}/f${e.frame}`),h0:x=>x};
}
const out=[];
for(const P of [2.6,2.8,3.0,3.1,3.2,3.4,3.6,4.0]){
  for(const type of [-1,1]){
    for(let S=31;S<=40;S++){
      for(const J of [-1,27,28,29]){
        const r=run(P,S,type,J);
        if(r.legal) out.push({P,S,type,J,win:r.point&&r.point.winner===0,pt:r.point,hits:r.hits});
      }
    }
  }
}
console.log('legal defenses:',out.length);
for(const o of out.slice(0,40)) console.log(JSON.stringify(o));
