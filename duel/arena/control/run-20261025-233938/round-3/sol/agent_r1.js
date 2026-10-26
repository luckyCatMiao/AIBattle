'use strict';
const {DIRS, circleHitsWall, tileAt, WALL} = require('./catalog');
const moves = Object.entries(DIRS);
const aims = moves.filter(([k]) => k !== 'N');
const STEP = 0.65;
function move(x,y,dx,dy) {
  const nx=x+dx*STEP, ny=y+dy*STEP;
  if (!circleHitsWall(nx,y,.45)) x=nx;
  if (!circleHitsWall(x,ny,.45)) y=ny;
  return [x,y];
}
function bulletStep(b) {
  let [x,y,vx,vy]=b;
  for(let s=0;s<3;s++) {
    const nx=x+vx/60, ny=y+vy/60;
    if(tileAt(nx,y)===WALL) vx=-vx; else x=nx;
    if(tileAt(x,ny)===WALL) vy=-vy; else y=ny;
  }
  return [x,y,vx,vy];
}
function dist2(x,y,a,b) {return (x-a)**2+(y-b)**2;}
class Agent {
  constructor(options={}) {this.options=options;this.prev=null;this.last='N';}
  act(obs) {
    const me=obs.players[obs.yourPlayer], enemy=obs.players[1-obs.yourPlayer];
    if(!this.prev || obs.frame===0 || this.prev.id!==obs.id) {this.prev=null;this.last='N';}
    let evx=0,evy=0;
    if(this.prev && obs.frame>this.prev.frame) {
      const dt=(obs.frame-this.prev.frame)/20;
      evx=(enemy.x-this.prev.ex)/dt; evy=(enemy.y-this.prev.ey)/dt;
    }
    const enemyDir=aims.reduce((a,b)=> b[1][0]*evx+b[1][1]*evy>a[1][0]*evx+a[1][1]*evy?b:a,aims[0]);
    const horizon=this.options.horizon || 24;
    let bullets=obs.bullets.filter(b=>b.owner!==obs.yourPlayer).map(b=>[b.x,b.y,b.vx,b.vy]);
    const future=[bullets];
    for(let t=1;t<=horizon;t++) {bullets=bullets.map(bulletStep);future.push(bullets);}
    const enemyFuture=[[enemy.x,enemy.y]];
    for(let t=1;t<=horizon;t++) {
      let p=enemyFuture[t-1];
      enemyFuture.push(Math.hypot(evx,evy)>1?move(p[0],p[1],...enemyDir[1]):p);
    }
    // A changing open-space target prevents settling into a permanent firing lane.
    const phase=(obs.frame/20)*.18+obs.yourPlayer*Math.PI;
    let gx=20+12*Math.cos(phase), gy=15+8*Math.sin(phase);
    const navigation=new Float64Array(1200);navigation.fill(999);
    const ex=Math.floor(enemy.x),ey=Math.floor(enemy.y);
    const queue=[[ex,ey]];navigation[ey*40+ex]=0;
    for(let qi=0;qi<queue.length;qi++) {
      const [cx,cy]=queue[qi];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=cx+dx,ny=cy+dy;
        if(nx<1||nx>38||ny<1||ny>28||tileAt(nx+.5,ny+.5)===WALL)continue;
        const k=ny*40+nx;
        if(navigation[k]>navigation[cy*40+cx]+1) {
          navigation[k]=navigation[cy*40+cx]+1;queue.push([nx,ny]);
        }
      }
    }
    const ready=enemy.cooldown<7;
    const shotReady=me.cooldown<7;
    const targetDist=ready?8:(shotReady?3.6:7);
    function tactical(x,y,t) {
      const ep=enemyFuture[Math.min(t,9)];
      const d=Math.hypot(x-ep[0],y-ep[1]);
      let cost=.045*Math.abs(d-targetDist);
      const route=navigation[Math.floor(y)*40+Math.floor(x)];
      cost+=.025*Math.max(0,route-d-1);
      // Do not let the enemy enter point-blank shot range inside an unseen window.
      const staticD=Math.hypot(x-enemy.x,y-enemy.y);
      if(enemy.cooldown<t+4 && t<=9) {
        const danger=Math.max(0,5.6-staticD);
        cost+=danger*danger*.7;
      }
      cost+=.002*Math.hypot(x-gx,y-gy);
      const wallDist=Math.min(x-1,39-x,y-1,29-y);
      if(wallDist<1.5) cost+=(1.5-wallDist)*.12;
      return cost;
    }
    let beam=[{x:me.x,y:me.y,cost:0,path:[],last:this.last}];
    for(let t=1;t<=horizon;t++) {
      const candidates=[];
      for(const n of beam) for(const [key,[dx,dy]] of moves) {
        const [x,y]=move(n.x,n.y,dx,dy);
        let risk=0,dead=false;
        for(const b of future[t]) {
          const d=dist2(x,y,b[0],b[1]);
          // Snapshot coordinates are rounded, hence a small numerical guard.
          if(d<.705**2) {dead=true;break;}
          if(d<9) risk+=.12*Math.exp(-d/1.5);
        }
        if(dead) continue;
        const noMove=dist2(x,y,n.x,n.y)<.01;
        const cost=n.cost+risk+(t<=3?1:0.6)*tactical(x,y,t)*.08+
          (key!==n.last?.0004:0)+(noMove?.001:0);
        const path=t<=3?n.path.concat(key):n.path;
        candidates.push({x,y,cost,path,last:key,rank:cost+tactical(x,y,t)*.12});
      }
      if(!candidates.length) break;
      candidates.sort((a,b)=>a.rank-b.rank);
      const seen=new Set();beam=[];
      for(const n of candidates) {
        const k=Math.round(n.x*3)+','+Math.round(n.y*3);
        if(seen.has(k))continue;
        seen.add(k);beam.push(n);
        if(beam.length>=(this.options.width || 40))break;
      }
    }
    beam.sort((a,b)=>a.rank-b.rank);
    const best=beam[0];
    const path=best&&best.path.length===3?best.path:['N','N','N'];
    const inputs=[];let x=me.x,y=me.y,cd=me.cooldown;
    for(let t=1;t<=3;t++) {
      [x,y]=move(x,y,...DIRS[path[t-1]]);
      let aim=null,fire=false;
      if(cd>0) cd--;
      else {
        aim=this.chooseAim(x,y,enemy,evx,evy,obs,t);
        if(aim) {fire=true;cd=24;}
      }
      inputs.push({dir:path[t-1],aim,fire});
    }
    this.prev={id:obs.id,frame:obs.frame,ex:enemy.x,ey:enemy.y};this.last=path[2];
    return {inputs};
  }
  chooseAim(x,y,enemy,evx,evy,obs,t0) {
    let best=null,bestScore=-Infinity;
    const dist=Math.hypot(x-enemy.x,y-enemy.y);
    const lead=Math.min(.55,Math.max(0,(dist-.79)/14));
    const targets=[
      [enemy.x,enemy.y,.8],
      [enemy.x+evx*lead,enemy.y+evy*lead,1],
      [enemy.x+evx*.15,enemy.y+evy*.15,.6],
    ];
    for(const [key,[dx,dy]] of aims) {
      const bx=x+dx*.79,by=y+dy*.79;
      if(tileAt(bx,by)===WALL)continue;
      let b=[bx,by,dx*8.5,dy*8.5];
      let score=-10;
      for(let t=1;t<=70;t++) {
        b=bulletStep(b);
        for(const [tx,ty,w] of targets) {
          const d=Math.hypot(b[0]-tx,b[1]-ty);
          const s=w*6*Math.exp(-d*d/(2*(.6+t*.055)**2))/(1+t*.075);
          if(s>score)score=s;
        }
      }
      // Persistent diagonal trajectories cover more of the board than axial lanes.
      if(dx && dy)score+=.09;
      score+=.025*Math.sin((obs.frame+17*obs.yourPlayer)*.3+dx*3+dy*7);
      if(score>bestScore){bestScore=score;best=key;}
    }
    return best;
  }
}
if(require.main===module) {
  const agent=new Agent();
  const rl=require('readline').createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',line=> {
    try {process.stdout.write(JSON.stringify(agent.act(JSON.parse(line)))+'\n');}
    catch(e) {process.stderr.write(String(e.stack)+'\n');process.stdout.write(JSON.stringify({inputs:Array.from({length:3},()=>({dir:'N',aim:null,fire:false}))})+'\n');}
  });
}
module.exports={Agent,move,bulletStep};
