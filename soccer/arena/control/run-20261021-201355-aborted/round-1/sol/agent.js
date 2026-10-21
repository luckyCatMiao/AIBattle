'use strict';
const readline = require('readline');
const V=3.15/20, SQ=Math.SQRT1_2;
const dirs=[['N',0,0],['R',1,0],['DR',SQ,SQ],['D',0,1],['DL',-SQ,SQ],['L',-1,0],['UL',-SQ,-SQ],['U',0,-1],['UR',SQ,-SQ]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), hypot=Math.hypot;
function angle(x,y){return (Math.atan2(y,x)*180/Math.PI+360)%360;}
function act(d='N',a=0,k=false){return {dir:d,aim:a,kick:k};}
function wall(x,y,r){return y-r<1||y+r>=25||((x-r<1||x+r>=43)&&(y-r<10||y+r>=16))||x-r<0||x+r>=44;}
function move(u,dx,dy){if(!wall(u.x+dx,u.y,.34))u.x+=dx; if(!wall(u.x,u.y+dy,.34))u.y+=dy;}
function step(s,aa){
 if(s.freeze>0){s.freeze--;return;}
 for(let i=0;i<6;i++){
  const u=s.u[i],a=aa[i],d=dirs.find(d=>d[0]===a.dir)||dirs[0];
  u.cd=Math.max(0,u.cd-1);u.lock=Math.max(0,u.lock-1);u.steal=Math.max(0,u.steal-1);
  const r=a.aim*Math.PI/180;u.fx=Math.cos(r);u.fy=Math.sin(r);move(u,d[1]*V,d[2]*V);
  if(a.kick&&s.b.owner===i&&u.cd===0&&u.lock===0){
   const b=s.b;b.owner=-1;b.x=u.x+u.fx*.59;b.y=u.y+u.fy*.59;
   if(wall(b.x,b.y,.22)){b.x=u.x;b.y=u.y;}
   b.vx=u.fx*14;b.vy=u.fy*14;u.cd=7;u.lock=6;
  }
 }
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
  const a=s.u[i],b=s.u[j];let dx=b.x-a.x,dy=b.y-a.y,d=hypot(dx,dy);
  if(d<.68&&d>1e-6){let p=(.68-d)/2/d; const ax=a.x-dx*p,ay=a.y-dy*p,bx=b.x+dx*p,by=b.y+dy*p;
   if(!wall(ax,ay,.34)){a.x=ax;a.y=ay;}if(!wall(bx,by,.34)){b.x=bx;b.y=by;}}
 }
 const b=s.b;
 if(b.owner>=0){const u=s.u[b.owner];b.x=u.x+.62*u.fx;b.y=u.y+.62*u.fy;if(wall(b.x,b.y,.22)){b.x=u.x;b.y=u.y;}b.vx=0;b.vy=0;}
 else{
  for(let k=0;k<4;k++){
   b.x+=b.vx/80;b.y+=b.vy/80;
   if(b.y>=10.5&&b.y<=15.5&&(b.x<=1||b.x>=43)){s.goal=true;return;}
   if(wall(b.x,b.y,.22)){
    let px=b.x-b.vx/80,py=b.y-b.vy/80;
    if(wall(b.x,py,.22)){b.x=px;b.vx=-b.vx*.72;}
    if(wall(px,b.y,.22)){b.y=py;b.vy=-b.vy*.72;}
    if(wall(b.x,b.y,.22)){b.x=px;b.y=py;b.vx=-b.vx*.72;b.vy=-b.vy*.72;}
   }
  }
  b.vx*=.97;b.vy*=.97;
 }
 let best=-1,bd=1e9;
 for(let i=0;i<6;i++){const u=s.u[i];if(u.lock>0||u.steal>0)continue;if(b.owner>=0&&u.team===s.u[b.owner].team)continue;
  let d=hypot(b.x-u.x,b.y-u.y);if(d<bd){bd=d;best=i;}}
 if(best>=0&&((b.owner<0&&bd<.82)||(b.owner>=0&&bd<.5))){if(b.owner>=0)s.u[b.owner].steal=4;b.owner=best;b.vx=0;b.vy=0;}
}
function direction(u,x,y){
 let best=dirs[0],bd=hypot(u.x-x,u.y-y);
 for(const d of dirs.slice(1)){const xx=u.x+d[1]*V,yy=u.y+d[2]*V;if(wall(xx,yy,.34))continue;
 let dd=hypot(xx-x,yy-y);if(dd<bd){bd=dd;best=d;}}
 return best;
}
function path(b,n=75){
 let x=b.x,y=b.y,vx=b.vx,vy=b.vy,out=[];
 for(let f=1;f<=n;f++){
  for(let k=0;k<4;k++){
   x+=vx/80;y+=vy/80;
   if(y>=10.5&&y<=15.5&&(x<=1||x>=43)){out.push([x,y,f/20]);return out;}
   if(wall(x,y,.22)){
    let px=x-vx/80,py=y-vy/80;
    if(wall(x,py,.22)){x=px;vx=-vx*.72;}
    if(wall(px,y,.22)){y=py;vy=-vy*.72;}
    if(wall(x,y,.22)){x=px;y=py;vx=-vx*.72;vy=-vy*.72;}
   }
  }vx*=.97;vy*=.97;out.push([x,y,f/20]);
 }return out;
}
function intercept(u,track){
 for(const p of track){let dx=Math.abs(u.x-p[0]),dy=Math.abs(u.y-p[1]);let time=(Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy)-.7)/3.15;
  if(time<=p[2]&&p[2]*20>=u.lock)return [p[0],p[1],p[2]];}
 const p=track[track.length-1];return [p[0],p[1],hypot(u.x-p[0],u.y-p[1])/3.15];
}
// Shot evaluation includes finite ball range and several opponent reaction models.
function shot(s,i,quick=false){
 const u=s.u[i],sg=u.team===0?1:-1,gx=sg===1?43:1,opp=s.u.filter(v=>v.team!==u.team);
 let best={val:-100,a:angle(gx-u.x,13-u.y)};
 if(Math.abs(gx-u.x)>23.7)return best;
 for(let gy=10.65;gy<=15.4;gy+=quick?.8:.4){
  const a=angle(gx-u.x,gy-u.y),r=a*Math.PI/180,fx=Math.cos(r),fy=Math.sin(r);
  const tr=path({x:u.x+fx*.59,y:u.y+fy*.59,vx:14*fx,vy:14*fy},100);
  const last=tr[tr.length-1];if(Math.abs(last[0]-gx)>.3||last[1]<10.5||last[1]>15.5)continue;
  let staticMargin=9,reachMargin=9,velMargin=9;
  for(const e of opp){
   for(const p of tr){
    const t=p[2],dist=hypot(e.x-p[0],e.y-p[1]);
    staticMargin=Math.min(staticMargin,dist-.82);
    reachMargin=Math.min(reachMargin,dist-.82-3.15*Math.max(0,t-.18));
    const et=Math.min(t,.85),px=e.x+(e.vx||0)*et,py=e.y+(e.vy||0)*et;
    velMargin=Math.min(velMargin,hypot(px-p[0],py-p[1])-.82);
   }
  }
  let val=1.5*Math.min(staticMargin,1.4)+1.2*Math.min(velMargin,1.4)+.75*Math.min(reachMargin,1)-last[2]*.13;
  if(staticMargin<-.15)val-=2;
  if(val>best.val)best={val,a,reach:reachMargin,static:staticMargin,vel:velMargin};
 }
 return best;
}
function carry(s,i){
 const u=s.u[i],sg=u.team===0?1:-1,gx=sg===1?43:1,opp=s.u.filter(e=>e.team!==u.team);
 const sh=shot(s,i);
 let near=Math.min(...opp.map(e=>hypot(e.x-u.x,e.y-u.y)));
 const isDeep=sg*(u.x-(sg===1?1:43))<13;
 if(isDeep&&near<5&&u.cd<=1){
  let pass=null;
  for(let j=u.team*3;j<u.team*3+3;j++)if(j!==i){
   const v=s.u[j],dx=v.x-u.x,dy=v.y-u.y,dist=hypot(dx,dy);
   if(dist<3||dist>18||sg*dx<2)continue;
   const aa=angle(dx,dy),r=aa*Math.PI/180;let margin=10;
   for(const e of opp){const ex=e.x-u.x,ey=e.y-u.y,along=ex*Math.cos(r)+ey*Math.sin(r);
    if(along>0&&along<dist+1)margin=Math.min(margin,Math.abs(ex*Math.sin(r)-ey*Math.cos(r))-.82-along*.12);}
   if(margin>.35&&(!pass||margin>pass.margin))pass={a:aa,margin};
  }
  if(pass)return act('N',pass.a,true);
  if(u.index===0){
   let clearance=null;
   for(const degrees of [-65,-45,-25,0,25,45,65]){
    const aa=(sg===1?degrees:180-degrees)+360,r=aa*Math.PI/180;let margin=10;
    for(const e of opp){const dx=e.x-u.x,dy=e.y-u.y,along=dx*Math.cos(r)+dy*Math.sin(r);
     if(along>0&&along<15)margin=Math.min(margin,Math.abs(dx*Math.sin(r)-dy*Math.cos(r))-.82-along*.12);}
    const val=margin-Math.abs(degrees)*.008;
    if(!clearance||val>clearance.val)clearance={a:aa%360,val};
   }
   if(clearance.val>-.2)return act('N',clearance.a,true);
  }
 }
 if(u.cd<=1&&(sh.val>1.9||(sh.val>.15&&near<1.25)||(sh.val>.45&&Math.abs(gx-u.x)<6)))return act('N',sh.a,true);
 // Choose movement and ball shielding independently.  Short-horizon threats dominate progress.
 let best=-1e9,ba=act();
 const targetY=clamp(u.y,10.9,15.1);
 for(const d of dirs){
  const nx=u.x+d[1]*V*5,ny=u.y+d[2]*V*5;
  if(wall(nx,ny,.34))continue;
  for(let z=0;z<16;z++){
   const a=z*22.5,r=a*Math.PI/180,fx=Math.cos(r),fy=Math.sin(r);
   const bx=nx+.62*fx,by=ny+.62*fy;
   if(wall(bx,by,.22))continue;
   let val=sg*(nx-u.x)*2.9-(Math.abs(ny-targetY)-Math.abs(u.y-targetY))*.55;
   val-=Math.max(0,3-ny)*.8+Math.max(0,ny-23)*.8;
   for(const e of opp){
    const ed=hypot(nx-e.x,ny-e.y),ballD=hypot(bx-e.x,by-e.y);
    val-=Math.max(0,1.8-ed)*1.1;
    val-=Math.max(0,1.05-ballD)*6;
    // Threats can move toward the exposed ball during this window.
    let ex=e.x+(e.vx||0)*.18,ey=e.y+(e.vy||0)*.18;
    val-=Math.max(0,.9-hypot(bx-ex,by-ey))*4;
   }
   val+=sg*fx*.06;
   if(val>best){best=val;ba=act(d[0],a,false);}
  }
 }
 // Under pressure, find a safe forward pass rather than turning into a tackle.
 if(near<2.1&&u.cd<=1){
  for(let j=u.team*3;j<u.team*3+3;j++)if(j!==i){
   const v=s.u[j],dist=hypot(v.x-u.x,v.y-u.y);
   if(dist<3||dist>16||sg*(v.x-u.x)<1.5)continue;
   const a=angle(v.x-u.x,v.y-u.y),r=a*Math.PI/180;
   let margin=10;
   for(const e of opp){const dx=e.x-u.x,dy=e.y-u.y,along=dx*Math.cos(r)+dy*Math.sin(r);
    if(along>0&&along<dist+1){let perp=Math.abs(dx*Math.sin(r)-dy*Math.cos(r));margin=Math.min(margin,perp-.82-along/12*1.5);}}
   if(margin>.5)return act(ba.dir,a,true);
  }
 }
 return ba;
}
function policy(s,team,light=false){
 const ids=[team*3,team*3+1,team*3+2],sg=team===0?1:-1,gx=team===0?1:43,b=s.b;
 const owner=b.owner>=0?s.u[b.owner]:null;
 const tr=owner?null:path(b,65);
 const ip=ids.map(i=>tr?intercept(s.u[i],tr):[b.x,b.y,hypot(s.u[i].x-b.x,s.u[i].y-b.y)/3.15]);
 // A fixed keeper provides a reliable fallback, but may collect nearby balls.
 const keeper=ids[0];
 let candidates=ids.slice(1);if(Math.abs(b.x-gx)<8)candidates=ids;
 let chaser=candidates.reduce((a,c)=>ip[c-team*3][2]<ip[a-team*3][2]?c:a,candidates[0]);
 if(owner&&owner.team===team)chaser=b.owner;
 let out=[];
 for(const i of ids){
  const u=s.u[i];
  if(b.owner===i){out.push(carry(s,i));continue;}
  let tx,ty;
  if(i===keeper&&i!==chaser){
   tx=gx+sg*2.0;
   const depth=Math.max(1,Math.abs(b.x-gx));
   ty=clamp(13+(b.y-13)*Math.min(1,3/depth),10.7,15.3);
   if(!owner&&tr){
    const hit=tr.find(p=>Math.abs(p[0]-gx)<4.3&&p[1]>9.5&&p[1]<16.5);
    if(hit){tx=clamp(hit[0],gx===1?1.5:39.2,gx===1?4.8:42.5);ty=hit[1];}
   }
   if(owner&&owner.team!==team&&Math.abs(b.x-gx)<9){tx=gx+sg*2.6;ty=clamp(b.y,10.5,15.5);}
  }else if(i===chaser){
   if(owner&&owner.team!==team){
    tx=owner.x+owner.fx*.65;ty=owner.y+owner.fy*.65;
    // Lead a moving carrier without running behind their back.
    tx+=(owner.vx||0)*.12;ty+=(owner.vy||0)*.12;
   }else{[tx,ty]=ip[i-team*3];}
  }else if(owner&&owner.team===team){
   tx=clamp(owner.x+sg*6,4,40);ty=owner.y<13?18:8;
   if(Math.abs(owner.x-(team===0?43:1))<10){tx=owner.x+sg*1.5;ty=owner.y<13?14.8:11.2;}
  }else if(owner){
   tx=owner.x-sg*3;ty=clamp(owner.y+(owner.y<13?2:-2),7,19);
  }else{
   tx=clamp(b.x+sg*3,5,39);ty=b.y<13?17:9;
  }
  const d=direction(u,tx,ty),a=angle((team===0?43:1)-u.x,13-u.y);
  // A newly acquired ball can be shot on the next frame without a blind delay.
  let k=false,aim=a;
  if(hypot(u.x-b.x,u.y-b.y)<1.1&&(!owner||owner.team!==team)){
   const sh=shot(s,i,true);if(sh.val>2.1){k=true;aim=sh.a;}
  }
  out.push(act(d[0],aim,k));
 }
 return out;
}
const previousByTeam=[null,null];
function predictOpponent(s,team,style){
 if(style==='smart')return policy(s,team);
 const sg=team===0?1:-1,gx=team===0?43:1,b=s.b;
 const ids=[team*3,team*3+1,team*3+2];
 const nearest=ids.reduce((a,c)=>hypot(s.u[a].x-b.x,s.u[a].y-b.y)<hypot(s.u[c].x-b.x,s.u[c].y-b.y)?a:c);
 return ids.map(i=>{
  const u=s.u[i],a=angle(gx-u.x,13-u.y);
  if(b.owner===i)return act(direction(u,gx,13)[0],a,style==='rush'||hypot(gx-u.x,13-u.y)<(style==='dribble'?5:20));
  if(style==='rush'||i===nearest)return act(direction(u,b.x,b.y)[0],a,true);
  if(i===team*3)return act(direction(u,team===0?3:41,clamp(b.y,10.6,15.4))[0],a,true);
  return act(direction(u,b.x-sg*3,b.y<13?17:9)[0],a,true);
 });
}
function plan(o){
 const previous=previousByTeam[o.yourTeam];
 const units=o.units.slice().sort((a,b)=>a.team-b.team||a.index-b.index);
 const u=units.map(v=>({x:v.x,y:v.y,team:v.team,index:v.index,fx:v.facing.x,fy:v.facing.y,cd:Math.round(v.kickCd*20),lock:Math.round(v.controlLock*20),steal:0,vx:0,vy:0}));
 if(previous&&previous.id===o.id&&o.frame>previous.frame&&o.frame-previous.frame<=20){
  const dt=(o.frame-previous.frame)/20;
  for(let i=0;i<6;i++){let vx=(u[i].x-previous.u[i].x)/dt,vy=(u[i].y-previous.u[i].y)/dt;if(hypot(vx,vy)<3.6){u[i].vx=vx;u[i].vy=vy;}}
 }
 previousByTeam[o.yourTeam]={id:o.id,frame:o.frame,u:u.map(v=>({...v}))};
 const opponents=units.filter(v=>v.team!==o.yourTeam);
 const touches=opponents.reduce((n,v)=>n+v.touches,0),kicks=opponents.reduce((n,v)=>n+v.kicks,0);
 const style=touches>=3&&kicks/touches>.72?'rush':touches>=3&&kicks/touches<.3?'dribble':'smart';
 const s={u,b:{...o.ball,owner:units.findIndex(v=>v.id===o.ball.owner)},freeze:Math.round((o.freeze||0)*20),goal:false};
 const windows=[];
 for(let f=0;f<20;f++){
  const own=policy(s,o.yourTeam),other=predictOpponent(s,1-o.yourTeam,style);
  const a=o.yourTeam===0?own:other,b=o.yourTeam===0?other:own;windows.push(own);
  if(!s.goal)step(s,a.concat(b));
  else break;
 }
 while(windows.length<20)windows.push([act(),act(),act()]);
 return {inputs:windows};
}
if(require.main===module){
 readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  try{const o=JSON.parse(line);console.log(JSON.stringify(plan(o)));}
  catch(e){console.error(e.stack);console.log(JSON.stringify({inputs:Array.from({length:20},()=>[act(),act(),act()])}));}
 });
}
module.exports={plan,policy,step,shot,path};
