'use strict';
const fs = require('fs');
const opponentModel = require('./agent_v1');
const DIR = {N:[0,0], U:[0,-1], D:[0,1], L:[-1,0], R:[1,0], UL:[-Math.SQRT1_2,-Math.SQRT1_2],UR:[Math.SQRT1_2,-Math.SQRT1_2],DL:[-Math.SQRT1_2,Math.SQRT1_2],DR:[Math.SQRT1_2,Math.SQRT1_2]};
const KEYS=Object.keys(DIR), SPEED=0.1575;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hypot=Math.hypot;
const angle=(x,y)=>(Math.atan2(y,x)*180/Math.PI+360)%360;
const dist=(a,b)=>hypot(a.x-b.x,a.y-b.y);
function wall(x,y) {
  let tx=Math.floor(x),ty=Math.floor(y);
  if(tx<0||tx>=44||ty<0||ty>=26)return true;
  return ty===0||ty===25||((tx===0||tx===43)&&!(ty>=10&&ty<16));
}
function hits(x,y,r) {
  const k=r*Math.SQRT1_2;
  return wall(x-r,y)||wall(x+r,y)||wall(x,y-r)||wall(x,y+r)||wall(x-k,y-k)||wall(x+k,y-k)||wall(x-k,y+k)||wall(x+k,y+k);
}
function move(u,dx,dy) {
  if(!hits(u.x+dx,u.y,.34))u.x+=dx;
  else if(!hits(u.x+Math.sign(dx)*.17,u.y,.34))u.x+=Math.sign(dx)*.17;
  if(!hits(u.x,u.y+dy,.34))u.y+=dy;
  else if(!hits(u.x,u.y+Math.sign(dy)*.17,.34))u.y+=Math.sign(dy)*.17;
  u.x=clamp(u.x,.34,43.66);u.y=clamp(u.y,.34,25.66);
}
function makeState(o) {
  const s={units:o.units.map(u=>({...u,fx:u.facing.x,fy:u.facing.y,cd:Math.round(u.kickCd*20),lock:Math.round(u.controlLock*20),steal:0})),ball:{...o.ball},frame:o.frame,freeze:Math.round((o.freeze||0)*20),spawns:o.map.spawns,n:o.teamSize,score:[...o.score]};
  for(const e of o.events||[]){
    if(e.type==='kickoff'&&e.frame>0)s.freeze=Math.max(0,12-(o.frame-e.frame));
    if(e.type==='tackle'&&o.frame-e.frame<4){const u=s.units.find(u=>u.id===e.from);if(u)u.steal=4-(o.frame-e.frame);}
  }
  return s;
}
function reset(s) {
  for(const u of s.units){const p=s.spawns[u.team][u.index];u.x=p[0]+.5;u.y=p[1]+.5;u.fx=u.team? -1:1;u.fy=0;u.cd=u.lock=u.steal=0;}
  s.ball={x:22,y:13,vx:0,vy:0,owner:null};s.freeze=12;
}
function step(s,acts) {
  s.frame++;
  if(s.freeze>0){s.freeze--;if(s.frame===1200)reset(s);return;}
  const b=s.ball;
  for(let i=0;i<s.units.length;i++){
    const u=s.units[i],a=acts[i],d=DIR[a.dir];
    u.cd=Math.max(0,u.cd-1);u.lock=Math.max(0,u.lock-1);u.steal=Math.max(0,u.steal-1);
    if(a.aim!=null){let r=a.aim*Math.PI/180;u.fx=Math.cos(r);u.fy=Math.sin(r);}
    else if(d[0]||d[1]){u.fx=d[0];u.fy=d[1];}
    move(u,d[0]*SPEED,d[1]*SPEED);
    if(a.kick&&b.owner===u.id&&u.cd<=0&&u.lock<=0){
      b.owner=null;b.x=u.x+u.fx*.59;b.y=u.y+u.fy*.59;
      if(hits(b.x,b.y,.22)){b.x=u.x;b.y=u.y;}
      b.vx=u.fx*14;b.vy=u.fy*14;u.cd=7;u.lock=6;
    }
  }
  for(let i=0;i<s.units.length;i++)for(let j=i+1;j<s.units.length;j++){
    let a=s.units[i],b=s.units[j],dx=b.x-a.x,dy=b.y-a.y,d=hypot(dx,dy);
    if(d>=.68||d<1e-6)continue;
    let p=(.68-d)/2;dx=dx/d*p;dy=dy/d*p;
    if(!hits(a.x-dx,a.y-dy,.34)){a.x-=dx;a.y-=dy;}
    if(!hits(b.x+dx,b.y+dy,.34)){b.x+=dx;b.y+=dy;}
  }
  if(b.owner){
    let u=s.units.find(u=>u.id===b.owner);
    b.x=u.x+u.fx*.62;b.y=u.y+u.fy*.62;
    if(hits(b.x,b.y,.22)){b.x=u.x;b.y=u.y;}
    b.vx=0;b.vy=0;
    let best=null,bd=Infinity;
    for(const v of s.units)if(v.team!==u.team&&v.lock<=0&&v.steal<=0){let d=dist(v,b);if(d<bd){best=v;bd=d;}}
    if(best&&bd<.82&&bd+.12<dist(u,b)){b.owner=best.id;u.steal=4;}
  } else {
    for(let j=0;j<4;j++){
      b.x+=b.vx*.0125;b.y+=b.vy*.0125;
      if(b.y>=10.5&&b.y<=15.5&&(b.x<=1||b.x>=43)){
        s.score[b.x<=1?1:0]++;reset(s);return;
      }
      if(hits(b.x,b.y,.22)){
        let px=b.x-b.vx*.0125,py=b.y-b.vy*.0125;
        if(hits(b.x,py,.22)){b.x=px;b.vx=-b.vx*.72;}
        if(hits(px,b.y,.22)){b.y=py;b.vy=-b.vy*.72;}
        if(hits(b.x,b.y,.22)){b.x=px;b.y=py;b.vx=-b.vx*.72;b.vy=-b.vy*.72;}
      }
    }
    b.vx*=.97;b.vy*=.97;
    if(hypot(b.vx,b.vy)<.02)b.vx=b.vy=0;
    let best=null,bd=Infinity;
    for(const u of s.units)if(u.lock<=0&&u.steal<=0){let d=dist(u,b);if(d<bd){bd=d;best=u;}}
    if(best&&bd<.82){b.owner=best.id;b.vx=b.vy=0;}
  }
  if(s.frame===1200)reset(s);
}
function go(u,x,y,avoid,team) {
  let best='N',bv=Infinity;
  for(const k of KEYS){
    let d=DIR[k],nx=u.x+d[0]*SPEED,ny=u.y+d[1]*SPEED;
    if(hits(nx,ny,.34))continue;
    let v=hypot(x-nx,y-ny);
    if(avoid)for(const a of avoid)if(a.id!==u.id){
      let dd=hypot(a.x-nx,a.y-ny);
      if(dd<.8)v+=(.8-dd)*.35;
    }
    if(v<bv){bv=v;best=k;}
  }
  return best;
}
function path(b,frames=100) {
  let a=[],x=b.x,y=b.y,vx=b.vx,vy=b.vy;
  for(let f=1;f<=frames;f++){
    for(let j=0;j<4;j++){
      x+=vx*.0125;y+=vy*.0125;
      if(y>=10.5&&y<=15.5&&(x<=1||x>=43)){a.push({x,y,t:f});return a;}
      if(hits(x,y,.22)){
        let px=x-vx*.0125,py=y-vy*.0125;
        if(hits(x,py,.22)){x=px;vx=-vx*.72;}
        if(hits(px,y,.22)){y=py;vy=-vy*.72;}
        if(hits(x,y,.22)){x=px;y=py;vx=-vx*.72;vy=-vy*.72;}
      }
    }
    vx*=.97;vy*=.97;a.push({x,y,t:f});
  }
  return a;
}
function intercept(u,trajectory) {
  let best=trajectory[trajectory.length-1], val=Infinity;
  for(const p of trajectory){
    const dx=Math.abs(u.x-p.x),dy=Math.abs(u.y-p.y);
    const cost=Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);
    const t=Math.max(0,cost-.7)/SPEED;
    if(p.t>=u.lock&&t<=p.t)return {...p,eta:p.t};
    let v=t-p.t;
    if(v<val){val=v;best=p;}
  }
  return {...best,eta:Math.max(best.t,dist(u,best)/SPEED)};
}
// Compare the entire shot flight to defenders' delayed reachable regions.
function shot(s,u,quick=false) {
  const sign=u.team===0?1:-1, gx=u.team===0?43.12:.88;
  const enemies=s.units.filter(v=>v.team!==u.team),friends=s.units.filter(v=>v.team===u.team&&v.id!==u.id);
  let best={score:-100,aim:angle(gx-u.x,13-u.y),y:13,margin:-99};
  const targets=quick?[10.7,12.1,13,14,15.3]:[10.65,11.2,11.8,12.4,13,13.6,14.2,14.8,15.35];
  for(const gy of targets){
    let dx=gx-u.x,dy=gy-u.y,len=hypot(dx,dy),ux=dx/len,uy=dy/len;
    if(sign*dx<0)continue;
    const travel=len-.59;
    if(travel>=23.12)continue;
    let fGoal=Math.ceil(Math.log(1-travel/(14/20/.03))/Math.log(.97));
    if(fGoal>130)continue;
    let margin=20,friendPenalty=0;
    for(const e of enemies){
      let along=(e.x-u.x)*ux+(e.y-u.y)*uy;
      if(along<-.8||along>len+1.5)continue;
      let first=Math.max(1,Math.floor(-Math.log(Math.max(.005,1-Math.max(0,along-.59)/(14/20/.03)))/.030459)-12);
      let last=Math.min(fGoal,first+40);
      // Sample every other frame; the extra radius covers the gaps.
      for(let f=first;f<=last;f+=2){
        let r=.59+14/20*(1-Math.pow(.97,f))/.03;
        const bx=u.x+ux*r,by=u.y+uy*r;
        let t=f/20;
        let evx=e.vx||0,evy=e.vy||0;
        const momentum=Math.min(t,.25);
        let ex=e.x+evx*momentum,ey=e.y+evy*momentum;
        // First part of a second is open-loop, later reactions are possible.
        const reach=3.15*Math.max(0,t-.40)*.83;
        let m=hypot(bx-ex,by-ey)-.91-reach;
        margin=Math.min(margin,m);
      }
    }
    for(const v of friends){
      let along=(v.x-u.x)*ux+(v.y-u.y)*uy;
      if(along>.5&&along<len-.5){let perp=Math.abs((v.x-u.x)*uy-(v.y-u.y)*ux);if(perp<.85)friendPenalty=Math.max(friendPenalty,(.85-perp)*1.7);}
    }
    let score=margin-friendPenalty-.006*fGoal;
    if(score>best.score)best={score,aim:angle(dx,dy),y:gy,margin,frames:fGoal};
  }
  return best;
}
function shield(u,enemies,progressX,progressY) {
  let bestA=angle(progressX,progressY),best=-Infinity;
  for(let a=0;a<360;a+=15){
    let r=a*Math.PI/180,fx=Math.cos(r),fy=Math.sin(r),bx=u.x+fx*.62,by=u.y+fy*.62;
    let safety=3;
    for(const e of enemies){
      let d=hypot(e.x-bx,e.y-by);safety=Math.min(safety,d);
    }
    let v=Math.min(safety,1.7)*4+.20*(fx*progressX+fy*progressY);
    if(hits(bx,by,.22))v-=2;
    if(v>best){best=v;bestA=a;}
  }
  return bestA;
}
function carry(s,u,enemies,sh) {
  const sign=u.team===0?1:-1,gx=u.team===0?43:1;
  let best='N',value=-Infinity,bestAim=0;
  for(const k of KEYS){
    let d=DIR[k],nx=u.x+d[0]*SPEED,ny=u.y+d[1]*SPEED;
    if(hits(nx,ny,.34))continue;
    // Look far enough ahead to turn before running into a defender.
    let lx=clamp(u.x+d[0]*1.3,1.5,42.5),ly=clamp(u.y+d[1]*1.3,1.5,24.5);
    let targetY=clamp(u.y,11.2,14.8);
    let val=-hypot(gx-lx,(targetY-ly)*1.3);
    for(const e of enemies){
      let dx=e.x-lx,dy=e.y-ly,dd=hypot(dx,dy);
      if(dd<2.6)val-=(2.6-dd)*1.5;
      if(dd<.72)val-=3;
    }
    if(ly<3||ly>23)val-=1;
    let aim=shield({x:nx,y:ny},enemies,sign,clamp(13-u.y,-1,1)*.3);
    const r=aim*Math.PI/180;
    for(const e of enemies){let db=hypot(nx+Math.cos(r)*.62-e.x,ny+Math.sin(r)*.62-e.y);if(db<.7)val-=(.7-db)*14;}
    // Very close to goal, move laterally into its mouth instead of into the wall.
    if(sign*(gx-u.x)<2.0)val-=Math.abs(ly-clamp(ly,11,15))*2;
    if(val>value){value=val;best=k;bestAim=aim;}
  }
  return {dir:best,aim:bestAim,kick:false};
}
function pass(s,u,enemies) {
  const sign=u.team===0?1:-1;
  let best=null,bv=-1e9;
  for(const v of s.units)if(v.team===u.team&&v.id!==u.id){
    let dx=v.x-u.x,dy=v.y-u.y,len=hypot(dx,dy);
    if(len<3||len>16||dx*sign<2)continue;
    let ux=dx/len,uy=dy/len,safe=10;
    for(const e of enemies){
      let along=clamp((e.x-u.x)*ux+(e.y-u.y)*uy,0,len);
      let t=-Math.log(Math.max(.02,1-Math.max(0,along-.59)/23.333))/.60918;
      safe=Math.min(safe,hypot(e.x-u.x-ux*along,e.y-u.y-uy*along)-.9-3.15*Math.max(0,t-.35));
    }
    let vscore=dx*sign*.2+safe;
    if(safe>.1&&vscore>bv){best={dir:go(u,u.x-sign,u.y),aim:angle(dx,dy),kick:true};bv=vscore;}
  }
  return best;
}
function policy(s,team,cheap=false) {
  const own=s.units.filter(u=>u.team===team),opp=s.units.filter(u=>u.team!==team),b=s.ball;
  const sign=team===0?1:-1,home=team===0?1:43,gx=team===0?43:1;
  const owner=s.units.find(u=>u.id===b.owner);
  const ours=owner&&owner.team===team;
  let traj=b.owner?null:path(b,85);
  let target,ranking;
  if(!owner){
    ranking=own.map(u=>({u,p:intercept(u,traj)})).sort((a,b)=>a.p.eta-b.p.eta);
    target=ranking[0].p;
  }else{
    const tx=owner.x+owner.fx*.62,ty=owner.y+owner.fy*.62;
    ranking=own.map(u=>({u,p:{x:tx,y:ty,eta:dist(u,{x:tx,y:ty})/SPEED}})).sort((a,b)=>a.p.eta-b.p.eta);
    target={x:tx,y:ty};
  }
  // A keeper is reserved only when there are enough field players.
  let keeper=null;
  if(own.length>=3 || (own.length===2&&!ours&&owner)){
    keeper=own.reduce((a,v)=>Math.abs(v.x-home)+Math.abs(v.y-13)*.18<Math.abs(a.x-home)+Math.abs(a.y-13)*.18?v:a);
    if(owner&&owner.id===keeper.id)keeper=null;
    if(!ours&&ranking[0].u.id===keeper?.id&&Math.abs(b.x-home)>8){
      let r=ranking.find(v=>v.u.id!==keeper.id);ranking=[r,...ranking.filter(v=>v!==r)];
    }
  }
  let press=ranking[0].u;
  let second=ranking.find(r=>r.u.id!==press.id&&r.u.id!==keeper?.id)?.u;
  const actions=[];
  for(const u of own){
    let tx,ty,aim=angle(gx-u.x,13-u.y),kick=false;
    if(owner&&owner.id===u.id){
      const sh=shot(s,u,cheap);
      const nearest=Math.min(...opp.map(v=>dist(u,v)));
      if(sh.score>-.30||(sh.margin>-.4&&Math.abs(gx-u.x)<9)|| (Math.abs(gx-u.x)<3.5&&u.y>=10.4&&u.y<=15.6)){
        actions.push({dir:'N',aim:sh.aim,kick:true});continue;
      }
      if(nearest<2.5||Math.abs(gx-u.x)>23){
        let p=pass(s,u,opp);if(p){actions.push(p);continue;}
      }
      actions.push(carry(s,u,opp,sh));continue;
    }
    if(u.id===press.id&&!ours){
      const p=owner?target:ranking.find(r=>r.u.id===u.id).p;
      tx=p.x;ty=p.y;
      if(owner){
        // Meet the exposed ball rather than pushing on the carrier's body.
        let dx=owner.x-u.x,dy=owner.y-u.y;
        const dd=hypot(dx,dy);
        if(dd>1.7){tx+=owner.fx*.35;ty+=owner.fy*.35;}
        if(own.length<=2 && dd>1.45){
          // With no spare defender, stay on the goal side of the carrier.
          const toward=hypot(home-owner.x,13-owner.y)||1;
          const gap=own.length===1?(Math.abs(owner.x-home)<18?1.05:2.8):1.7;
          tx=owner.x+(home-owner.x)/toward*gap;
          ty=owner.y+(13-owner.y)/toward*gap;
        }
      }
    }else if(keeper&&u.id===keeper.id){
      tx=home+sign*1.65;
      const source=owner||b;
      let gy=13;
      if(!owner&&hypot(b.vx,b.vy)>.5&&b.vx*sign<0){
        const p=traj.find(p=>sign*(p.x-tx)<0);
        if(p)gy=clamp(p.y,10.35,15.65);
        const it=intercept(u,traj);
        if(Math.abs(it.x-home)<6&&it.eta<25){tx=it.x;gy=it.y;}
      }else{
        const frac=clamp(Math.abs(tx-home)/Math.max(3,Math.abs(source.x-home)),0,1);
        gy=13+(source.y-13)*frac;
        if(Math.abs(source.x-home)<10)gy=clamp(source.y,10.6,15.4);
      }
      ty=clamp(gy,9.8,16.2);
    }else if(ours){
      // Support ahead of the ball, with separate passing lanes.
      const field=own.filter(v=>v.id!==owner.id&&v.id!==keeper?.id);
      const idx=field.findIndex(v=>v.id===u.id), count=field.length;
      tx=clamp(owner.x+sign*(6+(idx%2)*3),5,39);
      ty=clamp(13+(idx-(count-1)/2)*5,4,22);
      if(count===1)ty=owner.y<13?17:9;
    }else if(second&&u.id===second.id){
      if(owner){
        tx=owner.x-sign*2.5;ty=owner.y+(owner.y<13?1.4:-1.4);
      }else{
        const p=ranking.find(r=>r.u.id===u.id).p;tx=p.x-sign*1.8;ty=p.y;
      }
    }else{
      const defenders=own.filter(v=>v.id!==press.id&&v.id!==keeper?.id&&v.id!==second?.id);
      const idx=defenders.findIndex(v=>v.id===u.id);
      tx=clamp(b.x-sign*(4.5+(idx%2)*3),4,40);
      ty=clamp(13+(idx-(defenders.length-1)/2)*4.0+(b.y-13)*.25,7,19);
      if(Math.abs(b.x-home)<13){tx=home+sign*(4+(idx%2)*2);ty=11+idx*2;}
    }
    if(tx==null){tx=target.x;ty=target.y;}
    let dir=go(u,tx,ty,s.units,team);
    if(own.length===1&&!owner&&hypot(b.vx,b.vy)<.05&&Math.abs(tx-u.x)>2&&Math.abs(ty-u.y)>.08){
      dir=(ty>u.y?'D':'U')+(tx>u.x?'R':'L');
    }
    // Inputs remain useful even if the predicted pickup happens a few frames early.
    if(dist(u,b)<2.0||u.id===keeper?.id){
      let sh=shot(s,u,true);
      if(sh.score>-.6){aim=sh.aim;kick=true;}
      else{
        aim=shield(u,opp,sign,0);
        if(Math.abs(u.x-home)<7){aim=angle(sign*12,clamp(13-u.y,-7,7));kick=true;}
      }
    }
    actions.push({dir,aim,kick});
  }
  return actions;
}
let previous=null;
function decide(o) {
  const s=makeState(o), team=o.yourTeam;
  if(previous&&previous.id===o.id&&o.frame>previous.frame){
    let dt=(o.frame-previous.frame)/20;
    for(const u of s.units){let p=previous.units.find(v=>v.id===u.id);if(p&&dist(u,p)<4.5*dt){u.vx=(u.x-p.x)/dt;u.vy=(u.y-p.y)/dt;}}
  }
  previous={id:o.id,frame:o.frame,units:o.units.map(u=>({id:u.id,x:u.x,y:u.y}))};
  const out=[];
  for(let f=0;f<20;f++){
    const mine=policy(s,team,false), theirs=opponentModel.policy(s,1-team,true);
    out.push(mine);
    const all=team===0?[...mine,...theirs]:[...theirs,...mine];
    const old=s.units.map(u=>[u.x,u.y]);
    step(s,all);
    for(let i=0;i<s.units.length;i++){s.units[i].vx=(s.units[i].x-old[i][0])*20;s.units[i].vy=(s.units[i].y-old[i][1])*20;}
  }
  return {inputs:out};
}
module.exports={decide,policy,makeState,step,path,shot,intercept};
if(require.main===module){
  const readline=require('readline').createInterface({input:process.stdin,crlfDelay:Infinity});
  readline.on('line',line=>{
    try{const o=JSON.parse(line);process.stdout.write(JSON.stringify(decide(o))+'\n');}
    catch(e){process.stderr.write(String(e.stack)+'\n');process.exit(1);}
  });
}
