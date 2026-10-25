const sim = require('../simulation.js'); const cat = require('../catalog.js');
const {W,H} = cat;
function fakeGame(o={}) {
  const tiles = new Uint8Array(W*H); 
  for (let x=0;x<W;x++){ tiles[x]=2; tiles[(H-1)*W+x]=2; }
  for (let y=0;y<H;y++){ tiles[y*W]=2; tiles[y*W+W-1]=2; }
  const pts=[]; for(let i=0;i<200;i++) pts.push({x:2+i*0.62,y:44});
  const cum=[0]; for(let i=1;i<=pts.length;i++){const a=pts[i-1],b=pts[i%pts.length];cum.push(cum[i-1]+Math.hypot(b.x-a.x,b.y-a.y));}
  const g={id:'x',seed:1,status:'playing',phase:'live',winner:null,reason:'',eventId:0,
    players:[{id:0,name:'A',kind:'bot',wins:0},{id:1,name:'B',kind:'bot',wins:0}],
    frame:0,tick:0,countdown:0,track:{width:W,height:H,tiles:Array.from(tiles),points:pts,cum,halfWidth:5,length:1e9,
    checkpoints:Array.from({length:16},(_,i)=>({x:-1000-i*10,y:-1000,radius:1})),start:{x:10,y:44,angle:0},grid:[{x:10,y:44,angle:0},{x:10,y:44,angle:0}],audit:{}},
    cars:[],events:[],humanInput:null};
  for(let t=0;t<2;t++) g.cars.push({id:'p'+t,team:t,index:t,name:'x',x:20,y:20+t*5,angle:0,vx:0,vy:0,held:{throttle:0,steer:0,drift:false,boost:false},inputHistory:[],lap:0,nextCp:1,progress:0,driftCharge:0,boostEnergy:0,drifting:false,boosting:false,offRoad:false,lapStart:0,bestLap:null,finished:false,finishTime:null,boosts:0,driftTime:0,collisions:0,lastNearest:0,stuck:0});
  Object.assign(g.cars[0], o);
  g.cars[0].x=o.x??20; g.cars[0].y=44;
  return g;
}
function turnTest({v0=12,steer=1,drift=false,thr=1,frames=40}) {
  const g=fakeGame({vx:v0});
  const pts=[]; let dist=0;
  for(let i=0;i<frames;i++){
    g.cars[0].held={throttle:thr,steer,drift,boost:false};
    const before={x:g.cars[0].x,y:g.cars[0].y};
    sim.step(g);
    dist+=Math.hypot(g.cars[0].x-before.x,g.cars[0].y-before.y);
    if(i%5===4){const c=g.cars[0]; const sp=Math.hypot(c.vx,c.vy);
      pts.push({t:(i+1)/20,x:+c.x.toFixed(2),y:+c.y.toFixed(2),ang:+c.angle.toFixed(2),sp:+sp.toFixed(2),dc:+c.driftCharge.toFixed(2),be:+c.boostEnergy.toFixed(2),dr:c.drifting});}
  }
  return pts;
}
for (const cfg of [
  {v0:12,steer:1,drift:false,thr:1},
  {v0:12,steer:1,drift:true,thr:1},
  {v0:9,steer:1,drift:false,thr:1},
  {v0:9,steer:1,drift:true,thr:1},
  {v0:9,steer:0.5,drift:true,thr:1},
  {v0:9,steer:0.6,drift:false,thr:1},
  {v0:6,steer:1,drift:true,thr:1},
  {v0:6,steer:1,drift:false,thr:1},
]) console.log(JSON.stringify(cfg), JSON.stringify(turnTest(cfg)));
