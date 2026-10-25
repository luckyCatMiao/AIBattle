const sim = require('../simulation.js');
const cat = require('../catalog.js');
const {W,H,TILE} = cat;

function fakeGame({x=10,y=44,angle=0,vx=0,vy=0}) {
  const tiles = new Uint8Array(W*H); tiles.fill(0);
  for (let xx=0; xx<W; xx++){ tiles[xx]=2; tiles[(H-1)*W+xx]=2; }
  for (let yy=0; yy<H; yy++){ tiles[yy*W]=2; tiles[yy*W+W-1]=2; }
  const pts=[]; for(let i=0;i<200;i++) pts.push({x:2+i*0.62,y:44});
  const cum=[]; let cs=0; cum.push(0); for(let i=1;i<=pts.length;i++){ const a=pts[i-1], b=pts[i%pts.length]; cs+=Math.hypot(b.x-a.x,b.y-a.y); cum.push(cs); }
  const g = {
    id:'x', seed:1, status:'playing', phase:'live', winner:null, reason:'', eventId:0,
    players:[{id:0,name:'A',kind:'bot',wins:0},{id:1,name:'B',kind:'bot',wins:0}],
    frame:0,tick:0,countdown:0,track:{width:W,height:H,tiles:Array.from(tiles),points:pts,cum,halfWidth:5,length:1e9,checkpoints:Array.from({length:16},(_,i)=>({x:-1000-i*10,y:-1000,radius:1})),start:{x:10,y:44,angle:0},grid:[{x:10,y:44,angle:0},{x:10,y:46,angle:0}],audit:{}},
    cars:[], events: [], humanInput:null,
  };
  for (let t=0;t<2;t++) g.cars.push({id:'p'+t,team:t,index:t,name:'x',x:x+(t?0:0),y:y+(t?3:0),angle,vx: t?0:vx, vy:t?0:vy, held:{throttle:0,steer:0,drift:false,boost:false},inputHistory:[],lap:0,nextCp:1,progress:0,driftCharge:0,boostEnergy:0,drifting:false,boosting:false,offRoad:false,lapStart:0,bestLap:null,finished:false,finishTime:null,boosts:0,driftTime:0,collisions:0,lastNearest:0,stuck:0});
  return g;
}
function run(inp, frames, init = {}) {
  const g = fakeGame(init);
  const out=[];
  for (let i=0;i<frames;i++){
    g.cars[0].held = {throttle:inp.throttle||0, steer:inp.steer||0, drift:!!inp.drift, boost:!!inp.boost};
    g.cars[1].held = {throttle:0,steer:0,drift:false,boost:false};
    sim.step(g);
    const c=g.cars[0];
    const f={x:Math.cos(c.angle),y:Math.sin(c.angle)};
    const vF=c.vx*f.x+c.vy*f.y;
    const vL=c.vx*(-f.y)+c.vy*f.x;
    out.push({t:(i+1)/20, x:+c.x.toFixed(4), y:+c.y.toFixed(4), a:+c.angle.toFixed(4), vF:+vF.toFixed(4), vL:+vL.toFixed(4), sp:+Math.hypot(c.vx,c.vy).toFixed(4), dc:+c.driftCharge.toFixed(4), be:+c.boostEnergy.toFixed(4), drift:c.drifting});
  }
  return out;
}
// scenario 1: full throttle straight
console.log('straight accel:');
console.log(JSON.stringify(run({throttle:1,steer:0},20).filter((_,i)=>i%4===3)));
// scenario 2: speed 12, full steer, no drift
console.log('turn no drift v=12:');
console.log(JSON.stringify(run({throttle:0,steer:1},20,{x:40,y:44,angle:0,vx:12,vy:0}).filter((_,i)=>i%4===3)));
// scenario 3: speed 12, full steer, drift
console.log('turn drift v=12:');
console.log(JSON.stringify(run({throttle:0,steer:1,drift:true},20,{x:40,y:44,angle:0,vx:12,vy:0}).filter((_,i)=>i%4===3)));
// scenario 4: speed 8, full steer, drift, throttle 1
console.log('turn drift v=8 throttle:');
console.log(JSON.stringify(run({throttle:1,steer:1,drift:true},20,{x:40,y:44,angle:0,vx:8,vy:0}).filter((_,i)=>i%4===3)));
// scenario 5: speed 14 full steer no drift with throttle
console.log('turn nodrift v=14 throttle:');
console.log(JSON.stringify(run({throttle:1,steer:1},20,{x:40,y:44,angle:0,vx:14,vy:0}).filter((_,i)=>i%4===3)));
