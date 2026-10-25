'use strict';
const sim=require('../simulation.js');const {W,H}=require('../catalog.js');
function fakeGame(){
  const tiles=new Uint8Array(W*H);
  for(let x=0;x<W;x++){tiles[x]=2;tiles[(H-1)*W+x]=2;}
  for(let y=0;y<H;y++){tiles[y*W]=2;tiles[y*W+W-1]=2;}
  const pts=[];for(let i=0;i<200;i++)pts.push({x:2+i*0.62,y:44});
  const cum=[0];for(let i=1;i<=pts.length;i++){const a=pts[i-1],b=pts[i%pts.length];cum.push(cum[i-1]+Math.hypot(b.x-a.x,b.y-a.y));}
  const g={id:'x',seed:1,status:'playing',phase:'live',winner:null,reason:'',eventId:0,
    players:[{id:0,name:'A',kind:'bot',wins:0},{id:1,name:'B',kind:'bot',wins:0}],
    frame:0,tick:0,countdown:0,track:{width:W,height:H,tiles:Array.from(tiles),points:pts,cum,halfWidth:5,length:1e9,
    checkpoints:Array.from({length:16},(_,i)=>({x:-1000-i*10,y:-1000,radius:1})),start:{x:10,y:44,angle:0},grid:[{x:10,y:44,angle:0},{x:10,y:44,angle:0}],audit:{}},
    cars:[],events:[],humanInput:null};
  for(let t=0;t<2;t++)g.cars.push({id:'p'+t,team:t,index:t,name:'x',x:10,y:44,angle:0,vx:14,vy:0,held:{throttle:0,steer:0,drift:false,boost:false},inputHistory:[],lap:0,nextCp:1,progress:0,driftCharge:0,boostEnergy:0,drifting:false,boosting:false,offRoad:false,lapStart:0,bestLap:null,finished:false,finishTime:null,boosts:0,driftTime:0,collisions:0,lastNearest:0,stuck:0});
  g.cars[1].y=80;
  return g;
}
function test(A,f,drift,secs=4){
  const g=fakeGame();const c=g.cars[0];const x0=c.x;
  let sum=0,dcMax=0,spSum=0;
  const N=Math.round(secs*20);
  for(let i=0;i<N;i++){
    const steer=A*Math.sin(2*Math.PI*f*i/20);
    c.held={throttle:1,steer,drift,boost:false};
    sim.step(g); sum+=Math.hypot(c.vx,c.vy); spSum+=Math.hypot(c.vx,c.vy); dcMax=Math.max(dcMax,c.driftCharge);
  }
  return {dx:+(c.x-x0).toFixed(2),avgVx:+((c.x-x0)/secs).toFixed(2),avgSp:+(spSum/N).toFixed(2),driftTime:+c.driftTime.toFixed(1),energy:+c.boostEnergy.toFixed(2),dc:+(c.driftCharge).toFixed(2),y:+c.y.toFixed(1),ang:+c.angle.toFixed(2)};
}
console.log('straight baseline', test(0,0,false));
for(const drift of [false,true])
for(const A of [0.2,0.35,0.5,0.8])
for(const f of [0.5,1,2])
  console.log('drift',drift,'A',A,'f',f,JSON.stringify(test(A,f,drift)));

console.log('--- bias test ---');
for(const A of [0.2,0.3,0.4])
for(const b of [-0.2,-0.12,-0.06,0,0.06,0.12,0.2]){
  const g=fakeGame();const c=g.cars[0];let sp=0;
  const N=80;
  for(let i=0;i<N;i++){
    const steer=A*Math.sin(2*Math.PI*1*i/20)+b;
    c.held={throttle:1,steer,drift:true,boost:false};
    sim.step(g); sp+=Math.hypot(c.vx,c.vy);
  }
  console.log(`A ${A} b ${b}: dy ${(c.y-44).toFixed(2)} dx ${(c.x-10).toFixed(2)} avgSp ${(sp/N).toFixed(2)} energy ${c.boostEnergy.toFixed(2)} dc ${c.driftCharge.toFixed(2)} dt ${c.driftTime.toFixed(1)}`);
}
