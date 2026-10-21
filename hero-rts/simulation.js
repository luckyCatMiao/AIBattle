'use strict';
const catalog=require('./catalog');
const {heroes,units:types,buildings:buildingTypes,skills,techs,summons,rules}=catalog;
const DT=1/rules.hz,W=rules.width,H=rules.height;
const COLORS=['#73dcc1','#f48d75','#b6a1ff','#83c8ff','#edce78','#ec9fc9','#a8d584','#dfd9c9'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const definition=u=>heroes[u.type]||types[u.type]||summons[u.type]||buildingTypes[u.type];
const own=(g,o)=>g.units.filter(u=>u.owner===o&&u.hp>0);
const get=(g,id)=>g.units.find(u=>u.id===id&&u.hp>0)||g.buildings.find(b=>b.id===id&&b.hp>0);
const liveBuildings=(g,o,type)=>g.buildings.filter(b=>b.owner===o&&b.hp>0&&b.complete&&(!type||b.type===type));
function emit(g,type,data={}){g.events.push({id:++g.eventId,t:g.now,type,...data});}
function population(g,o){return own(g,o).reduce((s,u)=>s+(u.summoned?0:definition(u).pop||0),0)+g.buildings.filter(b=>b.owner===o&&b.hp>0).flatMap(b=>b.queue).reduce((s,q)=>s+(q.kind==='tech'?0:(heroes[q.type]||types[q.type])?.pop||0),0);}
function popCap(g,o){return Math.min(rules.popMax,liveBuildings(g,o).reduce((s,b)=>s+(buildingTypes[b.type].pop||0),0));}
function spawn(g,owner,type,x,y){
 const d=heroes[type]||types[type]||summons[type];if(!d)throw Error('未知单位');
 const u={id:'u'+g.nextId++,owner,type,hero:!!heroes[type],x:clamp(x,24,W-24),y:clamp(y,24,H-24),r:d.r,hp:d.hp,maxHp:d.hp,mana:d.mana||0,maxMana:d.mana||0,angle:0,level:1,xp:0,fireAt:0,cooldowns:{},statuses:{},shield:0,shieldUntil:0,casting:null,attack:null,order:{type:'hold'},cargo:{gold:0,wood:0}};
 if(owner>=0&&u.hero){const p=g.players[owner];let record=p.heroes.find(h=>h.type===type);if(!record){record={type,level:1,xp:0,dead:false,respawnAt:0,unitId:u.id};p.heroes.push(record);}record.unitId=u.id;record.dead=false;record.queued=false;u.level=record.level;u.xp=record.xp;u.maxHp+=120*(u.level-1);u.hp=u.maxHp;u.maxMana+=30*(u.level-1);u.mana=u.maxMana;}
 g.units.push(u);return u;
}
function addBuilding(g,owner,type,x,y,complete=true){
 const d=buildingTypes[type];if(!d)throw Error('未知建筑');
 const b={id:'b'+g.nextId++,owner,type,x,y,r:d.r,hp:complete?d.hp:d.hp*.1,maxHp:d.hp,complete,progress:complete?1:0,queue:[],fireAt:0,armor:'fortified',statuses:{},shield:0,shieldUntil:0,attack:null,rally:null};g.buildings.push(b);return b;
}
function createMatch({id='test',players,seed=1}={}){
 if(!Array.isArray(players)||players.length<2||players.length>8)throw Error('支持 2–8 方');
 const g={id,seed,now:0,tick:0,status:'ready',paused:false,winner:null,reason:'',nextId:1,eventId:0,players:[],units:[],buildings:[],resources:[],nodes:[],camps:[],projectiles:[],zones:[],events:[],map:{width:W,height:H,obstacles:[]}};
 players.forEach((v,i)=>{if(!v||!['human','api','bot'].includes(v.kind))throw Error('选手 kind 必须为 human、api 或 bot');if(v.hero&&!heroes[v.hero])throw Error('未知初始英雄');const a=Math.PI+i*Math.PI*2/players.length,x=W/2+Math.cos(a)*1270,y=H/2+Math.sin(a)*730;
  const ix=-Math.cos(a),iy=-Math.sin(a),px=-iy,py=ix,at=(f,s)=>({x:x+ix*f+px*s,y:y+iy*f+py*s});
  const p={id:i,name:String(v.name||'选手 '+(i+1)).slice(0,32),kind:v.kind,color:COLORS[i],gold:650,wood:250,tier:1,tech:{weapons:0,armor:0,gathering:0},heroes:[],alive:true,kills:0,damage:0,mined:0,controlTime:0,botAt:0,rally:at(230,0)};g.players.push(p);
  addBuilding(g,i,'townhall',x,y);for(const [t,f,s] of [['altar',10,-125],['barracks',125,100],['farm',-100,90]]){const pt=at(f,s);addBuilding(g,i,t,pt.x,pt.y);}
  for(const [kind,f,s,amount] of [['gold',0,210,12000],['wood',-65,-240,16000]]){const pt=at(f,s);g.resources.push({id:'res'+i+kind,kind,...pt,r:kind==='gold'?38:65,amount});}
  for(let n=0;n<5;n++){const pt=at(75,n*22-45),u=spawn(g,i,'worker',pt.x,pt.y);u.order={type:'gather',target:'res'+i+(n<3?'gold':'wood')};}
  for(let n=0;n<4;n++){const pt=at(230,60+n*26);spawn(g,i,'footman',pt.x,pt.y);}
  const pt=at(210,-30);spawn(g,i,v.hero||(i===0?'vanguard':Object.keys(heroes)[(i*3)%10]),pt.x,pt.y);
 });
 const obstacles=[{x:1010,y:390,w:210,h:330,kind:'forest'},{x:1980,y:1280,w:210,h:330,kind:'forest'},{x:1980,y:390,w:210,h:330,kind:'forest'},{x:1010,y:1280,w:210,h:330,kind:'forest'},{x:1470,y:490,w:260,h:110,kind:'rock'},{x:1470,y:1400,w:260,h:110,kind:'rock'},{x:1310,y:900,w:100,h:200,kind:'ruins'},{x:1790,y:900,w:100,h:200,kind:'ruins'}];
 g.map.obstacles=obstacles.filter(o=>!g.buildings.some(b=>b.type==='townhall'&&dist(b,{x:o.x+o.w/2,y:o.y+o.h/2})<390));
 const spots=[[900,1000],[2300,1000],[1600,280],[1600,1720],[1600,760],[1600,1240]];
 spots.forEach(([x,y],i)=>g.nodes.push({id:'n'+i,name:['西风圣坛','东月圣坛','北境圣坛','南林圣坛','日曜遗迹','月影遗迹'][i],x,y,r:105,owner:null,capturer:null,progress:0,contested:false}));
 [[750,480],[2450,1520],[2450,480],[750,1520]].forEach(([x,y],i)=>{
  if(g.buildings.some(b=>dist(b,{x,y})<230))return;
  const camp={id:'camp'+i,x,y,cleared:false};g.camps.push(camp);
  for(let j=0;j<3;j++){const u=spawn(g,-1,'sentinel',x+(j-1)*40,y+(j%2)*35);u.home={x:u.x,y:u.y};u.camp=camp.id;}
  g.resources.push({id:'wildgold'+i,kind:'gold',x:x+70,y:y-75,r:38,amount:8000});g.resources.push({id:'wildwood'+i,kind:'wood',x:x-100,y:y+85,r:60,amount:10000});
 });
 const boss=spawn(g,-1,'ancient',W/2,H/2);boss.home={x:boss.x,y:boss.y};boss.camp='boss';g.camps.push({id:'boss',x:W/2,y:H/2,cleared:false});
 return g;
}
function point(c){if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<20||c.y<20||c.x>W-20||c.y>H-20)throw Error('目标坐标必须在地图边界内');}
function pay(p,c){if(p.gold<c.gold||p.wood<c.wood)throw Error(`资源不足：需要 ${c.gold} 金 / ${c.wood} 木`);p.gold-=c.gold;p.wood-=c.wood;}
function validateSelection(g,o,ids){if(!Array.isArray(ids)||ids.length<1||ids.length>rules.unitCap)throw Error('请选择 1–100 个单位');const us=[...new Set(ids)].map(id=>g.units.find(u=>u.id===id&&u.hp>0));if(us.some(u=>!u||u.owner!==o))throw Error('只能指挥自己的存活单位');return us;}
function isBlocked(g,x,y,r=12,ignore){
 if(x<r+8||y<r+8||x>W-r-8||y>H-r-8)return true;
 if(g.map.obstacles.some(o=>x>o.x-r&&x<o.x+o.w+r&&y>o.y-r&&y<o.y+o.h+r))return true;
 const ignored=Array.isArray(ignore)?ignore:[ignore];return g.buildings.some(b=>b.hp>0&&!ignored.includes(b)&&dist(b,{x,y})<b.r+r+4);
}
function clearLine(g,a,b,r=8,ignore){
 if(b.x<r+8||b.y<r+8||b.x>W-r-8||b.y>H-r-8)return false;
 for(const o of g.map.obstacles){let lo=0,hi=1;for(const [start,end,min,max]of [[a.x,b.x,o.x-r,o.x+o.w+r],[a.y,b.y,o.y-r,o.y+o.h+r]]){const delta=end-start;if(Math.abs(delta)<1e-9){if(start<=min||start>=max){hi=-1;break;}}else{let t1=(min-start)/delta,t2=(max-start)/delta;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}}if(lo<=hi&&hi>=0&&lo<=1)return false;}
 const ignored=Array.isArray(ignore)?ignore:[ignore];return !g.buildings.some(v=>v.hp>0&&!ignored.includes(v)&&segmentDistance(v,a,b)<v.r+r+4);
}
function freePoint(g,pt,r=15){if(!isBlocked(g,pt.x,pt.y,r))return {x:pt.x,y:pt.y};for(let ring=1;ring<9;ring++)for(let i=0;i<12;i++){const a=i*Math.PI/6,p={x:clamp(pt.x+Math.cos(a)*ring*24,24,W-24),y:clamp(pt.y+Math.sin(a)*ring*24,24,H-24)};if(!isBlocked(g,p.x,p.y,r))return p;}return null;}
function command(g,owner,c){
 const p=g.players[owner];if(!p||!p.alive)throw Error('选手已被淘汰');if(!c||typeof c.type!=='string')throw Error('缺少命令类型');
 if(c.type==='start'){if(owner!==0||g.status!=='ready')throw Error('只有房主可开始待命战役');g.status='playing';return;}
 if(g.status!=='playing')throw Error('战役尚未开始或已结束');
 if(c.type==='pause'){if(owner!==0||g.players.some(q=>q.id!==owner&&q.kind!=='bot'))throw Error('仅单人对电脑战役可暂停');g.paused=!g.paused;return;}
 if(g.paused)throw Error('请先继续战役');
 if(c.type==='rally'){point(c);if(c.building){const b=g.buildings.find(b=>b.id===c.building&&b.owner===owner&&b.hp>0);if(!b)throw Error('无效建筑');b.rally={x:c.x,y:c.y};}else p.rally={x:c.x,y:c.y};return;}
 if(c.type==='train'||c.type==='summon'||c.type==='revive'){
  const type=c.type==='train'?c.unit:c.hero,d=c.type==='train'?types[type]:heroes[type];if(!d)throw Error('未知兵种或英雄');
  if(p.tier<d.tier)throw Error(`需要 ${d.tier} 级时代`);
  const b=c.building?liveBuildings(g,owner,d.producer).find(b=>b.id===c.building):liveBuildings(g,owner,d.producer).sort((a,b)=>a.queue.length-b.queue.length)[0];if(!b)throw Error('需要已完成的'+buildingTypes[d.producer].name);if(b.queue.length>=6)throw Error('该建筑队列已满');
  const rec=p.heroes.find(h=>h.type===type);
  if(c.type==='summon'&&(rec||p.heroes.length>=rules.heroCap))throw Error(rec?'此英雄已招募，可在阵亡后复活':'每方最多招募 5 名不同英雄');
  if(c.type==='revive'&&(!rec||!rec.dead||rec.queued||g.now<rec.respawnAt))throw Error('英雄未阵亡、已排队或仍在复活等待中');
  if(population(g,owner)+d.pop>popCap(g,owner))throw Error('人口不足，请建造农庄');
  if(own(g,owner).length+g.buildings.filter(b=>b.owner===owner).reduce((n,b)=>n+b.queue.filter(q=>q.kind!=='tech').length,0)>=rules.unitCap)throw Error('达到单位数量上限');
  const revive=c.type==='revive',price=revive?{gold:150+rec.level*40,wood:0}:d.cost;pay(p,price);
  if(c.type==='summon')p.heroes.push({type,unitId:null,level:1,xp:0,dead:false,queued:true,respawnAt:0});if(revive)rec.queued=true;
  const duration=revive?12+rec.level*2:d.build;b.queue.push({type,kind:c.type==='train'?'unit':revive?'revive':'hero',remaining:duration,total:duration});return;
 }
 if(c.type==='research'){
  const t=techs[c.tech];if(!t)throw Error('未知科技');if(p.tier<t.tier)throw Error(`需要 ${t.tier} 级时代`);
  const level=c.tech==='tier2'?(p.tier>=2?1:0):c.tech==='tier3'?(p.tier>=3?1:0):p.tech[c.tech]||0;
  if(level>=t.maxLevel||(c.tech==='weapons'||c.tech==='armor')&&level>=p.tier)throw Error('已达当前时代科技上限');
  if(g.buildings.some(b=>b.owner===owner&&b.queue.some(q=>q.kind==='tech'&&q.type===c.tech)))throw Error('该科技已在研究');
  if(t.requires&&!liveBuildings(g,owner,t.requires).length)throw Error('需要'+buildingTypes[t.requires].name);
  const b=liveBuildings(g,owner,t.building).sort((a,b)=>a.queue.length-b.queue.length)[0];if(!b)throw Error('需要'+buildingTypes[t.building].name);if(b.queue.length>=6)throw Error('研究队列已满');
  pay(p,{gold:t.cost.gold+level*70,wood:t.cost.wood+level*50});b.queue.push({type:c.tech,kind:'tech',remaining:t.build,total:t.build});return;
 }
 if(c.type==='build'){
  const us=validateSelection(g,owner,c.units),d=buildingTypes[c.building];if(!d)throw Error('未知建筑');if(us.some(u=>u.type!=='worker'))throw Error('建造需要农民');point(c);
  if(p.tier<d.tier)throw Error(`需要 ${d.tier} 级时代`);
  if(g.buildings.filter(b=>b.owner===owner&&b.hp>0).length>=40)throw Error('建筑上限为 40 座');
  if(isBlocked(g,c.x,c.y,d.r+12)||g.resources.some(r=>r.amount>0&&dist(r,c)<r.r+d.r+20)||g.nodes.some(n=>dist(n,c)<n.r+d.r)||g.units.some(u=>u.hp>0&&u.owner!==owner&&dist(u,c)<u.r+d.r))throw Error('此处不能建造：避开地形、建筑、资源、圣坛与敌军');
  pay(p,d.cost);const b=addBuilding(g,owner,c.building,c.x,c.y,false);for(const u of us){u.order={type:'build',target:b.id};u.casting=null;u.attack=null;u._path=null;}emit(g,'build',{x:b.x,y:b.y,owner,text:'开始建造'+d.name});return;
 }
 if(c.type==='cast'){cast(g,owner,c);return;}
 if(!['move','attackMove','attack','gather','stop','hold'].includes(c.type))throw Error('未知命令');
 const us=validateSelection(g,owner,c.units);let aim;
 if(['move','attackMove'].includes(c.type))point(c);
 if(c.type==='attack'){aim=get(g,c.target);if(!aim||aim.owner===owner)throw Error('无效攻击目标');}
 if(c.type==='gather'){aim=g.resources.find(r=>r.id===c.target&&r.amount>0);if(!aim||us.some(u=>u.type!=='worker'))throw Error('请用农民选择未耗尽的资源');}
 const cols=Math.ceil(Math.sqrt(us.length));
 us.forEach((u,i)=>{u.casting=null;u.attack=null;u._path=null;
  if(c.type==='stop'||c.type==='hold')u.order={type:'hold'};
  else if(aim)u.order={type:c.type,target:aim.id};
  else{const pt={x:clamp(c.x+((i%cols)-(cols-1)/2)*30,24,W-24),y:clamp(c.y+(Math.floor(i/cols)-(Math.ceil(us.length/cols)-1)/2)*30,24,H-24)};u.order={type:c.type,...pt};}
 });
}
function cast(g,owner,c){
 const u=g.units.find(u=>u.id===c.unit&&u.hp>0&&u.owner===owner),s=skills[c.skill];
 if(!u||!s||!definition(u).skills?.includes(c.skill))throw Error('该单位没有此技能');
 if((u.statuses.stun||0)>g.now||(u.statuses.silence||0)>g.now)throw Error('眩晕或沉默中无法施法');if(u.casting)throw Error('正在施法');
 if(u.level<s.requiredLevel)throw Error(`技能需要英雄 ${s.requiredLevel} 级`);if((u.cooldowns[c.skill]||0)>g.now)throw Error('技能冷却中');if(u.mana<s.mana)throw Error('法力不足');
 let aim;
 if(s.target==='self')aim=u;
 else if(s.target==='point'){point(c);aim={x:c.x,y:c.y};}
 else{aim=get(g,c.target);if(!aim||(s.target==='enemy'?aim.owner===owner:aim.owner!==owner))throw Error('技能目标阵营无效');}
 if(dist(u,aim)>s.range+(aim.r||0))throw Error('目标超出技能范围');
 if((s.effect==='blink'||s.effect==='dash')&&isBlocked(g,aim.x,aim.y,u.r))throw Error('位移终点不可通行');
 u.mana-=s.mana;u.cooldowns[c.skill]=g.now+s.cooldown;u.attack=null;
 const action={skill:c.skill,end:g.now+s.castTime,x:aim.x,y:aim.y,target:s.target==='enemy'||s.target==='ally'?aim.id:null};u.casting=action;emit(g,'cast',{owner,x:u.x,y:u.y,tx:aim.x,ty:aim.y,text:s.name,color:s.color});
 if(s.castTime===0){u.casting=null;resolveCast(g,u,action);}
}
const negative=['stun','slow','root','silence','weaken','taunt','poison'];
function status(g,u,name,duration,source){if(!name||!u.statuses)return;u.statuses[name]=Math.max(u.statuses[name]||0,g.now+duration);if(name==='root'&&definition(u)?.flying)u.statuses.grounded=g.now+duration;if(name==='stun'||name==='taunt'){u.casting=null;u.attack=null;}if(name==='taunt')u.tauntTarget=source;}
function heal(u,n){if(u.hp>0)u.hp=Math.min(u.maxHp,u.hp+n);}
function shield(g,u,n,duration){u.shield=Math.max(u.shield||0,n);u.shieldUntil=g.now+duration;}
const armorMatrix={normal:{heavy:1,light:1.15,unarmored:1,fortified:.55},pierce:{heavy:.7,light:1.2,unarmored:1.3,fortified:.35},magic:{heavy:1.35,light:.85,unarmored:1,fortified:.45},siege:{heavy:.8,light:.8,unarmored:1.1,fortified:1.6}};
function damage(g,source,v,amount,kind='magic',spell=true){
 if(!v||v.hp<=0)return 0;const owner=source.owner,p=g.players[owner],vp=g.players[v.owner],d=v.queue?{armor:'fortified'}:definition(v);
 if(!spell){amount*=armorMatrix[kind]?.[d.armor]||1;amount*=1+(p?.tech.weapons||0)*.12;amount*=1-(vp?.tech.armor||0)*.08;if((v.statuses.evade||0)>g.now)amount*=.35;}
 if((source.statuses?.weaken||0)>g.now)amount*=.7;if((v.statuses?.sanctuary||0)>g.now)amount*=.75;
 if(v.shieldUntil>g.now&&v.shield>0){const absorb=Math.min(amount,v.shield);v.shield-=absorb;amount-=absorb;}
 const dealt=Math.min(v.hp,amount);v.hp-=dealt;if(p)p.damage+=dealt;
 if(v.hp<=0&&!v._dead){v._dead=true;if(p)p.kills+=v.queue?5:v.hero?3:1;emit(g,'death',{x:v.x,y:v.y,owner:v.owner,big:!!v.queue||v.hero});
  if(v.hero&&vp){const rec=vp.heroes.find(h=>h.type===v.type);if(rec){rec.dead=true;rec.queued=false;rec.respawnAt=g.now+12;rec.unitId=null;rec.level=v.level;rec.xp=v.xp;}emit(g,'heroDeath',{x:v.x,y:v.y,owner:v.owner,text:definition(v).name+'阵亡，12 秒后可复活'});}
  if(p&&!v.summoned){const xp=v.type==='ancient'?500:v.owner===-1?100:v.hero?140:v.queue?100:35;for(const h of own(g,owner).filter(h=>h.hero&&dist(h,v)<750)){h.xp+=xp;while(h.level<6&&h.xp>=100*h.level){h.xp-=100*h.level;h.level++;h.maxHp+=120;h.hp=Math.min(h.maxHp,h.hp+200);h.maxMana+=30;h.mana=Math.min(h.maxMana,h.mana+80);emit(g,'level',{x:h.x,y:h.y,owner,text:definition(h).name+'升至 '+h.level+' 级'});}const rec=p.heroes.find(r=>r.type===h.type);rec.level=h.level;rec.xp=h.xp;}if(v.owner===-1)p.gold+=v.type==='ancient'?500:55;}
 }
 return dealt;
}
function resolveCast(g,u,a){
 const s=skills[a.skill];let target=a.target?get(g,a.target):null;if(a.target&&!target)return;
 const pt=target||a,amount=(s.amount||0)*(1+(u.hero?u.level-1:0)*.08),enemies=()=>[...g.units,...g.buildings].filter(v=>v.hp>0&&v.owner!==u.owner),allies=()=>[...g.units,...g.buildings].filter(v=>v.hp>0&&v.owner===u.owner);
 const hit=v=>{damage(g,u,v,amount,'magic',true);if(v.hp>0)status(g,v,s.status,s.duration||2,u.id);};
 if(s.effect==='blink'){const dest=freePoint(g,pt,u.r);if(dest){u.x=dest.x;u.y=dest.y;u.order={type:'hold'};u._path=null;}return;}
 if(s.effect==='dash'){
  const before={x:u.x,y:u.y};let dest=before;const n=Math.ceil(dist(u,pt)/15);for(let i=1;i<=n;i++){const test={x:before.x+(pt.x-before.x)*i/n,y:before.y+(pt.y-before.y)*i/n};if(isBlocked(g,test.x,test.y,u.r))break;dest=test;}
  u.x=dest.x;u.y=dest.y;u.order={type:'hold'};u._path=null;for(const v of enemies())if(segmentDistance(v,before,dest)<s.radius+v.r)hit(v);return;
 }
 if(s.effect==='strike'){const dest=freePoint(g,{x:target.x-(target.x-u.x)/Math.max(1,dist(u,target))*45,y:target.y-(target.y-u.y)/Math.max(1,dist(u,target))*45},u.r);if(dest){u.x=dest.x;u.y=dest.y;}hit(target);u.order={type:'attack',target:target.id};return;}
 if(s.effect==='heal'){heal(target||u,amount);return;}
 if(s.effect==='healArea'||s.effect==='repairArea'){for(const v of allies())if(dist(v,pt)<s.radius+v.r&&(s.effect!=='repairArea'||v.queue||definition(v).mechanical))heal(v,amount);return;}
 if(s.effect==='shield'){for(const v of allies())if(s.target==='self'?v===u:s.target==='ally'?v===target:dist(v,pt)<=s.radius+v.r)shield(g,v,amount,s.duration);return;}
 if(s.effect==='buff'){for(const v of allies())if(s.target==='self'?v===u:s.target==='ally'?v===target:dist(v,pt)<s.radius+v.r){status(g,v,s.status,s.duration,u.id);if(amount)heal(v,amount);}return;}
 if(s.effect==='evade'){status(g,u,'evade',s.duration);return;}
 if(s.effect==='stone'){heal(u,amount);status(g,u,'stun',s.duration);shield(g,u,80,s.duration);return;}
 if(s.effect==='dispel'){for(const v of [...g.units,...g.buildings].filter(v=>v.hp>0&&dist(v,pt)<s.radius+v.r)){if(v.owner===u.owner){for(const k of negative)delete v.statuses[k];delete v.dot;delete v.tauntTarget;}else{v.shield=0;for(const k of ['haste','evade','sanctuary'])delete v.statuses[k];if(v.summoned)damage(g,u,v,220);}}return;}
 if(s.effect==='drain'){heal(u,damage(g,u,target,amount));return;}
 if(s.effect==='execute'){damage(g,u,target,Math.min(500,amount+(target.maxHp-target.hp)*.35));return;}
 if(s.effect==='blastTarget'){hit(target);return;}
 if(s.effect==='dot'){target.dot={owner:u.owner,amount,until:g.now+s.duration};status(g,target,s.status,s.duration);return;}
 if(s.effect==='taunt'){for(const v of enemies())if(!v.queue&&dist(v,u)<s.radius+v.r)status(g,v,'taunt',s.duration,u.id);shield(g,u,150,s.duration);return;}
 if(s.effect==='summon'){for(let i=0;i<s.count;i++){if(own(g,u.owner).length>=rules.unitCap)break;const pos=freePoint(g,{x:pt.x+(i-(s.count-1)/2)*35,y:pt.y},summons[s.summon].r);if(!pos)continue;const v=spawn(g,u.owner,s.summon,pos.x,pos.y);v.summoned=true;v.expires=g.now+s.duration;v.order={type:'attackMove',x:pt.x,y:pt.y};}return;}
 if(s.effect==='cone'){const a0=Math.atan2(pt.y-u.y,pt.x-u.x);for(const v of enemies()){const angle=Math.atan2(v.y-u.y,v.x-u.x),diff=Math.atan2(Math.sin(angle-a0),Math.cos(angle-a0));if(dist(v,u)<s.range+v.r&&Math.abs(diff)<Math.PI*.32)hit(v);}emit(g,'cone',{x:u.x,y:u.y,tx:pt.x,ty:pt.y,owner:u.owner,radius:s.range});return;}
 if(s.effect==='line'){const d=Math.max(1,dist(u,pt));g.projectiles.push({id:'p'+g.nextId++,owner:u.owner,x:u.x,y:u.y,tx:u.x+(pt.x-u.x)/d*s.range,ty:u.y+(pt.y-u.y)/d*s.range,r:s.radius,color:s.color,speed:s.projectileSpeed||450,amount,kind:'line',hit:[],source:u.id,expires:g.now+4});return;}
 if(s.effect==='zone'||s.effect==='blast'||s.effect==='sanctuary'){g.zones.push({id:'z'+g.nextId++,owner:u.owner,source:u.id,x:pt.x,y:pt.y,radius:s.radius,startsAt:g.now+(s.delay||0),endsAt:g.now+(s.delay||0)+(s.effect==='blast'?.1:s.duration),nextAt:g.now+(s.delay||0),kind:s.effect,color:s.color,amount,status:s.status,duration:s.duration||2});return;}
}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}

