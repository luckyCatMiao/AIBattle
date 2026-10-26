// Can a shielded carrier walk through a chasing/blocking defender?
const path = require('path');
const sim = require(path.join(__dirname, '..', '..', 'simulation.js'));
const { createMatch, step } = sim;
const SQ2 = Math.SQRT1_2;
const DIRS = { N:[0,0], U:[0,-1], D:[0,1], L:[-1,0], R:[1,0], UL:[-SQ2,-SQ2], UR:[SQ2,-SQ2], DL:[-SQ2,SQ2], DR:[SQ2,SQ2] };

function run(defMode, nDef = 1, startX = 20) {
  const g = createMatch({ id:'x', players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}], seed:1, teamSize: 4 });
  g.freeze = 0; g.freeKickFrames = 0;
  for (const u of g.units) {
    u.kickCd=0;u.controlLock=0;u.stealLock=0;u.foulLock=0;
    u.x = u.team===0 ? 18 : 40; u.y = 2 + u.index*2;
  }
  const car = g.units.find(u=>u.team===0&&u.index===1); car.x=startX; car.y=13;
  const defs=[];
  for (let i=0;i<nDef;i++){
    const d=g.units.find(u=>u.team===1&&u.index===i+1);
    d.x = startX + 3 + i*0.7; d.y = 13 + (i===1? 1.5 : 0);
    defs.push(d);
  }
  g.ball.x=startX; g.ball.y=13; g.ball.vx=0; g.ball.vy=0; g.ball.owner=car.id; g.ball.lastTouch=car.id; g.ball.lastTeam=0;
  let lostFrame=null;
  const targetX = 33.0;
  for (let f=0; f<400; f++) {
    // carrier: move toward target, aim the ball away from the nearest defender
    let dx=targetX-car.x, dy=13-car.y; const dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
    // choose dir: 8-dir closest to (dx,dy)
    let bd='N', bv=-9;
    for (const k in DIRS){const [vx,vy]=DIRS[k]; if(!vx&&!vy)continue; const v=vx*dx+vy*dy; if(v>bv){bv=v;bd=k;}}
    // shield: aim at the direction (16 steps) maximizing min distance ball<->defender
    let bestAim=null, bestV=-1e9;
    for (let a=0;a<360;a+=15){
      const rad=a*Math.PI/180, bx=car.x+Math.cos(rad)*0.62, by=car.y+Math.sin(rad)*0.62;
      let dm=9; for(const d of defs) dm=Math.min(dm, Math.hypot(d.x-bx,d.y-by));
      const v=Math.min(dm,3.4);
      if(v>bestV){bestV=v;bestAim=a;}
    }
    car.held={dir:bd, aim:bestAim, kick:false};
    // defenders
    for (const d of defs){
      if (defMode==='chase'){ // chase the ball
        let ddx=g.ball.x-d.x, ddy=g.ball.y-d.y; const l=Math.hypot(ddx,ddy)||1; ddx/=l; ddy/=l;
        let b='N', v=-9; for(const k in DIRS){const [vx,vy]=DIRS[k]; if(!vx&&!vy)continue; const vv=vx*ddx+vy*ddy; if(vv>v){v=vv;b=k;}}
        d.held={dir:b,aim:null,kick:false};
      } else { // block: stand between the carrier and the goal, mirror its y
        const tx=43, ty=13;
        let ddx=car.x-d.x, ddy=car.y-d.y; const l=Math.hypot(ddx,ddy)||1;
        let mx=d.x+ (car.x-d.x)/l*0.0, my=d.y;
        let b='N', v=-9; const gx2=(car.x-d.x)/l, gy2=(car.y-d.y)/l;
        for(const k in DIRS){const [vx,vy]=DIRS[k]; if(!vx&&!vy)continue; const vv=vx*gx2+vy*gy2; if(vv>v){v=vv;b=k;}}
        d.held={dir:b,aim:null,kick:false};
      }
    }
    for (const u of g.units) if (!u.held) u.held={dir:'N',aim:null,kick:false};
    step(g);
    if (g.ball.owner !== car.id) { lostFrame=f; break; }
  }
  return {reached: car.x>=targetX-0.3, x: car.x.toFixed(1), lostFrame};
}
for (const mode of ['chase','block']) for (const nd of [1,2,3]) console.log(mode, nd, JSON.stringify(run(mode, nd)));
