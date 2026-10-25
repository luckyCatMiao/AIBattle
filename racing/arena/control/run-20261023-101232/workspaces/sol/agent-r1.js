'use strict';
const C = require('./catalog');
const S = require('./simulation');
const clamp = C.clamp;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
class Driver {
  constructor(track, opts = {}) {
    this.track = track;
    this.opts = opts;
    this.pts = track.points;
    this.cum = [0];
    for (let i=0;i<this.pts.length;i++) {
      const a=this.pts[i], b=this.pts[(i+1)%this.pts.length];
      this.cum.push(this.cum[i]+Math.hypot(b.x-a.x,b.y-a.y));
    }
    this.length=this.cum.at(-1);
  }
  at(s, offset=0) {
    const p=C.pointAtLength(this.pts,this.cum,s);
    p.x-=Math.sin(p.angle)*offset; p.y+=Math.cos(p.angle)*offset;
    return p;
  }
  near(c) {
    let best=Infinity, ans=null;
    for(let i=0;i<this.pts.length;i++) {
      const a=this.pts[i], b=this.pts[(i+1)%this.pts.length];
      const dx=b.x-a.x,dy=b.y-a.y, l2=dx*dx+dy*dy;
      const t=clamp(((c.x-a.x)*dx+(c.y-a.y)*dy)/l2,0,1);
      const x=a.x+t*dx,y=a.y+t*dy,d=(x-c.x)**2+(y-c.y)**2;
      if(d<best){best=d;ans={s:this.cum[i]+t*Math.sqrt(l2),d:Math.sqrt(d),offset:((c.y-y)*dx-(c.x-x)*dy)/Math.sqrt(l2)};}
    }
    return ans;
  }
  control(c, par={}) {
    const n=this.near(c), v=Math.hypot(c.vx,c.vy);
    const look=par.look || this.opts.look || 11;
    const target=this.at(n.s+look, par.offset || 0);
    let desired=Math.atan2(target.y-c.y,target.x-c.x);
    const beta=v>1 ? wrap(Math.atan2(c.vy,c.vx)-c.angle):0;
    const err=wrap(desired-c.angle);
    let drift=!!(par.drift ?? this.opts.drift) && (par.frame||0) % (par.period||this.opts.period||6) < (par.on||this.opts.on||3);
    let steer=clamp((err-(this.opts.beta||0.6)*beta)*(this.opts.gain||1.7)/(drift?1.6:1),-1,1);
    if(Math.abs(steer)<.16)drift=false;
    return {throttle:1,steer,drift,boost:!!(par.drift ?? this.opts.drift)};
  }
  plan(obs) {
    const me=obs.cars[obs.yourPlayer], initial=this.near(me).s;
    let best=-Infinity, result;
    const candidates=[{look:12,drift:true,on:3},{look:11,drift:true,on:2},{look:10,drift:true,on:2},{look:9,drift:false},{look:12,drift:false},{look:13,drift:true,on:3},{look:14,drift:true,on:3},{look:15,drift:true,on:2}];
    for(const p of candidates) {
      const c={...me},g={track:this.track};
      let score=0,arc=initial, cp=c.nextCp,passed=0,frames=[];
      let countdown=Math.round(obs.countdownLeft*20);
      for(let i=0;i<60;i++) {
        const u=this.control(c,{...p,frame:obs.frame+i});
        if(i<20)frames.push([u]);
        if(countdown>0){countdown--;continue;}
        simulate(g,c,u);
        const n=this.near(c);
        let ds=n.s-arc;if(ds>this.length/2)ds-=this.length;if(ds<-this.length/2)ds+=this.length;
        score+=ds;arc=n.s;
        if(S.tileAt(g,c.x,c.y)!==0)score-=3.5;
        const edge=Math.max(0,n.d-(this.track.halfWidth-0.7));score-=edge*.2;
        const pt=this.track.checkpoints[cp];
        if(Math.hypot(c.x-pt.x,c.y-pt.y)<=pt.radius-.1){cp=(cp+1)%12;passed++;}
        const cpS=cp*this.length/12;
        let ahead=(n.s-cpS+this.length)%this.length;
        if(ahead>pt.radius+1 && ahead<this.length/2)score-=2;
      }
      score+=Math.hypot(c.vx,c.vy)*.25;
      if(score>best){best=score;result={inputs:frames};}
    }
    return result;
  }
  window(obs) {
    if(this.opts.plan)return this.plan(obs);
    const g={track:this.track,cars:obs.cars.map(c=>({...c})),events:[],eventId:0,frame:obs.frame};
    // Predict our car inside the open-loop window; opponent inputs are unknown.
    let countdown=Math.round(obs.countdownLeft*20), frames=[];
    for(let i=0;i<20;i++) {
      const c=g.cars[obs.yourPlayer];
      const u=this.control(c,{frame:obs.frame+i});
      frames.push([u]);
      if(countdown>0){countdown--;continue;}
      simulate(g,c,u);
    }
    return {inputs:frames};
  }
}
function simulate(g,c,u) {
  const r=C.rules,dt=.05, f={x:Math.cos(c.angle),y:Math.sin(c.angle)}, right={x:-f.y,y:f.x};
  let vf=c.vx*f.x+c.vy*f.y,vl=c.vx*right.x+c.vy*right.y;
  const off=S.tileAt(g,c.x,c.y)===1,was=c.drifting;
  c.offRoad=off;c.drifting=!!u.drift&&Math.abs(vf)>r.driftMinSpeed&&Math.abs(u.steer)>.15&&!off;
  if(u.throttle>0)vf+=r.accel*u.throttle*(off?r.offRoadAccel:1)*dt;
  else if(u.throttle<0)vf=vf>.5?vf-r.brake*dt:Math.max(-5,vf-r.reverseAccel*dt);
  vf*=Math.exp(-r.drag*dt);if(off)vf*=r.offRoadDrag;
  if(Math.abs(vf)>.25)c.angle+=u.steer*r.turnRate*clamp(Math.abs(vf)/8,0,1)*(c.drifting?r.driftTurnBoost:1)*Math.sign(vf)*dt;
  vl*=c.drifting?r.gripDrift:r.gripNormal;
  if(c.drifting)c.driftCharge=clamp(c.driftCharge+(Math.abs(vl)*.12+Math.abs(vf)*.02)*r.driftChargeRate*dt,0,1);
  else if(was){if(c.driftCharge>.02)c.boostEnergy=clamp(c.boostEnergy+c.driftCharge,0,1);c.driftCharge=0;}
  c.boosting=!!u.boost&&c.boostEnergy>.02;
  if(c.boosting){vf+=r.boostAccel*dt;c.boostEnergy=Math.max(0,c.boostEnergy-r.boostDrain*dt);}
  const cap=off?r.offRoadMax:c.boosting?r.boostMaxSpeed:r.maxSpeed;
  if(vf>cap)vf=Math.max(cap,vf-.9);vf=Math.max(vf,-5);
  c.vx=f.x*vf+right.x*vl;c.vy=f.y*vf+right.y*vl;
  const rad=r.carRadius;
  if(!S.circleHitsWall(g,c.x+c.vx*dt,c.y,rad))c.x+=c.vx*dt;
  else{c.vx=-c.vx*r.wallRestitution;c.vy*=.9;}
  if(!S.circleHitsWall(g,c.x,c.y+c.vy*dt,rad))c.y+=c.vy*dt;
  else{c.vy=-c.vy*r.wallRestitution;c.vx*=.9;}
  c.x=clamp(c.x,rad,64-rad);c.y=clamp(c.y,rad,44-rad);
}
module.exports={Driver,simulate};
if(require.main===module){
  const rl=require('readline').createInterface({input:process.stdin});
  let driver,key;
  rl.on('line',line=>{try{
    const o=JSON.parse(line);const k=o.id+':'+o.seed;
    if(!driver||key!==k){driver=new Driver(o.track,{plan:true});key=k;}
    process.stdout.write(JSON.stringify(driver.window(o))+'\n');
  }catch(e){process.stderr.write(String(e.stack)+'\n');process.stdout.write(JSON.stringify({inputs:Array.from({length:20},()=>[{throttle:1,steer:0}])})+'\n');}});
}
