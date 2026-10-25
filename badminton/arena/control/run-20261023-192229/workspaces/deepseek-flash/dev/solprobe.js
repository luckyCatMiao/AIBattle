'use strict';
/* 验证：sol 式接发（第30帧触球，x=7.57,y=2.2,34格/秒深区杀球）下，
 * 我们站在网前 6.35、第29帧起拍上手，能否截击。 */
const core=require('../core.js');
const {rules}=require('../catalog.js');
const NET=rules.netX,L=rules.courtLength,DT=1/rules.hz;
function racketAt(x,elapsed,type=1){
  const frac=Math.max(0,Math.min(1,elapsed/9));
  const arc=type>0?rules.overhead:rules.underarm;
  return {x:x+arc.fromFwd+(arc.toFwd-arc.fromFwd)*frac,y:arc.fromUp+(arc.toUp-arc.fromUp)*frac};
}
// 对手触球：引擎 chooseShot(dir=-1, target 深区 1.0)
const cs=core.chooseShot(7.57,2.2,-1,'smash',1.0);
console.log('sol shot',cs);
let vx=-cs.speed*Math.cos(cs.angle), vy=cs.speed*Math.sin(cs.angle);
console.log('v',vx.toFixed(2),vy.toFixed(2));
// 逐帧球位置（从触球帧 30 开始）
let x=7.57,y=2.2;
const pos=[];
for(let f=30;f<=36;f++){
  for(let k=0;k<rules.substeps;k++){
    const sp=Math.hypot(vx,vy);
    vx-=vx*rules.shuttleDrag*sp*(DT/rules.substeps);
    vy-=vy*rules.shuttleDrag*sp*(DT/rules.substeps);
    vy-=rules.gravity*(DT/rules.substeps);
    x+=vx*(DT/rules.substeps); y+=vy*(DT/rules.substeps);
    const el=f-29; // S=29 -> elapsed = f-29 (elapsed increments each frame after start)
    const r=racketAt(6.35,el,1);
    const d=Math.hypot(x-r.x,y-r.y);
    if(d<0.5) console.log('f',f,'sub',k,'ball',x.toFixed(2),y.toFixed(2),'racket',r.x.toFixed(2),r.y.toFixed(2),'d',d.toFixed(2));
  }
}
