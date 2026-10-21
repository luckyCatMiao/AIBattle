'use strict';
const WIDTH=1280, HEIGHT=840, DT=.05, MAX_UNITS=40;
const TYPES={
 worker:{name:'采矿机',cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},
 rifle:{name:'步兵',cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},
 tank:{name:'坦克',cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},
 raider:{name:'突击车',cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}
};
const COLORS=['#68ead1','#ff9b71','#a8a0ff','#78c5ff','#e9cf75','#ed93cf','#a6d97e','#e6e7ed'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function createMatch({id='test',players,seed=1}){
 if(!Array.isArray(players)||players.length<2||players.length>8)throw Error('支持 2–8 名选手');
 const g={id,seed,now:0,tick:0,status:'ready',paused:false,winner:null,reason:'',nextId:1,players:[],units:[],bases:[],mines:[],nodes:[],events:[],eventId:0};
 players.forEach((p,i)=>{
  const a=Math.PI+i*Math.PI*2/players.length;
  const x=WIDTH/2+Math.cos(a)*470,y=HEIGHT/2+Math.sin(a)*290;
  g.players.push({id:i,name:String(p.name||'选手 '+(i+1)).slice(0,32),kind:['human','bot','api'].includes(p.kind)?p.kind:'api',color:COLORS[i],credits:260,level:0,alive:true,kills:0,damage:0,mined:0,controlTime:0,repairAt:-30,botAt:0,rally:{x:x+(WIDTH/2-x)*.17,y:y+(HEIGHT/2-y)*.17}});
  g.bases.push({id:'b'+i,owner:i,type:'base',x,y,hp:1700,maxHp:1700,r:32,range:170,damage:24,cooldown:1,fireAt:0,queue:[]});
  g.mines.push({id:'m'+i,x:x+(WIDTH/2-x)*.2,y:y+(HEIGHT/2-y)*.2+65,ore:2200});
  for(let n=0;n<3;n++)spawn(g,i,'worker',x+38+n*15,y+40);
  for(let n=0;n<4;n++)spawn(g,i,'rifle',x+(WIDTH/2-x)*.14+(n%2)*20,y-30+Math.floor(n/2)*22);
 });
 for(let n=0;n<3;n++){
  const a=-Math.PI/2+n*Math.PI*2/3,x=WIDTH/2+Math.cos(a)*145,y=HEIGHT/2+Math.sin(a)*170;
  g.nodes.push({id:'n'+n,name:['北部中继站','东南中继站','西南中继站'][n],x,y,owner:null,capturer:null,progress:0,contested:false});
  g.mines.push({id:'m'+(players.length+n),x:x+46,y:y+38,ore:3200});
 }
 return g;
}
function spawn(g,owner,type,x,y){
 const t=TYPES[type],u={id:'u'+g.nextId++,owner,type,x:clamp(x,20,WIDTH-20),y:clamp(y,20,HEIGHT-20),hp:t.hp,maxHp:t.hp,r:t.r,angle:0,fireAt:0,order:{type:type==='worker'?'gather':'hold'},cargo:0,harvest:0};
 g.units.push(u);return u;
}
function event(g,type,data){g.events.push({id:++g.eventId,t:g.now,type,...data});}
function target(g,id){return g.units.find(u=>u.id===id&&u.hp>0)||g.bases.find(b=>b.id===id&&b.hp>0);}
function unitsOf(g,id){return g.units.filter(u=>u.owner===id&&u.hp>0);}
function command(g,owner,c){
 const p=g.players[owner];if(!p||!p.alive)throw Error('选手已被淘汰');
 if(!c||typeof c.type!=='string')throw Error('缺少指令类型');
 if(c.type==='start'){
  if(owner!==0||g.status!=='ready')throw Error('只有房主可以开始待命中的战役');
  g.status='playing';return;
 }
 if(g.status!=='playing')throw Error('战役尚未开始或已经结束');
 if(c.type==='pause'){
  if(owner!==0||g.players.some(q=>q.id!==owner&&q.kind!=='bot'))throw Error('仅单人战役可以暂停');
  g.paused=!g.paused;return;
 }
 if(g.paused)throw Error('请先继续战役');
 const base=g.bases.find(b=>b.owner===owner);
 if(c.type==='train'){
  const t=TYPES[c.unit];if(!t)throw Error('未知兵种');
  if(base.queue.length>=6)throw Error('生产队列已满');
  if(unitsOf(g,owner).length+base.queue.length>=MAX_UNITS)throw Error('达到 40 单位上限');
  if(p.credits<t.cost)throw Error('矿晶不足');
  p.credits-=t.cost;base.queue.push({type:c.unit,remaining:t.build,total:t.build});return;
 }
 if(c.type==='upgrade'){
  const cost=180+p.level*120;
  if(p.level>=2)throw Error('武器已升满');if(p.credits<cost)throw Error('矿晶不足');
  p.credits-=cost;p.level++;event(g,'upgrade',{owner,x:base.x,y:base.y});return;
 }
 if(c.type==='repair'){
  if(p.credits<100)throw Error('矿晶不足');if(g.now-p.repairAt<30)throw Error('修复冷却中');
  if(base.hp>=base.maxHp)throw Error('基地无需修复');
  p.credits-=100;p.repairAt=g.now;base.hp=Math.min(base.maxHp,base.hp+400);event(g,'repair',{owner,x:base.x,y:base.y});return;
 }
 if(c.type==='rally'){
  point(c);p.rally={x:c.x,y:c.y};return;
 }
 if(!['move','attackMove','attack','gather','stop'].includes(c.type))throw Error('未知指令');
 if(!Array.isArray(c.units)||!c.units.length||c.units.length>MAX_UNITS)throw Error('请指定 1–40 个单位');
 const ids=[...new Set(c.units)],us=ids.map(id=>g.units.find(u=>u.id===id&&u.hp>0));
 if(us.some(u=>!u||u.owner!==owner))throw Error('只能指挥自己的存活单位');
 let aim;
 if(c.type==='move'||c.type==='attackMove')point(c);
 if(c.type==='attack'){
  aim=target(g,c.target);if(!aim||aim.owner===owner)throw Error('攻击目标无效');
 }
 if(c.type==='gather'){
  aim=g.mines.find(m=>m.id===c.target&&m.ore>0);
  if(!aim||us.some(u=>u.type!=='worker'))throw Error('请选择采矿机与未枯竭的矿脉');
 }
 const cols=Math.ceil(Math.sqrt(us.length));
 us.forEach((u,i)=>{
  if(c.type==='stop')u.order={type:'hold'};
  else if(aim)u.order={type:c.type,target:aim.id};
  else u.order={type:c.type,x:clamp(c.x+((i%cols)-(cols-1)/2)*24,18,WIDTH-18),y:clamp(c.y+(Math.floor(i/cols)-(Math.ceil(us.length/cols)-1)/2)*24,18,HEIGHT-18)};
 });
}
function point(c){if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.x>WIDTH||c.y<0||c.y>HEIGHT)throw Error('坐标超出地图');}
function travel(u,p,speed,dt,stop=0){
 const dx=p.x-u.x,dy=p.y-u.y,d=Math.hypot(dx,dy);if(d<=stop)return true;
 const step=Math.min(speed*dt,d-stop);u.x+=dx/d*step;u.y+=dy/d*step;u.angle=Math.atan2(dy,dx);return d-step<=stop+.1;
}
function fire(g,u,v){
 const p=g.players[u.owner],stats=u.type==='base'?u:TYPES[u.type];
 if(u.fireAt>g.now)return;u.fireAt=g.now+stats.cooldown;
 const counter={rifle:'raider',tank:'rifle',raider:'tank'};
 const deal=(victim,mult=1)=>{
  if(victim.hp<=0)return;
  const amount=stats.damage*(1+p.level*.2)*(counter[u.type]===victim.type?1.5:1)*mult;
  const actual=Math.min(victim.hp,amount);victim.hp-=amount;p.damage+=actual;
  if(victim.hp<=0){p.kills+=victim.type==='base'?5:1;event(g,'explosion',{x:victim.x,y:victim.y,big:victim.type==='base'});}
 };
 u.angle=Math.atan2(v.y-u.y,v.x-u.x);event(g,'shot',{x:u.x,y:u.y,tx:v.x,ty:v.y,owner:u.owner,weapon:u.type});deal(v);
 if(u.type==='tank')for(const other of g.units)if(other!==v&&other.owner!==u.owner&&other.hp>0&&dist(other,v)<36)deal(other,.4);
}
function worker(g,u,dt){
 if(u.order.type==='move'||u.order.type==='attackMove'){if(travel(u,u.order,TYPES.worker.speed,dt,4))u.order={type:'hold'};return;}
 if(u.order.type!=='gather')return;
 const base=g.bases[u.owner];
 if(u.returning||u.cargo>=20||(u.cargo>0&&!g.mines.some(m=>m.ore>0))){
  if(travel(u,base,TYPES.worker.speed,dt,base.r+12)){
   g.players[u.owner].credits+=u.cargo;g.players[u.owner].mined+=u.cargo;u.cargo=0;u.returning=false;
  }return;
 }
 let mine=g.mines.find(m=>m.id===u.order.target&&m.ore>0);
 if(!mine){mine=g.mines.filter(m=>m.ore>0).sort((a,b)=>dist(u,a)-dist(u,b))[0];if(!mine)return;u.order.target=mine.id;}
 if(travel(u,mine,TYPES.worker.speed,dt,19)){
  const amount=Math.min(mine.ore,6*dt,20-u.cargo);mine.ore-=amount;u.cargo+=amount;
  if(mine.ore<=0&&u.cargo>0)u.returning=true;
 }
}
function bot(g,p){
 if(g.now<p.botAt)return;p.botAt=g.now+2;
 const own=unitsOf(g,p.id),workers=own.filter(u=>u.type==='worker'),army=own.filter(u=>u.type!=='worker');
 const base=g.bases[p.id],queue=base.queue.map(q=>q.type),enemyBases=g.bases.filter(b=>b.owner!==p.id&&b.hp>0);
 if(!enemyBases.length)return;
 const closest=enemyBases.sort((a,b)=>dist(base,a)-dist(base,b))[0];
 try{
  if(base.hp<1050&&p.credits>150&&g.now-p.repairAt>=30)command(g,p.id,{type:'repair'});
  if(queue.length<3&&own.length+queue.length<MAX_UNITS){
   let type=workers.length+queue.filter(t=>t==='worker').length<5?'worker':army.length%5===3?'tank':army.length%5===4?'raider':'rifle';
   if(p.credits>=TYPES[type].cost)command(g,p.id,{type:'train',unit:type});
  }
  if(p.credits>400&&p.level<2)command(g,p.id,{type:'upgrade'});
 }catch{}
 for(const w of workers)if(w.order.type!=='gather')w.order={type:'gather'};
 if(!army.length)return;
 const danger=g.units.filter(u=>u.owner!==p.id&&u.hp>0&&dist(u,base)<250).sort((a,b)=>dist(base,a)-dist(base,b))[0];
 let destination;
 if(danger)destination=danger;
 else if(g.now>55&&army.length>=7||g.now>105&&army.length>=4)destination=closest;
 else destination=g.nodes.filter(n=>n.owner!==p.id).sort((a,b)=>dist(base,a)-dist(base,b))[0]||p.rally;
 command(g,p.id,{type:'attackMove',units:army.map(u=>u.id),x:destination.x,y:destination.y});
}
function step(g,dt=DT){
 if(g.status!=='playing'||g.paused)return;
 g.now+=dt;g.tick++;
 for(const p of g.players){
  if(!p.alive)continue;p.credits+=1.5*dt;
  if(p.kind==='bot')bot(g,p);
  const b=g.bases[p.id];
  if(b.queue.length){
   b.queue[0].remaining-=dt;
   if(b.queue[0].remaining<=0){const q=b.queue.shift(),u=spawn(g,p.id,q.type,b.x+Math.cos(p.id)*42,b.y+42);if(q.type!=='worker')u.order={type:'attackMove',...p.rally};event(g,'spawn',{x:u.x,y:u.y,owner:p.id});}
  }
 }
 const entities=[...g.units,...g.bases].filter(e=>e.hp>0);
 for(const u of entities){
  if(u.hp<=0||!g.players[u.owner].alive)continue;
  if(u.type==='worker'){worker(g,u,dt);continue;}
  const stats=u.type==='base'?u:TYPES[u.type];let enemy;
  if(u.order?.type==='attack'){enemy=target(g,u.order.target);if(!enemy)u.order={type:'hold'};}
  if(!enemy&&u.order?.type!=='move'){
   const aggro=u.type==='base'||u.order?.type==='hold'?stats.range:Math.max(stats.range,205);
   enemy=entities.filter(v=>v.owner!==u.owner&&v.hp>0&&g.players[v.owner].alive&&dist(u,v)<=aggro+v.r).sort((a,b)=>dist(u,a)-dist(u,b))[0];
  }
  if(enemy){
   if(dist(u,enemy)<=stats.range+enemy.r)fire(g,u,enemy);
   else if(u.type!=='base')travel(u,enemy,stats.speed,dt,stats.range+enemy.r-3);
  }else if(u.type!=='base'&&['move','attackMove'].includes(u.order.type)){
   if(travel(u,u.order,stats.speed,dt,4))u.order={type:'hold'};
  }
 }
 // Soft separation prevents stacks without turning small decorations into pathfinding traps.
 const live=g.units.filter(u=>u.hp>0);
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
  const a=live[i],b=live[j],d=dist(a,b),r=(a.r+b.r)*.84;
  if(d<r){const nx=d>.01?(b.x-a.x)/d:1,ny=d>.01?(b.y-a.y)/d:0,s=Math.min((r-d)*.3,2);a.x-=nx*s;a.y-=ny*s;b.x+=nx*s;b.y+=ny*s;}
 }
 for(const u of live){u.x=clamp(u.x,15,WIDTH-15);u.y=clamp(u.y,15,HEIGHT-15);}
 g.units=live;
 for(const b of g.bases)if(b.hp<=0&&g.players[b.owner].alive){
  g.players[b.owner].alive=false;b.queue=[];g.units=g.units.filter(u=>u.owner!==b.owner);
  for(const n of g.nodes)if(n.owner===b.owner){n.owner=null;n.progress=0;}
  event(g,'eliminated',{owner:b.owner});
 }
 for(const n of g.nodes){
  const occupiers=[...new Set(g.units.filter(u=>u.type!=='worker'&&dist(u,n)<65).map(u=>u.owner))];
  n.contested=occupiers.length>1;
  if(occupiers.length===1&&occupiers[0]!==n.owner){
   if(n.capturer!==occupiers[0]){n.capturer=occupiers[0];n.progress=0;}
   n.progress+=dt/8;
   if(n.progress>=1){n.owner=n.capturer;n.capturer=null;n.progress=0;event(g,'capture',{owner:n.owner,node:n.id,x:n.x,y:n.y});}
  }else if(!n.contested){n.progress=Math.max(0,n.progress-dt/5);if(!n.progress)n.capturer=null;}
  if(n.owner!==null&&g.players[n.owner].alive){g.players[n.owner].credits+=3*dt;g.players[n.owner].controlTime+=dt;}
 }
 const alive=g.players.filter(p=>p.alive);
 if(alive.length<=1){g.status='finished';g.winner=alive[0]?.id??null;g.reason='基地摧毁';}
 else if(g.now>=600){
  const ranked=alive.sort((a,b)=>score(g,b)-score(g,a));g.status='finished';
  g.winner=score(g,ranked[0])===score(g,ranked[1])?null:ranked[0].id;g.reason='10 分钟战役积分结算';
 }
 g.events=g.events.filter(e=>g.now-e.t<3).slice(-200);
}
function score(g,p){return Math.round(p.damage*.2+p.kills*35+p.mined*.1+p.controlTime*2+Math.max(0,g.bases[p.id].hp)*.1);}
function snapshot(g,owner=null){
 return {id:g.id,now:g.now,tick:g.tick,status:g.status,paused:g.paused,winner:g.winner,reason:g.reason,yourPlayer:owner,
  map:{width:WIDTH,height:HEIGHT},rules:{duration:600,unitCap:MAX_UNITS,baseIncome:1.5,nodeIncome:3,captureSeconds:8},types:TYPES,
  players:g.players.map(p=>({...p,credits:Math.floor(p.credits),score:score(g,p),population:unitsOf(g,p.id).length})),
  units:g.units,bases:g.bases,mines:g.mines,nodes:g.nodes,events:g.events};
}
module.exports={createMatch,command,step,snapshot,TYPES,DT,MAX_UNITS,spawn,score};