// Grid A* is used only when a direct segment is obstructed. Paths are cached by destination cell.
function findPath(g,u,goal){
 const cell=64,cols=Math.ceil(W/cell),rows=Math.ceil(H/cell),sx=clamp(Math.floor(u.x/cell),0,cols-1),sy=clamp(Math.floor(u.y/cell),0,rows-1),gx=clamp(Math.floor(goal.x/cell),0,cols-1),gy=clamp(Math.floor(goal.y/cell),0,rows-1),start=sy*cols+sx;
 const blocked=new Map(),center=k=>({x:(k%cols)*cell+cell/2,y:Math.floor(k/cols)*cell+cell/2}),pass=(x,y)=>{if(x<0||y<0||x>=cols||y>=rows)return false;const k=y*cols+x;if(!blocked.has(k))blocked.set(k,isBlocked(g,x*cell+cell/2,y*cell+cell/2,u.r+2));return !blocked.get(k);};
 let end=gy*cols+gx;if(!pass(gx,gy)){let best=Infinity;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(pass(gx+dx,gy+dy)){const d=Math.hypot(dx,dy);if(d<best){best=d;end=(gy+dy)*cols+gx+dx;}}if(best===Infinity)return [];}
 const open=[],closed=new Set(),prev=new Map(),cost=new Map(),estimate=k=>Math.hypot(k%cols-end%cols,Math.floor(k/cols)-Math.floor(end/cols));
 // The actual unit need not be at its grid-cell center. Connect it only to visible centers,
 // otherwise a unit beside a building can repeatedly attempt to walk through that building.
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=sx+dx,y=sy+dy,k=y*cols+x;if(pass(x,y)&&clearLine(g,u,center(k),u.r)){open.push(k);cost.set(k,dist(u,center(k))/cell);prev.set(k,null);}}
 for(let limit=0;open.length&&limit<1800;limit++){
  let ix=0;for(let i=1;i<open.length;i++)if(cost.get(open[i])+estimate(open[i])<cost.get(open[ix])+estimate(open[ix]))ix=i;
  const current=open.splice(ix,1)[0];if(current===end){const points=[];let k=end;while(k!==null){points.push(center(k));k=prev.get(k);if(k===undefined)return [];}return points.reverse();}
  closed.add(current);const x=current%cols,y=Math.floor(current/cols);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,ny=y+dy,n=ny*cols+nx;if(!pass(nx,ny)||closed.has(n)||dx&&dy&&(!pass(x+dx,y)||!pass(x,y+dy))||!clearLine(g,center(current),center(n),u.r))continue;const c=cost.get(current)+Math.hypot(dx,dy);if(c<(cost.get(n)??Infinity)){prev.set(n,current);cost.set(n,c);if(!open.includes(n))open.push(n);}}
 }
 return [];
}
function travel(g,u,target,dt,stop=4){
 const d=definition(u);if(!d.speed||(u.statuses.root||0)>g.now)return false;const distance=dist(u,target);if(distance<=stop+1)return true;
 const speed=d.speed*((u.statuses.slow||0)>g.now?.55:1)*((u.statuses.haste||0)>g.now?1.35:1),goal={x:target.x+(u.x-target.x)/distance*stop,y:target.y+(u.y-target.y)/distance*stop};
 let dest=goal;const flying=d.flying&&(u.statuses.grounded||0)<=g.now;
 if(!flying&&!clearLine(g,u,goal,u.r)){
  const key=Math.floor(goal.x/64)+','+Math.floor(goal.y/64);
  if(!u._path||u._pathKey!==key||g.now>(u._pathAt||0)+2||u._path.length&&!clearLine(g,u,u._path[0],u.r)){u._path=findPath(g,u,goal);u._pathKey=key;u._pathAt=g.now;}
  while(u._path.length&&dist(u,u._path[0])<1.5)u._path.shift();
  if(u._path.length){while(u._path.length>1&&clearLine(g,u,u._path[1],u.r))u._path.shift();dest=u._path[0];}
  else{const p=freePoint(g,goal,u.r);if(!p||!clearLine(g,u,p,u.r))return false;dest=p;}
 }
 const dd=dist(u,dest);if(dd<.1)return false;const amount=Math.min(speed*dt,dd),nx=u.x+(dest.x-u.x)/dd*amount,ny=u.y+(dest.y-u.y)/dd*amount;
 if(flying||!isBlocked(g,nx,ny,u.r)){u.angle=Math.atan2(dest.y-u.y,dest.x-u.x);u.x=clamp(nx,24,W-24);u.y=clamp(ny,24,H-24);}else u._path=null;
 return dist(u,target)<=stop+2;
}
function canHit(g,u,v){const d=u.queue?buildingTypes[u.type]:definition(u),vd=v.queue?null:definition(v);if(vd?.flying&&(v.statuses.grounded||0)<=g.now&&!d.antiAir&&!u.queue&&!u.hero)return false;if(vd?.flying&&(v.statuses.grounded||0)<=g.now&&u.hero&&d.range<100)return false;return true;}
function inRange(g,u,v){const d=u.queue?buildingTypes[u.type]:definition(u),distance=dist(u,v);return distance<=(d.range||0)+v.r&&distance>=(d.minRange||0)&&((d.attackType==='magic')||clearLine(g,u,v,0,[u,v]));}
function beginAttack(g,u,v){const d=u.queue?buildingTypes[u.type]:definition(u);if(u.fireAt>g.now||u.attack||!d.damage)return;u.angle=Math.atan2(v.y-u.y,v.x-u.x);u.attack={target:v.id,at:g.now+(d.range>100?.32:.18)};}
function finishAttack(g,u){
 const d=u.queue?buildingTypes[u.type]:definition(u),v=get(g,u.attack.target);u.attack=null;if(!v||!canHit(g,u,v)||!inRange(g,u,v))return;
 u.fireAt=g.now+(d.cooldown||1.5)/((u.statuses.haste||0)>g.now?1.45:1);
 let amount=(d.damage||0)*(u.hero?1+(u.level-1)*.08:1);const vd=v.queue?{}:definition(v);if(d.bonus&&(d.bonus===vd.tag||d.bonus==='flying'&&vd.flying))amount*=1.7;
 const kind=d.attackType||'pierce';emit(g,'shot',{x:u.x,y:u.y,tx:v.x,ty:v.y,owner:u.owner,color:COLORS[u.owner]||'#cfa7ac'});
 if(d.range>100)g.projectiles.push({id:'p'+g.nextId++,owner:u.owner,source:u.id,x:u.x,y:u.y,tx:v.x,ty:v.y,target:d.attackType==='siege'?null:v.id,r:5,color:COLORS[u.owner]||'#dba284',speed:d.projectileSpeed||600,amount,damageType:kind,kind:'attack',splash:d.splash||0,expires:g.now+5});
 else damage(g,u,v,amount,kind,false);
}
function worker(g,u,dt){
 if(u.order.type==='build'){
  const b=g.buildings.find(b=>b.id===u.order.target&&b.hp>0&&b.owner===u.owner);if(!b||b.complete){u.order={type:'hold'};return;}
  if(travel(g,u,b,dt,b.r+u.r+10)){const d=buildingTypes[b.type],delta=Math.min(1-b.progress,dt/d.build);b.progress+=delta;b.hp=Math.min(b.maxHp,b.hp+delta*b.maxHp*.9);if(b.progress>=1-1e-8){b.progress=1;b.complete=true;emit(g,'complete',{x:b.x,y:b.y,owner:b.owner,text:d.name+'建造完成'});}}return;
 }
 if(u.order.type!=='gather')return;
 const p=g.players[u.owner],amount=u.cargo.gold+u.cargo.wood,capacity=20*(1+p.tech.gathering*.3);let res=g.resources.find(r=>r.id===u.order.target&&r.amount>0);
 if(amount>=capacity-.01||u.returning||(!res&&amount>0)){
  const depot=liveBuildings(g,u.owner).filter(b=>b.type==='townhall'||b.type==='lumbermill').sort((a,b)=>dist(u,a)-dist(u,b))[0];if(!depot)return;u.returning=true;
  if(travel(g,u,depot,dt,depot.r+u.r+10)){p.gold+=u.cargo.gold;p.wood+=u.cargo.wood;p.mined+=amount;u.cargo={gold:0,wood:0};u.returning=false;}return;
 }
 if(!res){const kind=u.gatherKind||'gold';res=g.resources.filter(r=>r.kind===kind&&r.amount>0).sort((a,b)=>dist(u,a)-dist(u,b))[0];if(!res){u.order={type:'hold'};return;}u.order.target=res.id;}
 u.gatherKind=res.kind;
 if(travel(g,u,res,dt,res.r+u.r)){const mined=Math.min(res.amount,capacity-amount,(res.kind==='gold'?7:6)*(1+p.tech.gathering*.3)*dt);res.amount-=mined;u.cargo[res.kind]+=mined;}
}
function runQueue(g,b,dt){
 if(!b.complete||!b.queue.length)return;const q=b.queue[0];q.remaining-=dt;if(q.remaining>0)return;
 if(q.kind==='tech'){b.queue.shift();const p=g.players[b.owner];if(q.type==='tier2')p.tier=2;else if(q.type==='tier3')p.tier=3;else p.tech[q.type]++;emit(g,'research',{owner:b.owner,x:b.x,y:b.y,text:techs[q.type].name+'研究完成'});return;}
 const d=heroes[q.type]||types[q.type],pt=freePoint(g,{x:b.x+b.r+35,y:b.y+20},d.r);if(!pt)return;
 // Destroyed farms can reduce the cap while recruitment is in progress: wait for housing.
 if(population(g,b.owner)>popCap(g,b.owner)){q.remaining=0;return;}
 b.queue.shift();const u=spawn(g,b.owner,q.type,pt.x,pt.y);if(q.type==='worker'){const res=g.resources.filter(r=>r.amount>0&&r.kind==='gold').sort((a,c)=>dist(u,a)-dist(u,c))[0];if(res)u.order={type:'gather',target:res.id};}else u.order={type:'attackMove',...(b.rally||g.players[b.owner].rally)};emit(g,'spawn',{owner:b.owner,x:u.x,y:u.y,text:d.name+'已就绪'});
}
function tickProjectiles(g,dt){
 for(const p of g.projectiles){const source=get(g,p.source)||{owner:p.owner,statuses:{}},before={x:p.x,y:p.y};const target=p.target?get(g,p.target):null;if(target){p.tx=target.x;p.ty=target.y;}
  const d=Math.hypot(p.tx-p.x,p.ty-p.y),move=Math.min(d,p.speed*dt);if(d>0){p.x+=(p.tx-p.x)/d*move;p.y+=(p.ty-p.y)/d*move;}
  if(p.kind==='line'){
   for(const v of [...g.units,...g.buildings])if(v.hp>0&&v.owner!==p.owner&&!p.hit.includes(v.id)&&segmentDistance(v,before,p)<p.r+v.r){p.hit.push(v.id);damage(g,source,v,p.amount);}
   if(d<=move+.1)p.expires=0;
  }else if(d<=move+.1){
   if(p.splash){for(const v of [...g.units,...g.buildings])if(v.hp>0&&v.owner!==p.owner&&dist(v,p)<p.splash+v.r)damage(g,source,v,p.amount*(v===target?1:.7),p.damageType,false);}
   else if(target&&dist(target,p)<target.r+20)damage(g,source,target,p.amount,p.damageType,false);
   p.expires=0;
  }
 }
 g.projectiles=g.projectiles.filter(p=>p.expires>g.now);
}
function tickZones(g){
 for(const z of g.zones){if(g.now+1e-8<z.nextAt||g.now+1e-8<z.startsAt||g.now>z.endsAt+.1)continue;
  const source=get(g,z.source)||{owner:z.owner,statuses:{}};
  for(const v of [...g.units,...g.buildings].filter(v=>v.hp>0&&dist(v,z)<z.radius+v.r)){
   if(z.kind==='sanctuary'){if(v.owner===z.owner){heal(v,z.amount);status(g,v,'sanctuary',1.2);}}
   else if(v.owner!==z.owner){damage(g,source,v,z.amount);status(g,v,z.status,z.kind==='zone'?1.3:z.duration,source.id);}
  }
  z.nextAt+=1;if(z.kind==='blast')z.endsAt=g.now;
 }
 g.zones=g.zones.filter(z=>z.endsAt>g.now);
}
function spatial(entities){const cells=new Map(),size=200;for(const v of entities){const k=Math.floor(v.x/size)+','+Math.floor(v.y/size);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(v);}return (u,r)=>{const result=[];for(let x=Math.floor((u.x-r)/size);x<=Math.floor((u.x+r)/size);x++)for(let y=Math.floor((u.y-r)/size);y<=Math.floor((u.y+r)/size);y++)for(const v of cells.get(x+','+y)||[])if(v.hp>0&&dist(u,v)<r+v.r)result.push(v);return result;};}
function cleanup(g){
 // Destruction releases unbuilt hero slots, but previously fielded heroes stay in the roster.
 for(const b of g.buildings)if(b.hp<=0&&!b._queueCleared){b._queueCleared=true;const p=g.players[b.owner];for(const q of b.queue){if(q.kind==='hero')p.heroes=p.heroes.filter(h=>!(h.type===q.type&&h.queued&&!h.dead));if(q.kind==='revive'){const h=p.heroes.find(h=>h.type===q.type);if(h)h.queued=false;}}b.queue=[];}
 for(const p of g.players)if(p.alive&&!g.buildings.some(b=>b.owner===p.id&&b.type==='townhall'&&b.hp>0&&b.complete)){p.alive=false;for(const u of g.units)if(u.owner===p.id)u.hp=0;for(const b of g.buildings)if(b.owner===p.id){b.hp=0;b.queue=[];}for(const n of g.nodes)if(n.owner===p.id)n.owner=null;emit(g,'eliminated',{owner:p.id,text:p.name+'的大厅全部被摧毁'});}
 g.units=g.units.filter(u=>u.hp>0);g.buildings=g.buildings.filter(b=>b.hp>0);
 for(const c of g.camps)if(!c.cleared&&!g.units.some(u=>u.camp===c.id)){c.cleared=true;emit(g,'camp',{x:c.x,y:c.y,text:c.id==='boss'?'远古巨像已被击败':'野怪营地已清除'});}
 const alive=g.players.filter(p=>p.alive);
 if(alive.length<=1){g.status='finished';g.winner=alive[0]?.id??null;g.reason='其余势力的城镇大厅全部被摧毁';}
 else if(g.now>=rules.duration){const ranked=alive.sort((a,b)=>score(g,b)-score(g,a));g.status='finished';g.winner=score(g,ranked[0])===score(g,ranked[1])?null:ranked[0].id;g.reason='20 分钟战役积分结算';}
}
function step(g,dt=DT){
 if(g.status!=='playing'||g.paused)return;if(!Number.isFinite(dt)||dt<=0||dt>.25)throw Error('每次推进应为 0–0.25 秒');g.now+=dt;g.tick++;
 for(const p of g.players){if(!p.alive)continue;p.gold+=rules.baseIncome*dt;if(p.kind==='bot')bot(g,p);}
 for(const b of g.buildings)if(b.hp>0)runQueue(g,b,dt);
 const entities=[...g.units,...g.buildings].filter(e=>e.hp>0),near=spatial(entities);
 for(const u of entities){
  if(u.hp<=0)continue;const d=u.queue?buildingTypes[u.type]:definition(u);
  if(!u.queue){if(u.expires&&g.now>=u.expires){u.hp=0;continue;}u.mana=Math.min(u.maxMana,u.mana+dt*(u.hero?2.2:1));
   if(u.dot){if(u.dot.until>g.now)damage(g,{owner:u.dot.owner,statuses:{}},u,u.dot.amount*dt);else delete u.dot;}
   if(u.hp<=0)continue;
  }
  if(u.shieldUntil<=g.now)u.shield=0;
  if((u.statuses.stun||0)>g.now){u.casting=null;u.attack=null;continue;}
  if(u.casting){if(g.now>=u.casting.end){const a=u.casting;u.casting=null;resolveCast(g,u,a);}continue;}
  if(u.attack){if(g.now>=u.attack.at)finishAttack(g,u);continue;}
  if(u.queue&&!u.complete)continue;
  if(u.type==='worker'&&['build','gather'].includes(u.order.type)){worker(g,u,dt);continue;}
  if(d.heal&&u.order?.type!=='move'&&g.now>=(u.healAt||0)&&u.mana>=8){const ally=near(u,250).filter(v=>v.owner===u.owner&&!v.queue&&v.hp<v.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(ally){heal(ally,d.heal);u.mana-=8;u.healAt=g.now+1;emit(g,'heal',{x:u.x,y:u.y,tx:ally.x,ty:ally.y,owner:u.owner});}}
  let enemy;
  if((u.statuses.taunt||0)>g.now)enemy=get(g,u.tauntTarget);
  else if(u.order?.type==='attack'){enemy=get(g,u.order.target);if(!enemy)u.order={type:'hold'};}
  if(enemy&&!canHit(g,u,enemy))enemy=null;
  if(!enemy&&u.order?.type!=='move'&&d.damage){const aggro=u.owner===-1?300:u.queue||u.order?.type==='hold'?(d.range||0):Math.max(d.range||0,300);enemy=near(u,aggro+40).filter(v=>v.owner!==u.owner&&canHit(g,u,v)&&dist(u,v)<=aggro+v.r&&(u.owner!==-1||dist(v,u.home)<400)).sort((a,b)=>dist(u,a)-dist(u,b))[0];}
  if(enemy){if(inRange(g,u,enemy))beginAttack(g,u,enemy);else if(!u.queue&&(u.order.type!=='hold'||u.owner===-1))travel(g,u,enemy,dt,(d.range||0)+enemy.r-6);}
  else if(!u.queue&&['move','attackMove'].includes(u.order.type)){if(travel(g,u,u.order,dt,5))u.order={type:'hold'};}
  else if(u.owner===-1&&u.home&&dist(u,u.home)>15){travel(g,u,u.home,dt,5);if(dist(u,u.home)>400)heal(u,30*dt);}
 }
 tickProjectiles(g,dt);tickZones(g);
 const live=g.units.filter(u=>u.hp>0),close=spatial(live);
 for(const a of live){for(const b of close(a,45)){if(b.id<=a.id)continue;const da=definition(a),db=definition(b);if(!!da.flying!==!!db.flying)continue;const d=dist(a,b),r=(a.r+b.r)*.9;if(d>=r)continue;const nx=d>.01?(b.x-a.x)/d:1,ny=d>.01?(b.y-a.y)/d:0,s=Math.min((r-d)*.25,1.8);for(const [u,dx,dy]of [[a,-nx*s,-ny*s],[b,nx*s,ny*s]]){const x=u.x+dx,y=u.y+dy;if(definition(u).flying||!isBlocked(g,x,y,u.r)){u.x=clamp(x,24,W-24);u.y=clamp(y,24,H-24);}}}}
 for(const n of g.nodes){const sides=[...new Set(live.filter(u=>u.owner>=0&&u.type!=='worker'&&!u.summoned&&dist(u,n)<n.r).map(u=>u.owner))];n.contested=sides.length>1;
  if(sides.length===1&&sides[0]!==n.owner){if(n.capturer!==sides[0]){n.capturer=sides[0];n.progress=0;}n.progress+=dt/rules.captureSeconds;if(n.progress>=1){n.owner=n.capturer;n.capturer=null;n.progress=0;emit(g,'capture',{owner:n.owner,x:n.x,y:n.y,text:g.players[n.owner].name+'占领'+n.name});}}
  else if(!n.contested){n.progress=Math.max(0,n.progress-dt/6);if(!n.progress)n.capturer=null;}
  if(n.owner!==null&&g.players[n.owner].alive){const p=g.players[n.owner];p.gold+=rules.nodeGold*dt;p.wood+=rules.nodeWood*dt;p.controlTime+=dt;}
 }
 cleanup(g);g.events=g.events.filter(e=>g.now-e.t<4).slice(-150);
}
function score(g,p){return Math.round(p.damage*.12+p.kills*30+p.mined*.04+p.controlTime*3+liveBuildings(g,p.id).filter(b=>b.type==='townhall').reduce((s,b)=>s+b.hp*.1,0)+p.heroes.reduce((s,h)=>s+(h.level-1)*80,0));}
function publicEntity(u){const result={};for(const [k,v]of Object.entries(u))if(!k.startsWith('_'))result[k]=v;return result;}
function snapshot(g,owner=null){return {id:g.id,seed:g.seed,now:g.now,tick:g.tick,status:g.status,paused:g.paused,winner:g.winner,reason:g.reason,yourPlayer:owner,map:g.map,rules,catalog,players:g.players.map(p=>({...p,gold:Math.floor(p.gold),wood:Math.floor(p.wood),population:population(g,p.id),popCap:popCap(g,p.id),score:score(g,p)})),units:g.units.map(publicEntity),buildings:g.buildings.map(publicEntity),resources:g.resources,nodes:g.nodes,camps:g.camps,projectiles:g.projectiles.map(publicEntity),zones:g.zones,events:g.events};}

// A visible, self-contained practice opponent. External API seats never run this policy.
function bot(g,p){
 if(g.now<p.botAt)return;p.botAt=g.now+.8;
 const attempt=c=>{try{command(g,p.id,c);return true;}catch{return false;}},army=own(g,p.id).filter(u=>u.type!=='worker'),workers=own(g,p.id).filter(u=>u.type==='worker'),hall=liveBuildings(g,p.id,'townhall')[0];if(!hall)return;
 const queued=t=>g.buildings.filter(b=>b.owner===p.id).flatMap(b=>b.queue).filter(q=>q.type===t).length;
 if(workers.length+queued('worker')<11)attempt({type:'train',unit:'worker'});
 const targetBuild=population(g,p.id)>popCap(g,p.id)-10?'farm':!liveBuildings(g,p.id,'lumbermill').length?'lumbermill':!liveBuildings(g,p.id,'range').length?'range':!liveBuildings(g,p.id,'forge').length?'forge':!liveBuildings(g,p.id,'arcane').length?'arcane':p.tier>=2&&!liveBuildings(g,p.id,'workshop').length?'workshop':p.tier>=2&&!liveBuildings(g,p.id,'aviary').length?'aviary':null;
 if(targetBuild&&!g.buildings.some(b=>b.owner===p.id&&!b.complete)&&workers.length){const builder=workers[0];for(let ring=0;ring<4;ring++){let done=false;for(let i=0;i<12;i++){const a=i*Math.PI/6,rad=240+ring*85,x=hall.x+Math.cos(a)*rad,y=hall.y+Math.sin(a)*rad;if(x<70||x>W-70||y<70||y>H-70)continue;if(attempt({type:'build',building:targetBuild,units:[builder.id],x,y})){done=true;break;}}if(done)break;}}
 for(let i=0;i<workers.length;i++){const u=workers[i];if(u.order.type==='build')continue;const danger=g.units.find(e=>e.owner!==p.id&&e.hp>0&&e.owner!==-1&&dist(e,u)<150);if(danger){attempt({type:'move',units:[u.id],x:hall.x+(W/2-hall.x)*.08,y:hall.y+(H/2-hall.y)*.08});continue;}const kind=i%2===0?'wood':'gold';if(u.order.type!=='gather'||g.resources.find(r=>r.id===u.order.target)?.kind!==kind){const res=g.resources.filter(r=>r.amount>0&&r.kind===kind).sort((a,b)=>dist(u,a)-dist(u,b))[0];if(res)attempt({type:'gather',units:[u.id],target:res.id});}}
 if(p.gold>430&&p.wood>240)attempt({type:'research',tech:p.tier===1?'tier2':p.tier===2?'tier3':'weapons'});
 const savingTech=p.tier<3&&liveBuildings(g,p.id,'forge').length&&!g.buildings.some(b=>b.owner===p.id&&b.queue.some(q=>q.kind==='tech'&&q.type==='tier'+(p.tier+1)));
 if(!savingTech&&p.gold>330&&p.wood>180){attempt({type:'research',tech:'weapons'});attempt({type:'research',tech:'armor'});}
 for(const h of p.heroes)if(h.dead&&!h.queued)attempt({type:'revive',hero:h.type});
 if(!savingTech&&p.heroes.length<Math.min(5,1+Math.floor(g.now/100))&&p.gold>420){const choices=['vanguard','oracle','pyromancer','ranger','guardian'];attempt({type:'summon',hero:choices.find(h=>!p.heroes.some(r=>r.type===h))});}
 for(const b of liveBuildings(g,p.id)){if(b.queue.length>=2)continue;let choice;
  if(b.type==='barracks')choice=p.tier>=2&&army.filter(u=>u.type==='berserker').length<4?'berserker':'footman';
  if(b.type==='range')choice=p.tier>=2?'crossbow':'archer';if(b.type==='arcane')choice=army.filter(u=>u.type==='priest').length<3?'priest':p.tier>=2?'sorceress':null;
  if(b.type==='workshop')choice='mortar';if(b.type==='aviary')choice=p.tier>=3?'griffin':'gargoyle';if(choice&&!savingTech)attempt({type:'train',unit:choice,building:b.id});}
 const threat=g.units.filter(u=>u.hp>0&&u.owner>=0&&u.owner!==p.id&&dist(u,hall)<550).sort((a,b)=>dist(a,hall)-dist(b,hall))[0];
 const enemyHall=g.buildings.filter(b=>b.owner!==p.id&&b.type==='townhall'&&b.hp>0).sort((a,b)=>dist(hall,a)-dist(hall,b))[0];
 const objective=threat||(g.now>180&&army.length>16||g.now>450?enemyHall:null)||g.nodes.filter(n=>n.owner!==p.id).sort((a,b)=>dist(hall,a)-dist(hall,b))[0]||enemyHall;
 for(const u of army){
  const d=definition(u);if(u.casting)continue;const enemies=g.units.filter(v=>v.hp>0&&v.owner!==p.id&&dist(v,u)<600).sort((a,b)=>dist(u,a)-dist(u,b)),e=enemies[0];
  if(u.hero&&u.hp<u.maxHp*.25&&e&&dist(u,hall)>350){attempt({type:'move',units:[u.id],x:p.rally.x,y:p.rally.y});continue;}
  let casted=false;
  for(const sid of d.skills||[]){const s=skills[sid];if((u.cooldowns[sid]||0)>g.now||u.mana<s.mana||u.level<s.requiredLevel)continue;
   const injured=own(g,p.id).filter(v=>v.hp<v.maxHp*.7&&dist(v,u)<s.range).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
   if(s.effect==='heal'||s.effect==='healArea'){if(injured)casted=attempt({type:'cast',unit:u.id,skill:sid,target:injured.id,x:injured.x,y:injured.y});}
   else if(e&&dist(u,e)<s.range){if(s.target==='enemy')casted=attempt({type:'cast',unit:u.id,skill:sid,target:e.id});else if(s.target==='self')casted=attempt({type:'cast',unit:u.id,skill:sid});else if(s.target==='ally')casted=attempt({type:'cast',unit:u.id,skill:sid,target:u.id});else if(s.effect!=='blink'&&s.effect!=='dash')casted=attempt({type:'cast',unit:u.id,skill:sid,x:e.x,y:e.y});else if(dist(u,e)<s.range)casted=attempt({type:'cast',unit:u.id,skill:sid,x:e.x,y:e.y});}
   if(casted)break;
  }
  if(casted)continue;
  const zone=g.zones.find(z=>z.owner!==p.id&&z.startsAt>g.now&&dist(u,z)<z.radius+30);if(zone){const dx=u.x-zone.x,dy=u.y-zone.y,d=Math.hypot(dx,dy)||1;attempt({type:'move',units:[u.id],x:clamp(u.x+dx/d*(zone.radius+50),30,W-30),y:clamp(u.y+dy/d*(zone.radius+50),30,H-30)});continue;}
  if(objective&&(!u._botOrderAt||g.now-u._botOrderAt>5)){attempt({type:'attackMove',units:[u.id],x:objective.x,y:objective.y});u._botOrderAt=g.now;}
 }
}
module.exports={createMatch,command,step,snapshot,spawn,addBuilding,score,DT,catalog,isBlocked,population,popCap};
