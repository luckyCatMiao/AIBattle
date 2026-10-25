'use strict';
const sim = require('./simulation');
const previous = require('./agent_r1');
const readline = require('readline');
const D = [['N',0,0],['U',0,-1],['D',0,1],['L',-1,0],['R',1,0],['UL',-Math.SQRT1_2,-Math.SQRT1_2],['UR',Math.SQRT1_2,-Math.SQRT1_2],['DL',-Math.SQRT1_2,Math.SQRT1_2],['DR',Math.SQRT1_2,Math.SQRT1_2]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(x,y)=>((Math.atan2(y,x)*180/Math.PI)%360+360)%360;
function safe(x,y) {return x>=1.4&&x<=42.6&&y>=1.4&&y<=24.6&&!(x>=33.0&&y>=5.0&&y<=21.0);}
function local(g,team) {
 const units=g.units.map(u=>({...u,x:team?44-u.x:u.x,team:u.team===team?0:1,fx:team?-u.facing.x:u.facing.x,fy:u.facing.y}));
 return {units,us:units.filter(u=>u.team===0),them:units.filter(u=>u.team===1),ball:{...g.ball,x:team?44-g.ball.x:g.ball.x,vx:team?-g.ball.vx:g.ball.vx},n:g.teamSize};
}
function move(u,t,speed=3.15) {
 let best='N',bv=1e9;
 for(const [d,dx,dy] of D){const x=u.x+dx*speed*.05,y=u.y+dy*speed*.05;if(!safe(x,y))continue;
 let v=Math.hypot(t.x-x,t.y-y);if(d==='N')v+=.025;
 // Route around the forbidden rectangle rather than sticking at its edge.
 if(u.x>33.5&&t.x<33.5&&u.y<6&&t.y>6)v+=Math.max(0,x-33.45)*.3;
 if(v<bv){bv=v;best=d;}}
 return best;
}
function shot(u,s) {
 let best={score:-100,aim:0};
 for(let gy=10.65;gy<=15.36;gy+=.47){
 const dx=43-u.x,dy=gy-u.y,len=Math.hypot(dx,dy);if(len>24.7||dx<0)continue;
 const ux=dx/len,uy=dy/len;
 let x=u.x+ux*.59,y=u.y+uy*.59,v=11,min=10,blocked=false,t=0;
 for(let k=0;k<145;k++){
  x+=ux*v*.05;y+=uy*v*.05;t+=.05;v*=.978;
  if(x>=43)break;
  if(x<1.2||y<1.23||y>24.77){blocked=true;break;}
  for(const e of s.them){
   const dd=Math.hypot(x-e.x,y-e.y)-.82-3.15*Math.max(0,t-.72);
   min=Math.min(min,dd);
  }
  for(const a of s.us){if(a.id===u.id)continue;
   if(t<.65)min=Math.min(min,Math.hypot(x-a.x,y-a.y)-.86);
  }
 }
 if(x<43||blocked)continue;
 let score=min-.035*t;
 if(score>best.score)best={score,aim:angle(dx,dy),time:t};
 }
 return best;
}
function ballPath(s) {
 const path=[];let {x,y,vx,vy}=s.ball;
 for(let i=0;i<85;i++){
 path.push({x,y,t:i*.05});x+=vx*.05;y+=vy*.05;
 if(y<1.23){y=2.46-y;vy=-vy*.72;}if(y>24.77){y=49.54-y;vy=-vy*.72;}
 if(x<1.23){x=2.46-x;vx=-vx*.72;}if(x>42.77){x=85.54-x;vx=-vx*.72;}
 vx*=.978;vy*=.978;
 }
 return path;
}
function intercept(u,path){
 for(const p of path)if(safe(p.x,p.y)&&dist(u,p)<=3.15*p.t+.65)return {...p,cost:p.t};
 let p=path[path.length-1];
 if(!safe(p.x,p.y))p={x:Math.min(33.35,p.x),y:clamp(p.y,1.5,24.5)};
 return {...p,cost:dist(u,p)/3.15};
}
function carry(u,s,variant='main') {
 const sh=shot(u,s);const pressure=Math.min(...s.them.map(e=>dist(e,u)));
 const threshold=variant==='attack'?-2:variant==='wide'?.25:variant==='link'?-.45:-.12;
 if(sh.score>threshold || (u.x>30.5&&sh.score>-.85&&pressure<2))return {dir:'N',aim:sh.aim,kick:true};
 // Seek the box edge, then the flank when the central shooting lane is closed.
 let target={x:33.25,y:clamp(u.y,9,17)};
 if(u.x>31.5){
  const side=u.y<12.8?4.6:u.y>13.2?21.4:(s.them.find(e=>e.index===0)?.y>13?4.6:21.4);
  target={x:u.y<4.9||u.y>21.1?39.7:32.75,y:side};
 }
 // Clearance or forward pass when challenged, choosing an unobstructed lane.
 let pass=null;
 if(pressure<2.4||u.index===0&&s.n>1&&u.x<12||variant==='link'&&s.n>1){
  let bv=-1e9;
  const options=s.us.filter(a=>a.id!==u.id&&a.x>u.x+2).map(a=>({x:a.x,y:a.y,receiver:a}));
  if(u.x<28)for(const dy of [-10,-5,0,5,10])options.push({x:Math.min(33,u.x+(Math.abs(dy)===10?6:12)),y:clamp(u.y+dy,2,24)});
  for(const p of options){
   const len=dist(u,p);if(len<3||len>20)continue;const ux=(p.x-u.x)/len,uy=(p.y-u.y)/len;
   let margin=10,t=0,v=11,x=u.x+ux*.6,y=u.y+uy*.6;
   for(let k=0;k<100&&Math.hypot(x-u.x,y-u.y)<len-.5;k++){
    x+=ux*v*.05;y+=uy*v*.05;v*=.978;t+=.05;
    for(const e of s.them)margin=Math.min(margin,Math.hypot(x-e.x,y-e.y)-.82-3.15*Math.max(0,t-.35));
   }
   let val=3*Math.min(margin,2)+(p.x-u.x)*.16+(p.receiver?1.5:0)-Math.abs(p.y-13)*.02;
   if(variant==='link'){
    const ours=Math.min(...s.us.filter(a=>a.id!==u.id).map(a=>dist(a,p)/3.15));
    const theirs=Math.min(...s.them.map(a=>dist(a,p)/3.15));
    val+=clamp(theirs-ours,-3,3)*2;
    if(p.receiver)val+=Math.max(-2,shot(p.receiver,s).score)*.4;
   }
   if(val>bv){bv=val;pass={dir:'N',aim:angle(p.x-u.x,p.y-u.y),kick:true,margin};}
  }
  if(pass&&(pass.margin>-.2||pressure<1.2||u.x<10))return {dir:pass.dir,aim:pass.aim,kick:true};
 }
 let best=null,bv=-1e9;
 for(const [d,dx,dy] of D){
  const x=u.x+dx*.09135,y=u.y+dy*.09135;if(!safe(x,y))continue;
  let value=-Math.hypot(target.x-x,target.y-y);
  for(const e of s.them){const dd=Math.hypot(x-e.x,y-e.y);value-=1.4*Math.max(0,2.5-dd)**2;}
  if(value>bv){bv=value;best=d;}
 }
 // Face away from the closest tackler while carrying.
 const e=s.them.reduce((a,b)=>dist(a,u)<dist(b,u)?a:b);
 const aim=pressure<3?angle(u.x-e.x,u.y-e.y):angle(target.x-u.x,target.y-u.y);
 return {dir:best||'N',aim,kick:false};
}
function policy(g,team,kind='main'){
 const variant=kind;
 const s=local(g,team),b=s.ball,owner=s.units.find(u=>u.id===b.owner),our=owner&&owner.team===0;
 const path=ballPath(s);const targets=new Map();const eligible=s.us.filter(u=>s.n===1||u.index!==0);
 const picks=eligible.map(u=>({u,p:intercept(u,path)})).sort((a,b)=>a.p.cost-b.p.cost);
 let chaser=picks[0]?.u;
 if(owner&&!our){chaser=eligible.slice().sort((a,c)=>dist(a,b)-dist(c,b))[0];}
 // Goalkeeper meets a shot's actual trajectory instead of following its current y.
 for(const u of s.us){
  if(our&&u.id===owner.id)continue;
  if(s.n>1&&u.index===0){
   let gx=3.3,gy=13;
   if(b.vx<-.1){
    const hit=path.find(p=>p.x<=gx+.25);
    if(hit)gy=clamp(hit.y,10.65,15.35);else gy=clamp(13+(b.y-13)*.36,10.65,15.35);
   }else{
    gy=clamp(13+(b.y-13)*Math.min(.6,3.2/Math.max(4,b.x-1)),10.65,15.35);
   }
   if(b.x<10){gx=clamp(b.x-1.2,2,5);gy=clamp(b.y,9.8,16.2);}
   if(!owner){const p=intercept(u,path);if(p.cost<1.25&&p.x<12){gx=p.x;gy=p.y;}}
   targets.set(u.id,{x:gx,y:gy});continue;
  }
  if(u.id===chaser?.id&&!our){
   if(owner){targets.set(u.id,{x:Math.min(33.3,b.x),y:b.y});}
   else targets.set(u.id,intercept(u,path));
   continue;
  }
  const rank=eligible.findIndex(v=>v.id===u.id),r=Math.max(1,eligible.length);
  let x,y;
  if(our){
   x=clamp(b.x+5+(rank%2)*2,13,32.5);y=clamp(5.5+rank*(15/Math.max(1,r-1)),3,23);
   if(variant==='link'){
    x=clamp(b.x+7+(rank%2)*2,10,32.4);
    y=clamp(b.y+(rank%2?1:-1)*(4+Math.floor(rank/2)*3),3.5,22.5);
   }
  }
  else {
   x=clamp(b.x-3.2,8,29);y=clamp(b.y+(rank-(r-1)/2)*3.1,3,23);
   if(owner&&rank%2===0){x=clamp(owner.x-2.5,9,30);y=clamp(owner.y+(rank%3-1)*2.4,3,23);}
  }
  if(s.n>=4&&u.index===s.n-1){x=clamp(b.x-8,8,24);y=clamp(13+(b.y-13)*.5,7,19);}
  targets.set(u.id,{x,y});
 }
 return s.us.map(u=>{
  let a;
  if(our&&u.id===owner.id)a=carry(u,s,variant);
  else {
   const target=targets.get(u.id)||b;
   let aim=angle(43-u.x,13-u.y);
   // Pre-aim and kick immediately on unexpected possession, but do not
   // automatically give up the ball if no scoring/clearance lane exists.
   const sh=(dist(u,b)<1.5)?shot(u,s):null;
   let kick=!!sh&&sh.score>0;
   if(sh&&sh.score>-.1)aim=sh.aim;
   if(u.index===0&&s.n>1&&u.x<10){aim=angle(15, u.y<13?-6:6);kick=true;}
   a={dir:move(u,target),aim,kick};
  }
  if(team){a.aim=(180-a.aim+360)%360;a.dir=({L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'})[a.dir]||a.dir;}
  return a;
 });
}
function restore(o){
 const g=sim.createMatch({seed:o.seed||1,teamSize:o.teamSize,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 Object.assign(g,{frame:o.frame,tick:o.frame,score:o.score.slice(),half:o.half,golden:o.golden,freeze:Math.round((o.freeze||0)*20),goldenEnd:o.golden?o.frame+Math.round((o.goldenLeft||o.timeLeft)*20):0});
 if(o.stats)g.stats=o.stats.map(s=>({...s}));
 // Recover public-event consequences that are absent from publicUnit.
 let kickoffTeam=Math.abs(o.seed||1)%2;
 const locks=new Map();
 for(const e of o.events||[]){
  if(e.type==='goal')kickoffTeam=1-e.team;
  if(e.type==='half')kickoffTeam=1-kickoffTeam;
  if(e.type==='kickoff')locks.clear();
  if(e.type==='tackle'&&e.from)locks.set(e.from,{steal:Math.max(0,4-(o.frame-e.frame))});
  if(e.type==='foul'&&e.unit){const elapsed=Math.max(0,o.frame-e.frame-12);locks.set(e.unit,{foul:Math.max(0,20-elapsed),steal:Math.max(0,20-elapsed)});}
 }
 g.kickoffTeam=kickoffTeam;
 for(const u of g.units){const a=o.units.find(a=>a.id===u.id),l=locks.get(u.id)||{};if(a)Object.assign(u,a,{facing:{...a.facing},kickCd:Math.round(a.kickCd*20),controlLock:Math.round(a.controlLock*20),stealLock:l.steal||0,foulLock:l.foul||0});}
 g.ball={...o.ball};g.events=[];
 return g;
}
function enemyPolicy(g,team,model){
 if(model==='previous')return previous.policy(g,team);
 if(model==='mirror')return policy(g,team);
 const actions=policy(g,team,model==='attack'?'attack':'main');
 if(model!=='chase')return actions;
 const s=local(g,team);
 return actions.map((a,i)=>{
  const u=s.us[i];if(u.id===s.ball.owner||s.n>1&&i===0)return a;
  const d=move(u,{x:Math.min(33.2,s.ball.x),y:clamp(s.ball.y,1.5,24.5)});
  return {...a,dir:team?({L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'})[d]||d:d};
 });
}
function plan(o,model,variant='main'){
 const g=restore(o),out=[];
 for(let i=0;i<20;i++){
  const a=variant==='previous'?previous.policy(g,o.yourTeam):policy(g,o.yourTeam,variant),enemy=enemyPolicy(g,1-o.yourTeam,model);out.push(a);
  for(const u of g.units)u.held=(u.team===o.yourTeam?a:enemy)[u.index];sim.step(g);
 }
 return out;
}
function evaluate(g,team){
 const s=local(g,team),b=s.ball,owner=s.units.find(u=>u.id===b.owner);
 let v=(g.score[team]-g.score[1-team])*1000+.18*(b.x-22)-8*(g.stats[team].fouls-g.stats[1-team].fouls);
 if(owner){v+=(owner.team===0?1:-1)*(4+.12*(owner.team===0?owner.x:44-owner.x));
  if(owner.team===0){const sh=shot(owner,s);v+=Math.max(0,sh.score+1)*2;}
 }else{
  const p=ballPath(s),a=Math.min(...s.us.map(u=>intercept(u,p).cost)),e=Math.min(...s.them.map(u=>dist(u,b)/3.15));
  v+=clamp(e-a,-2,2)*1.5;
 }
 const k=s.us[0];if(s.n>1)v-=Math.max(0,dist(k,{x:3.3,y:13})-4)*.12;
 return v;
}
function guardWindow(o,inputs){
 const bounds=o.units.filter(u=>u.team===o.yourTeam).sort((a,b)=>a.index-b.index).map(u=>{
  const x=o.yourTeam?44-u.x:u.x;return {xl:x,xh:x,yl:u.y,yh:u.y};
 });
 return inputs.map(frame=>frame.map((a,i)=>{
  let d=o.yourTeam?({L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'})[a.dir]||a.dir:a.dir;
  const p=bounds[i],v=D.find(v=>v[0]===d);
  function next(dx,dy){return {xl:p.xl+Math.min(dx*.09135,dx*.1575),xh:p.xh+Math.max(dx*.09135,dx*.1575),yl:p.yl+Math.min(dy*.09135,dy*.1575),yh:p.yh+Math.max(dy*.09135,dy*.1575)};}
  let q=next(v[1],v[2]);
  if(q.xh>=32.75&&q.yh>=4.75&&q.yl<=21.25){
   const options=[['N',0,0],...D.filter(v=>v[1]<=0)];
   let best=null,bv=Infinity;
   for(const opt of options){const z=next(opt[1],opt[2]);if(z.xh>=32.75&&z.yh>=4.75&&z.yl<=21.25)continue;
    const cost=(opt[1]-v[1])**2+(opt[2]-v[2])**2;if(cost<bv){bv=cost;best=opt;}}
   if(best){d=best[0];q=next(best[1],best[2]);}else {d='L';q=next(-1,0);}
  }
  Object.assign(p,q);
  if(o.yourTeam)d=({L:'R',R:'L',UL:'UR',UR:'UL',DL:'DR',DR:'DL'})[d]||d;
  return {...a,dir:d};
 }));
}
function decide(o){
 const candidates=[plan(o,'previous','previous'),plan(o,'mirror'),plan(o,'attack'),plan(o,'chase'),plan(o,'mirror','attack'),plan(o,'mirror','wide'),plan(o,'previous'),...(o.teamSize>1?[plan(o,'mirror','link'),plan(o,'chase','link')]:[])].map(w=>guardWindow(o,w));
 let best=candidates[0],bestV=-Infinity;
 for(let c=0;c<candidates.length;c++){
  const values=[];
  for(const model of ['previous','attack','chase']){
   const g=restore(o);let total=0;
   for(let f=0;f<50&&g.status==='playing';f++){
    const a=f<20?candidates[c][f]:policy(g,o.yourTeam),b=enemyPolicy(g,1-o.yourTeam,model);
    for(const u of g.units)u.held=(u.team===o.yourTeam?a:b)[u.index];sim.step(g);
    if(f===19)total+=evaluate(g,o.yourTeam)*.25;
   }
   values.push(total+evaluate(g,o.yourTeam));
  }
  const v=.65*Math.min(...values)+.35*values.reduce((a,b)=>a+b,0)/values.length-(c===0?0:.08);
  if(v>bestV){bestV=v;best=candidates[c];}
 }
 return {inputs:best};
}
if(require.main===module){
 readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  try{const o=JSON.parse(line);process.stdout.write(JSON.stringify(decide(o))+'\n');}
  catch(e){process.stderr.write(String(e.stack)+'\n');process.exit(1);}
 });
}
module.exports={decide,policy,restore,local,shot};
