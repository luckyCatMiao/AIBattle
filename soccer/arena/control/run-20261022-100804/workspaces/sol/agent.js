'use strict';
const readline = require('readline');
const SQ = Math.SQRT1_2;
const DIR = {N:[0,0],U:[0,-1],D:[0,1],L:[-1,0],R:[1,0],UL:[-SQ,-SQ],UR:[SQ,-SQ],DL:[-SQ,SQ],DR:[SQ,SQ]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hypot=Math.hypot;
const dist=(a,b)=>hypot(a.x-b.x,a.y-b.y);
const angle=(x,y)=>((Math.atan2(y,x)*180/Math.PI)+360)%360;
const box=(t,x,y)=>y>=6&&y<=20&&(t===0?x>=1&&x<=10:x>=34&&x<=43);
const wall=(x,y,r)=>{
  for(const [dx,dy] of [[-r,0],[r,0],[0,-r],[0,r],[-r*SQ,-r*SQ],[r*SQ,-r*SQ],[-r*SQ,r*SQ],[r*SQ,r*SQ]]) {
    let a=x+dx,b=y+dy;
    if(a<0||a>=44||b<1||b>=25||((a<1||a>=43)&&(b<10||b>=16)))return true;
  }return false;
};
function move(u,dx,dy){
  let nx=u.x+dx;if(!wall(nx,u.y,.34))u.x=nx;else if(!wall(u.x+Math.sign(dx)*.17,u.y,.34))u.x+=Math.sign(dx)*.17;
  let ny=u.y+dy;if(!wall(u.x,ny,.34))u.y=ny;else if(!wall(u.x,u.y+Math.sign(dy)*.17,.34))u.y+=Math.sign(dy)*.17;
}
function makeState(o){return {units:o.units.map(u=>({...u,fx:u.facing.x,fy:u.facing.y,cd:Math.round(u.kickCd*20),lock:Math.round(u.controlLock*20),steal:0,foul:0})),ball:{...o.ball},n:o.teamSize,freeze:Math.round(o.freeze*20),kickoff:Math.abs(o.seed)%2,frame:o.frame};}
function physics(s,actions){
 s.frame++;
 if(s.freeze>0){s.freeze--;return;}
 const b=s.ball;
 for(let j=0;j<s.units.length;j++){
  const u=s.units[j],a=actions[j];u.cd=Math.max(0,u.cd-1);u.lock=Math.max(0,u.lock-1);u.steal=Math.max(0,u.steal-1);u.foul=Math.max(0,u.foul-1);
  const d=DIR[a.dir];let ar=a.aim*Math.PI/180;u.fx=Math.cos(ar);u.fy=Math.sin(ar);
  const speed=.1575*(b.owner===u.id?.58:1);
  if(!u.foul)move(u,d[0]*speed,d[1]*speed);
  if(!u.foul&&a.kick&&b.owner===u.id&&u.cd===0&&u.lock===0){b.owner=null;b.x=u.x+u.fx*.59;b.y=u.y+u.fy*.59;if(wall(b.x,b.y,.22)){b.x=u.x;b.y=u.y;}b.vx=u.fx*11;b.vy=u.fy*11;u.cd=7;u.lock=6;}
 }
 for(let i=0;i<s.units.length;i++)for(let j=i+1;j<s.units.length;j++){
  const a=s.units[i],c=s.units[j],dx=c.x-a.x,dy=c.y-a.y,d=hypot(dx,dy);
  if(d>1e-6&&d<.68){let push=(.68-d)/2,px=dx/d*push,py=dy/d*push;if(!wall(a.x-px,a.y-py,.34)){a.x-=px;a.y-=py;}if(!wall(c.x+px,c.y+py,.34)){c.x+=px;c.y+=py;}}
 }
 for(const u of s.units)if(!u.foul&&box(1-u.team,u.x,u.y)){
  const edge=u.team===0?33.1:10.9;const opts=[{x:edge,y:clamp(u.y,6,20)},{x:clamp(u.x,u.team===0?34:1,u.team===0?43:10),y:5.1},{x:clamp(u.x,u.team===0?34:1,u.team===0?43:10),y:20.9}];opts.sort((a,c)=>dist(a,u)-dist(c,u));const p=opts[0];b.owner=null;Object.assign(b,{x:p.x,y:p.y,vx:0,vy:0});u.x=p.x+(p.x===edge?(u.team===0?-1.3:1.3):0);u.y=p.y+(p.y===5.1?-1.3:p.y===20.9?1.3:0);u.foul=20;u.steal=20;s.freeze=12;return;
 }
 if(b.owner){let u=s.units.find(u=>u.id===b.owner);b.x=u.x+u.fx*.62;b.y=u.y+u.fy*.62;if(wall(b.x,b.y,.22)){b.x=u.x;b.y=u.y;}b.vx=b.vy=0;let best=null,dd=Infinity;for(const e of s.units)if(e.team!==u.team&&e.lock===0&&e.steal===0){let d=dist(e,b);if(d<dd){dd=d;best=e;}}if(best&&dd<.82&&dd+.12<dist(u,b)){b.owner=best.id;u.steal=4;}}
 else{
  for(let k=0;k<4;k++){
   b.x+=b.vx*.0125;b.y+=b.vy*.0125;
   if(b.y>=10.5&&b.y<=15.5&&(b.x<=1||b.x>=43)){s.scored=true;return;}
   if(wall(b.x,b.y,.22)){let px=b.x-b.vx*.0125,py=b.y-b.vy*.0125;if(wall(b.x,py,.22)){b.x=px;b.vx*=-.72;}if(wall(px,b.y,.22)){b.y=py;b.vy*=-.72;}if(wall(b.x,b.y,.22)){b.x=px;b.y=py;b.vx*=-.72;b.vy*=-.72;}}
  }
  b.vx*=.978;b.vy*=.978;
  let best=null,dd=Infinity;for(const u of s.units)if(!u.lock&&!u.steal){let d=dist(u,b);if(d<dd){best=u;dd=d;}}if(best){const pref=s.units.find(u=>u.team===s.kickoff&&!u.lock&&!u.steal&&dist(u,b)<=dd+.06);if(pref)best=pref;if(dist(best,b)<.82){b.owner=best.id;b.vx=b.vy=0;}}
 }
}
function local(u,t){return {x:t===0?u.x:44-u.x,y:u.y};}
function safeTarget(p){p.x=clamp(p.x,1.5,42.5);p.y=clamp(p.y,1.5,24.5);if(p.x>33.35&&p.y>5.65&&p.y<20.35){if(p.x-33.35<Math.min(p.y-5.65,20.35-p.y))p.x=33.35;else p.y=p.y<13?5.6:20.4;}return p;}
function direction(u,target,speed,t){
 const p=local(u,t),q=safeTarget({...target});let best='N',val=Infinity;
 for(const [d,v]of Object.entries(DIR)){
  let x=p.x+v[0]*speed,y=p.y+v[1]*speed;
  if(x>=33.65&&y>=5.8&&y<=20.2)continue;
  if(x<1.35||x>42.65||y<1.35||y>24.65)continue;
  let cost=Math.max(Math.abs(x-q.x),Math.abs(y-q.y))+(Math.SQRT2-1)*Math.min(Math.abs(x-q.x),Math.abs(y-q.y));if(cost<val){val=cost;best=d;}
 }
 if(t===1)best=({L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'})[best]||best;return best;
}
function trajectory(s,t){
 const b=s.ball;let x=t===0?b.x:44-b.x,y=b.y,vx=(t===0?b.vx:-b.vx),vy=b.vy;const out=[];
 for(let k=0;k<90;k++){
  out.push({x,y,time:k*.05});x+=vx*.05;y+=vy*.05;
  if(y<1.23){y=2.46-y;vy=Math.abs(vy)*.72;}if(y>24.77){y=49.54-y;vy=-Math.abs(vy)*.72;}
  if(x<1.23){x=2.46-x;vx=Math.abs(vx)*.72;}if(x>42.77){x=85.54-x;vx=-Math.abs(vx)*.72;}
  vx*=.978;vy*=.978;
 }return out;
}
function intercept(u,path,t){const p=local(u,t);for(const b of path)if(hypot(p.x-b.x,p.y-b.y)<.65+3.15*b.time&&!(b.x>33.4&&b.y>5.7&&b.y<20.3))return {...b,cost:b.time};const b=path[path.length-1];const q=safeTarget({...b});return {...q,cost:dist(p,q)/3.15+1};}
function shot(p,enemies){
 let best={score:-100,aim:0,y:13};
 if(p.x<16||p.x>43)return best;
 for(let y=10.65;y<=15.36;y+=.39){
  let dx=43.05-p.x,dy=y-p.y,len=hypot(dx,dy);if(len>24.6)continue;
  let ux=dx/len,uy=dy/len,margin=8;
  for(const e of enemies){let along=(e.x-p.x)*ux+(e.y-p.y)*uy;if(along<-.2||along>len+.3)continue;
   let side=Math.abs((e.x-p.x)*uy-(e.y-p.y)*ux);
   let d=Math.max(0,along-.59);let time=d>=25?9:Math.log(Math.max(.001,1-d/25))/Math.log(.978)*.05;
   let reach=.83+3.15*Math.max(0,time-.62);
   margin=Math.min(margin,side-reach);
  }
  let score=margin-.014*len;
  if(score>best.score)best={score,aim:angle(dx,dy),y,len};
 }return best;
}
function policy(s,t,model=false){
 const own=s.units.filter(u=>u.team===t),opp=s.units.filter(u=>u.team!==t),ep=opp.map(u=>local(u,t));const n=own.length,b=local(s.ball,t),owner=s.units.find(u=>u.id===s.ball.owner),ours=owner&&owner.team===t;
 const path=trajectory(s,t),ints=own.map(u=>intercept(u,path,t));
 let chasers=own.map((u,i)=>({i,c:ints[i].cost+(i===0&&n>=2?1.8:0)})).sort((a,b)=>a.c-b.c);
 if(owner&&!ours)chasers=own.map((u,i)=>({i,c:dist(local(u,t),b)/3.15+(i===0&&n>=2?2:0)})).sort((a,b)=>a.c-b.c);
 const ranks={};chasers.forEach((v,i)=>ranks[v.i]=i);
 return own.map((u,i)=>{
  const p=local(u,t);let target={x:b.x,y:b.y},aim=angle(43-p.x,13-p.y),kick=false;const has=s.ball.owner===u.id;
  if(has){
   const sh=shot(p,ep),near=Math.min(...ep.map(e=>dist(e,p)));
   if(sh.score>-.05||(n>1&&p.x>29&&sh.score>-.95)||(n>1&&near<1.65&&sh.len&&sh.score>-1.5)){
    aim=sh.aim;kick=true;target={x:Math.min(33.25,p.x+.5),y:p.y};
   }else{
    let best=-1e9,bt={x:32.7,y:13};
    for(const dy of [-1.8,-.9,0,.9,1.8])for(const dx of [0,1.5,3]){
     let q=safeTarget({x:p.x+dx,y:p.y+dy});let min=Math.min(...ep.map(e=>dist(e,q)));let qs=shot(q,ep);
     let value=.45*q.x+.65*Math.min(4,min)+.7*Math.max(-3,Math.min(2,qs.score))-.10*Math.abs(q.y-13);
     if(min<1.1)value-=4;if(value>best){best=value;bt=q;}
    }
    target=bt;aim=angle(target.x-p.x,target.y-p.y);
    if(near<2.6){let nearest=ep.reduce((a,e)=>dist(e,p)<dist(a,p)?e:a);aim=angle(p.x-nearest.x,p.y-nearest.y);}
    // A pass is preferred to a pressured dribble when a teammate has a clear lane.
    let pass=null,ps=-Infinity;
    for(let j=0;j<n;j++)if(j!==i){let r=local(own[j],t),len=dist(p,r);if(len<4||len>17||r.x<p.x-2)continue;let ux=(r.x-p.x)/len,uy=(r.y-p.y)/len;let clearance=10;
     for(const e of ep){let a=(e.x-p.x)*ux+(e.y-p.y)*uy;if(a>0&&a<len)clearance=Math.min(clearance,Math.abs((e.x-p.x)*uy-(e.y-p.y)*ux)-.85-3.15*Math.max(0,a/9-.45));}
     let value=r.x-p.x+Math.min(4,clearance)*1.5;if(clearance>.4&&value>ps){ps=value;pass=r;}
    }
    if(pass&&((near<2.5&&ps>0)||(ps>8&&p.x<26))){aim=angle(pass.x-p.x,pass.y-p.y);kick=true;}
    if(p.x<12&&near<2.7&&!kick){aim=angle(22-p.x,(p.y<13?5:21)-p.y);kick=true;}
   }
  }else if(i===0&&n>=2){
   let gx=b.x>25?7: b.x>15?4.3:2.5;
   let gy=13+(b.y-13)*(gx-1)/Math.max(3,b.x-1);
   target={x:gx,y:clamp(gy,10.7,15.3)};
   if(!owner&&ints[i].cost<1.4&&path.some(q=>q.x<10))target=ints[i];
   if(owner&&!ours&&b.x<11&&dist(p,b)<4.5)target=b;
  }else if(!owner){
   if(ranks[i]===0||(ranks[i]===1&&n>=4))target=ints[i];
   else if(n===2&&ranks[i]===1){target={x:Math.min(15,b.x-4),y:clamp(13+(b.y-13)*.4,8,18)};}
   else target={x:clamp(b.x+(ranks[i]%2?4:-5),12,32.7),y:clamp(13+(i-(n-1)/2)*4,3,23)};
  }else if(!ours){
   if(ranks[i]===0||(ranks[i]===1&&n>=4&&b.x<25)){
    target={x:b.x-.3,y:b.y};
    if(owner){const v=local(owner,t);target={x:v.x+(t===0?owner.fx:-owner.fx)*.62,y:v.y+owner.fy*.62};}
   }else{const k=ranks[i];let x=clamp(b.x-5-k*2,3,21);target={x,y:clamp(13+(b.y-13)*(x-1)/Math.max(3,b.x-1)+(k%2?1:-1),6.5,19.5)};}
  }else{
   const op=local(owner,t);let ys=n<=2?[13]:Array.from({length:n},(_,j)=>5+16*j/Math.max(1,n-1));
   target={x:clamp(op.x+5+(i%2)*2,17,32.5),y:ys[i]};
   if(n>=4&&ranks[i]===n-1)target={x:clamp(op.x-8,10,23),y:13};
   if(dist(p,op)<2)target.y=p.y<op.y?op.y-3:op.y+3;
  }
  if(!has){const sh=shot(p,ep);aim=sh.len?sh.aim:angle(43-p.x,13-p.y);kick=sh.score>-.1;}
  if(model&&n===1){kick=true;aim=angle(43-p.x,13-p.y);}
  let d=direction(u,target,.1575*(has?.58:1),t);
  return {dir:d,aim:t===0?aim:(180-aim+360)%360,kick};
 });
}
function decide(o){
 const s=makeState(o),t=o.yourTeam,out=[];
 for(let f=0;f<20;f++){
  const a=policy(s,t),e=policy(s,1-t,true);out.push(a);
  const all=s.units.map(u=>u.team===t?a[u.index]:e[u.index]);
  if(!s.scored)physics(s,all);
 }
 return {inputs:out};
}
module.exports={decide,policy,makeState,physics,shot};
if(require.main===module){const rl=readline.createInterface({input:process.stdin});rl.on('line',line=>{try{process.stdout.write(JSON.stringify(decide(JSON.parse(line)))+'\n');}catch(e){console.error(e.stack);process.exit(1);}});}
