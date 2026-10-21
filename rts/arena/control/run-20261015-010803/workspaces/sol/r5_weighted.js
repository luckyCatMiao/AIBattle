'use strict';
const readline=require('readline');
const {TYPES}=require('./rules.js');
const D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function choose(o){
 const me=o.yourPlayer, p=o.players[me], enemy=1-me, b=o.bases.find(b=>b.owner===me), eb=o.bases.find(b=>b.owner!==me&&b.hp>0);
 if(!b||!eb||o.status!=='playing')return {commands:[]};
 const us=o.units.filter(u=>u.owner===me), army=us.filter(u=>u.type!=='worker'), foes=o.units.filter(u=>u.owner!==me), fighters=foes.filter(u=>u.type!=='worker');
 const nodes=[...o.nodes].sort((a,c)=>D(a,b)-D(c,b)), home=nodes[0], north=o.nodes.find(n=>n.id==='n0');
 const cmds=[];let cash=p.credits, queue=b.queue.length,pop=us.length+queue;
 const add=c=>{if(cmds.length<10)cmds.push(c);};
 if(b.hp<=1300&&cash>=100&&o.now-p.repairAt>=30){add({type:'repair'});cash-=100;}
 const counts={worker:0,rifle:0,tank:0,raider:0};for(const u of us)counts[u.type]++;for(const q of b.queue)counts[q.type]++;
 const ec={rifle:0,tank:0,raider:0};for(const u of fighters)ec[u.type]++;
 const train=t=>{if(cash>=TYPES[t].cost&&queue<3&&pop<40&&cmds.length<3){add({type:'train',unit:t});cash-=TYPES[t].cost;queue++;pop++;counts[t]++;return true;}return false;};
 const nearbyMine=o.mines.some(m=>m.ore>150&&D(m,b)<220);
 if(o.now===0){train('tank');train('worker');}
 else{
  if(counts.worker<(nearbyMine?4:3)&&queue<2&&cash>=50)train('worker');
  if(p.level<2&&army.length>=1&&cash>=180+p.level*120+(queue?40:160)){add({type:'upgrade'});cash-=180+p.level*120;}
  let t='tank';
  if(ec.raider>=2&&ec.raider>counts.rifle*.9&&counts.rifle<counts.tank+3)t='rifle';
  // Preserve serial production for armor; short-range raiders strand the tank line.
  while(queue<2&&train(t)){}
 }
 // Keep reinforcements on the central line, safely behind the chosen contested outpost.
 let goal=north;
 const owned=o.nodes.filter(n=>n.owner===me).length;
 if(home.owner!==me&&o.now>35)goal=home;
 else if(north.owner!==me)goal=north;
 else{const other=nodes.find(n=>n.owner!==me);goal=other||north;}
 if(o.now<18&&(ec.tank>0||eb.queue.some(q=>q.type==='tank')))goal={x:640,y:420};
 const power=u=>u.hp*(u.type==='tank'?1.0:u.type==='raider'?1.1:u.type==='rifle'?1:0);
 const total=army.reduce((s,u)=>s+power(u),0), etotal=fighters.reduce((s,u)=>s+power(u),0);
 const invading=fighters.filter(u=>D(u,b)<330);
 if(invading.reduce((s,u)=>s+power(u),0)>total*.5&&invading.length>1)goal={x:b.x+(640-b.x)*.23,y:b.y};
 const front=army.filter(u=>D(u,eb)<650), frontPower=front.reduce((s,u)=>s+power(u),0);
 const baseRush=(o.now>55&&frontPower>etotal*2.0+1050&&front.filter(u=>u.type==='tank').length>=4)||(o.now>60&&total>etotal*1.9+650&&army.length>=10)||(eb.hp<450&&frontPower>etotal*1.1+350);
 if(baseRush)goal=eb;
 const rally={x:goal.x+(b.x-goal.x)*.10,y:goal.y+(b.y-goal.y)*.10};
 if(D(p.rally,rally)>35)add({type:'rally',...rally});
 // Route idle workers to safe ore rather than automatically walking through enemy fire.
 const safeMines=o.mines.filter(m=>m.ore>0&&D(m,b)<D(m,eb)+80&&!fighters.some(e=>D(e,m)<180));
 const workers=us.filter(u=>u.type==='worker');
 const wg=new Map();
 for(const w of workers){
  const danger=fighters.some(e=>D(e,w)<150);
  if(danger&&D(w,b)>140){const key='retreat';if(!wg.has(key))wg.set(key,[]);wg.get(key).push(w.id);}
  else if(safeMines.length){const m=safeMines.reduce((a,c)=>D(a,b)<D(c,b)?a:c);const old=o.mines.find(m=>m.id===w.order.target);if(w.order.type!=='gather'||!old||old.ore<=0||fighters.some(e=>D(e,old)<180)){if(!wg.has(m.id))wg.set(m.id,[]);wg.get(m.id).push(w.id);}}
 }
 // Objective assignments: send one rifle to our near outpost and race north with the other three.
 const assigned=new Map();
 if(o.now<35){const rifles=army.filter(u=>u.type==='rifle').sort((a,c)=>a.id.localeCompare(c.id,undefined,{numeric:true}));rifles.forEach((u,i)=>assigned.set(u.id,i<1?home:north));}
 if(o.now<35)for(const u of army.filter(u=>u.type==='raider'))assigned.set(u.id,home);
 else if(!baseRush){
  for(const n of o.nodes.filter(n=>n.owner!==me)){
   if(fighters.some(e=>D(e,n)<240))continue;
   const candidates=army.filter(u=>u.type!=='tank'&&!assigned.has(u.id)&&!fighters.some(e=>D(e,u)<210)).sort((a,c)=>D(a,n)-D(c,n));
   if(candidates.length&&D(candidates[0],n)<(n===home?550:340))assigned.set(candidates[0].id,n);
  }
 }
 const groups=new Map();
 function group(key,c,u,priority){if(!groups.has(key))groups.set(key,{c,units:[],priority});const g=groups.get(key);g.units.push(u.id);g.priority=Math.max(g.priority,priority);}
 const committed=new Map();
 for(const u of [...army].sort((a,c)=>Math.max(o.now,a.fireAt)-Math.max(o.now,c.fireAt)||TYPES[c.type].damage-TYPES[a.type].damage)){
  const stats=TYPES[u.type], near=fighters.filter(e=>D(e,u)<250);
  const ally=army.filter(v=>D(v,u)<250).reduce((s,v)=>s+power(v),0)+(D(u,b)<205?500:0);
  const ep=near.reduce((s,v)=>s+power(v),0)+(D(u,eb)<215?450:0);
  if(near.length&&(ep>ally*1.65||(u.type==='raider'&&near.some(e=>e.type==='rifle'&&D(e,u)<155)&&!army.some(v=>v.id!==u.id&&v.type==='tank'&&D(v,u)<200)))&&D(u,b)>210&&!baseRush){
   const back=army.filter(v=>D(v,u)>100&&D(v,b)<D(u,b)-60).sort((a,c)=>D(a,u)-D(c,u))[0]||b;
   group('retreat'+Math.round(back.x/100)+','+Math.round(back.y/100),{type:'move',x:back.x,y:back.y},u,90);continue;
  }
  const capture=assigned.get(u.id);
  if(u.type==='raider'&&capture&&!baseRush&&!near.some(e=>e.type!=='tank')){
   const danger=near.some(e=>D(e,u)<TYPES[e.type].range+u.r+65);
   if(danger){
    // Run directly away from the closest attacker, toward our base when possible.
    const e=near.sort((a,c)=>D(a,u)-D(c,u))[0],d=D(e,u)||1;
    const x=Math.max(18,Math.min(1262,u.x+(u.x-e.x)/d*145)),y=Math.max(18,Math.min(822,u.y+(u.y-e.y)/d*145));
    group('captureEscape'+u.id,{type:'move',x,y},u,110);continue;
   }
   if(capture.owner!==me){group('capture'+capture.id,{type:'move',x:capture.x,y:capture.y},u,85);continue;}
  }
  // Spend tank reload time opening distance from slower ranged pursuers.
  let threat=near.filter(e=>e.type!=='raider'&&D(e,u)<TYPES[e.type].range+u.r+40).sort((a,c)=>D(a,u)-D(c,u))[0];
  if(u.type==='tank'&&u.fireAt>o.now+.85&&threat&&D(u,b)>170&&!baseRush){
   // Open space between allies during reload, reducing exposure to tank splash.
   let vx=0,vy=0;for(const e of near){const d=D(u,e)||1;if(d<TYPES[e.type].range+u.r+40){const weight=TYPES[e.type].damage*(1+o.players[e.owner].level*.2)/Math.max(.4,e.fireAt-o.now+.4);vx+=(u.x-e.x)/d*weight;vy+=(u.y-e.y)/d*weight;}}const vl=Math.hypot(vx,vy)||1;vx/=vl;vy/=vl;
   for(const v of army){
    const vd=D(v,u);
    if(v.id!==u.id&&vd<65){vx+=(u.x-v.x)/(vd||1)*.8;vy+=(u.y-v.y)/(vd||1)*.8;}
   }
   const len=Math.hypot(vx,vy)||1;
   const virtual={x:u.x-vx/len*100,y:u.y-vy/len*100};
   threat=virtual;
   const d=D(u,threat)||1, x=Math.max(18,Math.min(1262,u.x+(u.x-threat.x)/d*50)),y=Math.max(18,Math.min(822,u.y+(u.y-threat.y)/d*50));
   group('kite'+u.id,{type:'move',x,y},u,96);continue;
  }
  const targets=foes.concat(baseRush?[eb]:[]).filter(e=>D(e,u)<=stats.range+e.r+12&&(e.type!=='base'||baseRush));
  if(targets.length){
   const counter={tank:'rifle',rifle:'raider',raider:'tank'};
   const val=e=>{
    const d=D(e,u), remaining=e.hp-(committed.get(e.id)||0), hits=Math.max(1,remaining)/(stats.damage*(1+p.level*.2)*(counter[u.type]===e.type?1.5:1));
    const splash=u.type==='tank'?foes.filter(v=>v!==e&&D(v,e)<36).length:0;
    return (remaining<=0?90:0)+(e.type==='worker'?10:0)+(d>stats.range+e.r?35+(d-stats.range-e.r)*.8:0)+hits*3-splash*12+(e.type==='base'?20:0);
   };
   targets.sort((a,c)=>val(a)-val(c));const t=targets[0];
   if(D(u,t)<=stats.range+t.r&&u.fireAt<o.now+1)committed.set(t.id,(committed.get(t.id)||0)+stats.damage*(1+p.level*.2)*(counter[u.type]===t.type?1.5:1));
   group('attack'+t.id,{type:'attack',target:t.id},u,100+(t.type==='worker'?0:5));continue;
  }
  const dest=assigned.get(u.id)||goal;
  if(dest.owner===me&&assigned.has(u.id))continue;
  if(D(u,dest)<48){if(u.order.type!=='hold')group('stop'+dest.id,{type:'stop'},u,30);}
  else if(u.order.type!=='attackMove'||Math.hypot(u.order.x-dest.x,u.order.y-dest.y)>65){group('go'+(dest.id||'defend'),{type:'attackMove',x:dest.x,y:dest.y},u,40);}
 }
 // Tactical command budget is shared across groups, never exceeding ten.
 for(const [key,ids] of wg){if(cmds.length>=9)break;add(key==='retreat'?{type:'move',units:ids,x:b.x,y:b.y}:{type:'gather',units:ids,target:key});}
 for(const g of [...groups.values()].sort((a,c)=>c.priority-a.priority)){if(cmds.length>=10)break;add({...g.c,units:g.units});}
 return {commands:cmds,note:'Control outposts; sustain armor; focus favorable engagements.'};
}
module.exports={choose};
if(require.main===module){const rl=readline.createInterface({input:process.stdin});rl.on('line',line=>{try{process.stdout.write(JSON.stringify(choose(JSON.parse(line)))+'\n');}catch(e){console.error(e.stack);process.stdout.write('{"commands":[]}\n');}});}
