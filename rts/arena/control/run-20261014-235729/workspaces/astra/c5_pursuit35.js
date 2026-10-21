'use strict';
const {TYPES:T}=require('./rules.js');
const D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function decide(s){
 const me=s.yourPlayer,p=s.players[me],base=s.bases.find(b=>b.owner===me),eb=s.bases.find(b=>b.owner!==me&&b.hp>0),now=s.now;
 if(!eb||!p.alive)return {commands:[]};
 const us=s.units.filter(u=>u.owner===me),army=us.filter(u=>u.type!=='worker'),workers=us.filter(u=>u.type==='worker'),en=s.units.filter(u=>u.owner!==me),ec=en.filter(u=>u.type!=='worker'),sign=base.x<640?1:-1;
 let commands=[],money=p.credits,queue=base.queue.map(q=>q.type),pop=us.length+queue.length;
 function add(c){if(commands.length<10)commands.push(c);}
 function train(type){if(money>=T[type].cost&&pop<40&&queue.length<2){add({type:'train',unit:type});money-=T[type].cost;queue.push(type);pop++;return true;}return false;}
 if(base.hp<=1350&&now-p.repairAt>=30&&money>=100){add({type:'repair'});money-=100;}
 const home=s.nodes.reduce((a,b)=>D(a,base)<D(b,base)?a:b);
 if(now<.5){train('tank');train('worker');}
 const wtarget=now<180?4:3;
 if(queue.length<1){if(workers.length+queue.filter(t=>t==='worker').length<wtarget&&s.mines.some(m=>m.ore>50&&D(m,base)<500))train('worker');else train('tank');}
 if(p.level<2&&(army.filter(u=>u.type==='tank').length>=2||now>75)&&money>=180+p.level*120&& (queue.length>0||pop>=40)){add({type:'upgrade'});money-=180+p.level*120;}
 if(queue.length<2&&money>=160&&(p.level>=2||army.filter(u=>u.type==='tank').length<3))train('tank');
 let rally={x:home.x-sign*65,y:home.y-10};
 if(D(p.rally,rally)>20)add({type:'rally',...rally});
 // Safe mine choice: penalize exposed routes and ore fields occupied by enemy combat units.
 const mines=s.mines.filter(m=>m.ore>0);
 if(mines.length){const best=mines.slice().sort((a,b)=>(D(a,base)+ec.reduce((v,e)=>v+Math.max(0,230-D(a,e))*4,0))-(D(b,base)+ec.reduce((v,e)=>v+Math.max(0,230-D(b,e))*4,0)))[0];
 const threatened=workers.filter(u=>ec.some(e=>D(e,u)<220)||ec.some(e=>D(e,best)<210));
 const retreat=threatened.filter(u=>D(u,base)>55||u.order.type==='gather');
 if(retreat.length)add({type:'move',units:retreat.map(u=>u.id),x:base.x-sign*40,y:base.y+45});
 const change=workers.filter(u=>!threatened.includes(u)&&(u.order.type!=='gather'||u.order.target!==best.id));
 if(change.length)add({type:'gather',units:change.map(u=>u.id),target:best.id});}
 const weight=u=>({tank:3.1,rifle:1,raider:1.6}[u.type]||0)*Math.sqrt(u.hp/u.maxHp);
 const center=army.length?{x:army.reduce((v,u)=>v+u.x,0)/army.length,y:army.reduce((v,u)=>v+u.y,0)/army.length}:home;
 let objective=s.nodes.slice().sort((a,b)=>nodeCost(a)-nodeCost(b))[0];
 function nodeCost(n){return D(n,center)+(n.owner===me?650:0)+ec.reduce((v,e)=>v+(D(e,n)<190?weight(e)*60:0),0);}
 let missions=new Map();
 // One inexpensive unit captures each accessible empty point; the rest stay together.
 let scouts=army.filter(u=>u.type==='rifle'||u.type==='raider');
 for(const n of s.nodes.filter(n=>n.owner!==me).sort((a,b)=>D(a,base)-D(b,base))){
  if((now<20&&n.id!==home.id)||ec.some(e=>D(e,n)<240))continue;
  let candidates=scouts.filter(u=>!missions.has(u.id)&&!ec.some(e=>D(e,u)<180));
  candidates.sort((a,b)=>D(a,n)-D(b,n));
  if(candidates.length){missions.set(candidates[0].id,n);}
 }
 let main=army.filter(u=>!missions.has(u.id));
 const assault=main.reduce((v,u)=>v+weight(u),0)>ec.reduce((v,u)=>v+weight(u),0)*1.7+7&&main.filter(u=>u.type==='tank').length>=4;
 const incoming=ec.filter(e=>D(e,base)<320).sort((a,b)=>D(a,base)-D(b,base))[0];
 const goal=incoming|| (now<20?home:assault?eb:objective);
 const intents=[]; const reserved={};
 function intent(u,c,priority){let o=u.order; if(c.type==='attack'&&o.type==='attack'&&o.target===c.target)return;
 if(['move','attackMove'].includes(c.type)&&o.type===c.type&&Math.hypot(o.x-c.x,o.y-c.y)<12)return;
 if(c.type==='stop'&&o.type==='hold')return;
 intents.push({u,c,priority});}
 for(const u of army){
  const stats=T[u.type]; const near=ec.filter(e=>D(u,e)<260);
  const friends=army.filter(f=>D(f,u)<230); const power=friends.reduce((v,f)=>v+weight(f),0),danger=near.reduce((v,e)=>v+weight(e),0);
  const targets=en.filter(e=>D(u,e)<stats.range+e.r+35).concat(D(u,eb)<stats.range+eb.r+30?[eb]:[]);
  targets.sort((a,b)=>value(a)-value(b));
  function value(e){let range=D(u,e),damage=stats.damage*(1+p.level*.2)*(({tank:'rifle',rifle:'raider',raider:'tank'}[u.type]===e.type)?1.5:1);
   let hp=e.hp-(reserved[e.id]||0);return (range>stats.range+e.r?220:0)+(hp<=0?1000:hp/damage)*5+Math.max(0,range-stats.range-e.r)*2+(e.type==='base'?100:e.type==='worker'?20:0)- (u.type==='tank'?en.filter(v=>v.id!==e.id&&D(e,v)<36).length*13:0);}
  const enemy=targets[0],closest=near.slice().sort((a,b)=>D(a,u)-D(b,u))[0];
  const fleeing=danger>power*1.65&&D(u,base)>180&&closest&&D(u,closest)<200;
  if(fleeing&&!(enemy&&D(u,enemy)<=stats.range+enemy.r&&u.fireAt<=now+.1)){intent(u,{type:'move',x:base.x+sign*90,y:base.y},95);continue;}
  // Reload movement also denies enemy tank shots; ready guns return to attack orders.
  if(u.type==='tank'&&closest&&u.fireAt>now+.65&&D(u,closest)<200){
   let d=D(u,closest)||1;intent(u,{type:'move',x:clamp(u.x+(u.x-closest.x)/d*38,20,1260),y:clamp(u.y+(u.y-closest.y)/d*38,20,820)},90);continue;}
  if(enemy&&(!missions.has(u.id)||D(u,enemy)<stats.range+enemy.r)){
   intent(u,{type:'attack',target:enemy.id},80+ (u.fireAt<=now+.1?5:0));reserved[enemy.id]=(reserved[enemy.id]||0)+stats.damage*(1+p.level*.2);continue;
  }
  let dest=missions.get(u.id)||goal;
  // Keep every assigned capture position inside radius 65: max offset sqrt(45^2+40^2).
  // Spread three lanes beyond splash radius without pushing rear ranks off the point.
  if(u.type==='tank'&&!closest&&!missions.has(u.id)){
   const tanks=army.filter(f=>f.type==='tank'&&f.id!==u.id&&D(f,eb)<D(u,eb));
   if(tanks.length){let lead=tanks.sort((a,b)=>D(u,a)-D(u,b))[0];if(D(u,lead)>120)dest=lead;}
  }
  let x=dest.x,y=dest.y;
  if(dest.type!=='base'&&!incoming){x-=sign*25; if(u.type==='tank'){let k=main.indexOf(u); y+=(k%3-1)*40;x-=Math.min(1,Math.floor(k/3))*sign*20;}}
  if(dest.type==='base'&&u.type==='tank'&&D(u,eb)<=193&&D(u,eb)>184){intent(u,{type:'stop'},75);continue;}
  if(D(u,{x,y})>15||u.order.type==='attack')intent(u,{type:missions.has(u.id)?'move':'attackMove',x:clamp(x,20,1260),y:clamp(y,20,820)},missions.has(u.id)?60:40);
 }
 intents.sort((a,b)=>b.priority-a.priority);
 // Merge identical focus orders to preserve the command budget.
 const groups=new Map(); for(const i of intents){let key=JSON.stringify(i.c);if(!groups.has(key))groups.set(key,{...i.c,units:[]});groups.get(key).units.push(i.u.id);}
 for(const c of groups.values())add(c);
 return {commands};
}
module.exports={decide};
if(require.main===module){const rl=require('readline').createInterface({input:process.stdin});rl.on('line',line=>{try{process.stdout.write(JSON.stringify(decide(JSON.parse(line)))+'\n');}catch(e){console.error(e.stack);process.stdout.write('{"commands":[]}\n');}});}
