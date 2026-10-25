'use strict';
const sim = require('./simulation');
const readline = require('readline');
const D = {N:[0,0], U:[0,-1], D:[0,1], L:[-1,0], R:[1,0], UL:[-Math.SQRT1_2,-Math.SQRT1_2], UR:[Math.SQRT1_2,-Math.SQRT1_2], DL:[-Math.SQRT1_2,Math.SQRT1_2], DR:[Math.SQRT1_2,Math.SQRT1_2]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(x,y)=>(Math.atan2(y,x)*180/Math.PI+360)%360;
const xy=(u,t)=>({x:t?44-u.x:u.x,y:u.y});
function legal(x,y,t,margin=.7){return x>=1.36&&x<=42.64&&y>=1.36&&y<=24.64&&!( (t? x<=10+margin:x>=34-margin)&&y>=6-margin&&y<=20+margin);}
function move(u,target,t,speed=3.15){
 let best='N',score=1e9;
 for(const [k,v] of Object.entries(D)){
  const x=u.x+v[0]*speed*.05,y=u.y+v[1]*speed*.05;
  if(!legal(x,y,t))continue;
  let s=Math.hypot(x-target.x,y-target.y);
  if(s<score){score=s;best=k;}
 }
 return best;
}
function worldTarget(p,t){return {x:t?44-p.x:p.x,y:p.y};}
function shot(u,g,t){
 const p=xy(u,t), foes=g.units.filter(v=>v.team!==t).map(v=>({...xy(v,t),index:v.index}));
 let best={quality:-100,y:13,aim:0};
 if(p.x<19||p.y<3||p.y>23)return best;
 for(let gy=10.65;gy<=15.36;gy+=.39){
  let dx=43.08-p.x,dy=gy-p.y,len=Math.hypot(dx,dy),fx=dx/len,fy=dy/len;
  let s=.59,v=11,min=10,tt=0;
  for(let f=1;f<125&&s<len;f++){
   s+=v*.05;v*=.978;tt=f*.05;
   const x=p.x+fx*s,y=p.y+fy*s;
   for(const e of foes){
    const radius=e.index===0&&x>=34&&e.x>=34&&v>=4.5?1.35:.82;
    const reach=3.15*Math.max(0,tt-.7);
    const margin=Math.hypot(x-e.x,y-e.y)-radius-reach;
    min=Math.min(min,margin);
   }
  }
  let q=min-.018*len;
  if(s<len)q-=10;
  if(q>best.quality)best={quality:q,y:gy,aim:angle((t?-1:1)*dx,dy),time:tt};
 }
 return best;
}
function trajectory(g){
 const out=[];let b={...g.ball};
 for(let i=0;i<65;i++){
  out.push({x:b.x,y:b.y,t:i*.05});
  b.x+=b.vx*.05;b.y+=b.vy*.05;
  if(b.x<1.25||b.x>42.75){b.x=clamp(b.x,1.25,42.75);b.vx*=-.72;}
  if(b.y<1.25||b.y>24.75){b.y=clamp(b.y,1.25,24.75);b.vy*=-.72;}
  b.vx*=.978;b.vy*=.978;
 }
 return out;
}
function intercept(u,path,t){
 for(const p of path)if(legal(p.x,p.y,t,.4)&&dist(u,p)<=3.15*p.t+.65)return p;
 const p=path[path.length-1];
 return {x:t?Math.max(10.5,p.x):Math.min(33.5,p.x),y:p.y};
}
function policy(g,t,opts={}){
 const mine=g.units.filter(u=>u.team===t),foes=g.units.filter(u=>u.team!==t),n=mine.length;
 const b=g.ball,owner=g.units.find(u=>u.id===b.owner),bp=xy(b,t),friendly=owner&&owner.team===t;
 const path=!owner?trajectory(g):null;
 const ranked=mine.map(u=>({u,cost:dist(u,owner?b:intercept(u,path,t))+(u.index===0&&n>1?9:0)})).sort((a,b)=>a.cost-b.cost);
 const chasers=new Set(ranked.slice(0,n>=4?2:1).map(o=>o.u.id));
 const result=[];
 for(const u of mine){
  const p=xy(u,t);let target,aim=null,kick=false;
  if(owner&&owner.id===u.id){
   const sh=shot(u,g,t);
   const nearest=foes.reduce((a,e)=>dist(u,e)<dist(u,a)?e:a,foes[0]);
   const pressure=dist(u,nearest);
   if((n===1&&p.x>19)||sh.quality>.05||(p.x>32.4&&p.y>7&&p.y<19)||(p.x>26&&pressure<1.35&&sh.quality>-.8)){
    aim=sh.aim;kick=true;target=worldTarget({x:Math.min(33.25,p.x+.2),y:p.y},t);
   }else{
    let best=-1e9,chosen='N',face=0;
    // Move towards the shooting edge while keeping the ball on the protected side.
    const goalY=clamp(p.y,10.9,15.1);
    for(const [dir,v] of Object.entries(D)){
     const nx=u.x+v[0]*.09135,ny=u.y+v[1]*.09135;
     if(!legal(nx,ny,t,.45))continue;
     const q=xy({x:nx,y:ny},t);
     let score=-Math.hypot(q.x-33.25,(q.y-goalY)*1.2);
     let close=100;for(const e of foes)close=Math.min(close,Math.hypot(nx-e.x,ny-e.y));
     score+=Math.min(close,3)*.55;
     if(score>best){best=score;chosen=dir;}
    }
    const v=D[chosen];
    aim=pressure<3?angle(u.x-nearest.x,u.y-nearest.y):angle((t?-1:1),clamp(13-p.y,-1,1)*.1);
    // Escape pressure through a safe forward pass, preferring teammates over long clearances.
    if(pressure<2.15&&u.kickCd<=0){
     let pass=null,ps=-1e9;
     for(const mate of mine){
      if(mate===u)continue;const mp=xy(mate,t),dd=dist(u,mate);
      if(dd<3||dd>18||mp.x<p.x-5)continue;
      const tx=mate.x+(t?-1:1)*1.0,ty=mate.y;
      let margin=10;
      for(const e of foes){
       const ex=e.x-u.x,ey=e.y-u.y,dx=tx-u.x,dy=ty-u.y;
       const a=clamp((ex*dx+ey*dy)/(dx*dx+dy*dy),0,1);
       margin=Math.min(margin,Math.hypot(e.x-u.x-a*dx,e.y-u.y-a*dy)-.82-1.6*a*dd/9);
      }
      const val=(mp.x-p.x)*.2+margin;
      if(margin>.35&&val>ps){pass={tx,ty};ps=val;}
     }
     if(pass){aim=angle(pass.tx-u.x,pass.ty-u.y);kick=true;}
     else if(pressure<1.1&&p.x<23){aim=angle((t?-1:1)*10,(p.y<13?-5:5));kick=true;}
    }
    result[u.index]={dir:chosen,aim,kick};continue;
   }
  }else if(u.index===0&&n>1){
   let gx=7.5,gy;
   if(!owner&&((t===0&&b.vx<-.2)||(t===1&&b.vx>.2))){
    const vx=t?-b.vx:b.vx;const hit=(gx-bp.x)/vx;
    gy=bp.y+b.vy*Math.max(0,hit);
    if(bp.x<11){
     target=intercept(u,path,t);
     if(xy(target,t).x>10)target=null;
    }
   }else gy=13+(bp.y-13)*2.5/Math.max(4,bp.x-1);
   if(!target)target=worldTarget({x:gx,y:clamp(gy,10.65,15.35)},t);
   if(owner&&owner.team!==t&&bp.x<11)target={x:b.x,y:b.y};
  }else if(chasers.has(u.id)&&!friendly){
   if(owner){
    // Approach the ball rather than the carrier's center.
    target={x:b.x,y:b.y};
   }else target=intercept(u,path,t);
  }else{
   const rank=ranked.findIndex(v=>v.u===u);
   let tx,ty;
   if(friendly){
    tx=clamp(bp.x+4+(rank%2)*2,16,32.6);
    const side=(u.index%2?1:-1);
    ty=clamp(bp.y+side*(4+(rank%2)*2),5,21);
    if(n>=4&&rank===n-1){tx=clamp(bp.x-8,12,22);ty=13;}
   }else{
    tx=clamp(bp.x-3.5-rank*1.5,7,29);
    ty=clamp(13+(bp.y-13)*.65+(u.index%2?1:-1)*(1.8+rank*.7),6,20);
    if(n>=3&&rank===n-1){tx=clamp(bp.x-9,6,17);ty=clamp(bp.y,10,16);}
   }
   target=worldTarget({x:tx,y:ty},t);
  }
  let dir=move(u,target,t,owner&&owner.id===u.id?1.827:3.15);
  if(aim===null){
   const sh=shot(u,g,t);
   aim=sh.quality>-1||(n===1&&p.x>=19)?sh.aim:angle((t?-1:1)*16,clamp(13-u.y,-6,6));
   kick=(n===1&&p.x>19)||sh.quality>-.4||p.x>27||(p.x<20&&foes.some(e=>dist(u,e)<1.8));
  }
  result[u.index]={dir,aim,kick};
 }
 return result;
}
function restore(o){
 const g=sim.createMatch({seed:o.seed,teamSize:o.teamSize,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 for(const k of ['frame','tick','status','phase','score','half','golden'])if(o[k]!==undefined)g[k]=o[k];
 g.freeze=Math.round((o.freeze||0)*20);g.goldenEnd=g.frame+Math.round((o.goldenLeft||20)*20);
 g.ball={...o.ball};g.events=[];g.kickoffTeam=Math.abs(o.seed)%2;
 for(const u of g.units){const v=o.units.find(v=>v.id===u.id);Object.assign(u,v);u.facing={...v.facing};u.kickCd=Math.round(v.kickCd*20);u.controlLock=Math.round(v.controlLock*20);u.stealLock=0;u.foulLock=0;}
 return g;
}
function act(o){
 const g=restore(o),out=[];
 for(let f=0;f<20;f++){
  const us=policy(g,o.yourTeam),them=policy(g,1-o.yourTeam);
  out.push(us);
  for(const u of g.units)u.held=(u.team===o.yourTeam?us:them)[u.index];
  sim.step(g);
 }
 return {inputs:out};
}
module.exports={act,policy,restore,shot};
if(require.main===module){
 const rl=readline.createInterface({input:process.stdin});
 rl.on('line',line=>{try{const o=JSON.parse(line);process.stdout.write(JSON.stringify(act(o))+'\n');}catch(e){process.stderr.write(String(e.stack)+'\n');process.exit(1);}});
}
