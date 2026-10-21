'use strict';
global.bot = null;
const sim = require('./simulation');
const cat = require('./catalog');
const {characters:C,rules:R} = cat;
const I=(dir='DB',btn=null)=>({dir,btn});
const clone=g=>JSON.parse(JSON.stringify(g));
const dist=(a,b)=>Math.abs(a.x-b.x);
const dataFor=(f,name)=>[...Object.values(f.def.normals),...Object.values(f.def.specials),f.def.super,...Object.values(sim.AIR_MOVE)].find(m=>m.name===name);
function hydrate(s,prev){
 let g=sim.createMatch({id:s.id,players:s.players.map(p=>({name:p.name,kind:'api',team:p.team})),seed:s.seed});
 g.frames=s.frame;g.tick=s.tick;g.now=s.now;g.roundFrames=s.roundFrame;g.round=s.round;g.roundLog=s.roundLog.slice();g.events=s.events.slice();g.eventId=Math.max(0,...s.events.map(e=>e.id));g.nextId=10000+s.frame;
 for(let i=0;i<2;i++){
  Object.assign(g.players[i],s.players[i]);
  let f=g.fighters[i],o=s.fighters[i];f.def=C[o.char];Object.assign(f,o);f.hitTaken=o.combo;
  const ev=s.events.filter(e=>e.owner===i),latest=type=>ev.filter(e=>e.type===type).at(-1);
  const start=latest('move');let hit=s.events.filter(e=>e.type==='hit'&&e.owner!==i).at(-1),block=latest('block');
  let hf=hit?.frame??-999,bf=block?.frame??-999;
  f.hitTakenAt=hf;
  f.stateAt=o.state==='down'?(latest('down')?.frame??hf):o.state==='wakeup'?(latest('down')?.frame??hf)+27:o.state==='jump'?(latest('jump')?.frame??s.frame-10):s.frame;
  f.hitstunLeft=12;f.blockstunLeft=7;
  f.invulnUntil=o.invulnerable?s.frame+3:0;f.armorUntil=o.armored?s.frame+3:0;
  f.inputHistory=prev&&prev.fighters[i].id===o.id?prev.fighters[i].inputHistory.slice():[];
  f.held=f.inputHistory.at(-1)||I();
  if(o.move){
   let d=dataFor(f,o.move.name)||{...o.move,hitbox:{x:70,y:-60,w:100,h:50},damage:100};
   const startAt=start?.frame??s.frame-o.move.frame;
   const landed=s.events.filter(e=>(e.type==='hit'&&e.owner===i||e.type==='block'&&e.owner!==i)&&e.frame>=startAt).at(-1);
   f.move={...o.move,data:d,hasHit:!!landed,projectileFired:o.move.frame>=d.startup,travelLeft:Math.max(0,(d.travel?.frames||0)-o.move.frame),teleported:o.move.frame>0,hitsDone:0,hitsConsumed:0,canCancelUntil:landed?.type==='hit'?landed.frame+10:null,linkDepth:1,linkKey:Object.keys(f.def.normals).find(k=>f.def.normals[k].name===d.name)};
   if(d.hits){let per=Math.max(1,Math.floor(d.active/d.hits));f.move.hitsDone=Math.min(d.hits,Math.floor(Math.max(0,o.move.frame-d.startup)/per));f.move.hitsConsumed=f.move.hitsDone;}
   if(d.invuln&&o.invulnerable) f.invulnUntil=s.frame+Math.max(1,d.invuln[1]-o.move.frame);
   if(o.state==='stance')f.parryActive=s.frame+Math.max(0,(d.parryWindow||16)-o.move.frame);
  }else f.move=null;
  if(o.state==='hitstun'||o.state==='blockstun'){
   let last=s.events.filter(e=>(o.state==='hitstun'?e.type==='hit'&&e.owner!==i:e.type==='block'&&e.owner===i)).at(-1);
   let attacker=g.fighters[1-i];let mo=s.events.filter(e=>e.type==='move'&&e.owner!==i&&e.frame<=(last?.frame??s.frame)).at(-1);
   let dd=dataFor({def:C[s.fighters[1-i].char]},mo?.name)||{};
   if(last?.type==='hit'&&s.events.some(e=>e.type==='projectile'&&e.owner!==i&&e.frame<=last.frame&&last.frame-e.frame<90)&&!dd.hitbox)dd=dd.projectile||dd;
   let dt=s.frame-(last?.frame??s.frame),stop=o.state==='hitstun'?(dd.hitstop||4):Math.min(4,dd.hitstop||4);
   if(o.state==='hitstun')f.hitstunLeft=Math.max(1,(dd.hitstun||12)-Math.max(0,dt-stop-1));
   else f.blockstunLeft=Math.max(1,(dd.blockstun||7)-Math.max(0,dt-stop-1));
  }
 }
 let pauses=s.events.filter(e=>['hit','block','parry','armor'].includes(e.type)&&s.frame-e.frame<12);
 for(const e of pauses){let f=g.fighters[e.type==='block'?1-e.owner:e.owner],d=dataFor(f,s.events.filter(x=>x.type==='move'&&x.owner===f.owner&&x.frame<=e.frame).at(-1)?.name)||{};let hs=e.type==='block'?Math.min(4,d.hitstop||4):(d.hitstop||4);g.hitstop=Math.max(g.hitstop,hs-(s.frame-e.frame-1));}
 g.projectiles=s.projectiles.map(p=>{
  let f=g.fighters[p.owner];let d=Object.values(f.def.specials).map(m=>m.projectile).find(x=>x&&x.color===p.color)||Object.values(f.def.specials).find(m=>m.projectile)?.projectile;
  if(!d)return null;
  let old=prev?.projectiles.find(x=>x.id===p.id);let sign=old?Math.sign(p.x-old.x)||Math.sign(old.vx)||f.facing:f.facing;
  let arcFrame=d.fuse?d.fuse-p.fuse:0;
  return {...p,data:d,vx:d.speed*sign,vy:0,life:100,fuseAt:p.fuse,arc:d.arc&&arcFrame<d.arc.frames?d.arc:null,arcFrame,dead:false};
 }).filter(Boolean);
 return g;
}
const reach=m=>m.hitbox?m.hitbox.x+m.hitbox.w/2+27:0;
const fits=(f,o,m,pad=0)=>m.hitbox&&dist(f,o)<reach(m)+pad&&dist(f,o)>m.hitbox.x-m.hitbox.w/2-28&&f.y+m.hitbox.y<o.y&&f.y+m.hitbox.y+m.hitbox.h>o.y-(o.state==='crouch'?79:110);
const guard=(g,f)=>{let o=g.fighters[1-f.owner];return o.airborne||o.move?.data.guard==='overhead'?'B':'DB';};
function actionList(f){let a=[{key:'super',...f.def.super}];for(let [k,d]of Object.entries(f.def.specials))if(!d.airOnly)a.push({key:k,...d});return a;}
function macro(f,key){
 if(['LP','HP','LK','HK'].includes(key))return [I('DB',key),I()];
 let m=actionList(f).find(m=>m.key===key);if(!m)return [];
 return cat.parseMotion(m.motion).map((d,i,a)=>I(d,i===a.length-1?m.button:null));
}
function controller(style='balanced',forced=null,delay=0){return {style,forced,delay,q:[],hold:null,lastMove:null,used:false,lastStart:-99};}
function control(g,id,c){
 let f=g.fighters[id],o=g.fighters[1-id],d=dist(f,o),gd=guard(g,f);
 if(c.delay>0){c.delay--;return I(gd);}
 if(c.q.length){let z=c.q.shift();if(!c.q.length&&z.btn)c.hold={...z,left:5};return z;}
 if(c.hold){let z=c.hold; if(f.move&&f.move.name!==c.lastMove||--z.left<=0)c.hold=null;else return I(z.dir,z.btn);}
 if(c.forced&&!c.used){c.used=true;let k=c.forced;
  if(['F','B','DB','UF','UB','U'].includes(k)){c.q=Array.from({length:k==='UF'||k==='UB'||k==='U'?1:14},()=>I(k));return I(k);}
  c.lastMove=f.move?.name;c.q=macro(f,k);if(c.q.length)return c.q.shift();
 }
 // While frozen prepare a confirmed special cancel or a linked heavy.
 if(f.state==='attack'){
  let m=f.move;
  if(m&&(m.kind==='normal'||m.kind==='air')&&m.hasHit&&o.state==='hitstun'){
   let choice;
   if(f.meter>=100&&d<reach(f.def.super)+20)choice='super';
   else if((m.linkDepth||1)<3){
    let opts=['HP','HK','LK','LP'].filter(b=>f.def.normals[b.toLowerCase()]?.name!==m.name&&fits(f,o,f.def.normals[b.toLowerCase()],-3));
    choice=opts[0];
   }
   if(!choice){let opts=actionList(f).filter(x=>!x.cost&&!x.airOnly&&!x.kind&&!x.projectile&&(fits(f,o,x,10)||x.travel));choice=opts[0]?.key;}
   if(choice){if(['HP','HK','LK','LP'].includes(choice)){if(g.hitstop>0)return I(gd);let prev=f.inputHistory.at(-1);return I(gd,prev?.btn===choice?null:choice);}
    c.lastMove=m.name;c.q=macro(f,choice);return c.q.shift()||I(gd);
   }
  }
  return I(gd);
 }
 if(['hitstun','blockstun','down','wakeup','stance'].includes(f.state))return I(gd);
 if(f.airborne){
  if(o.y-f.y<105&&d<125&&f.vy>0)return I('F','HK');
  return I(gd);
 }
 if(c.style==='block')return I(gd);
 // Super is especially valuable because each hit uses its full base damage.
 if(f.meter>=100&&(d<reach(f.def.super)-8||f.def.super.travel&&d<370))return begin('super');
 const projectile=actionList(f).find(m=>m.projectile&&m.projectile.speed>0);
 const rev=actionList(f).find(m=>m.invuln&&m.hitbox&&!m.cost);
 let danger=o.move&&o.move.frame<o.move.data.startup+o.move.data.active&&fits(o,f,o.move.data,30);
 let missile=g.projectiles.some(p=>p.owner!==id&&Math.abs(p.x-f.x)<75&&p.y>f.y-130);
 if((danger||missile)&&c.style==='safe')return I(gd);
 if((danger||o.airborne&&d<130)&&rev&&d<reach(rev)-8&&c.style!=='zone')return begin(rev.key);
 if(c.style==='jump'&&d>180)return I('UF');
 if(c.style==='zone'&&projectile&&d>165)return begin(projectile.key);
 if(c.style==='rush'){
  let rush=actionList(f).find(m=>m.travel&&!m.cost);
  if(rush&&d>150&&d<420)return begin(rush.key);
 }
 let light=f.def.normals.lp,low=f.def.normals.lk;
 if(d<reach(light)-8&&fits(f,o,light)&&(!danger||o.move.frame>o.move.data.startup))return normal('LP');
 if(c.style==='heavy'){
  let k=fits(f,o,f.def.normals.hk,-5)?'HK':fits(f,o,f.def.normals.hp,-5)?'HP':null;if(k)return normal(k);
 }
 if(fits(f,o,low,-7)&&c.style!=='zone')return normal('LK');
 if(fits(f,o,f.def.normals.hp,-8)&&(!danger||d>reach(o.move.data)))return normal('HP');
 if(projectile&&d>200&&c.style!=='rush'&&c.style!=='jump')return begin(projectile.key);
 if(c.style==='zone'&&d<190)return I('B');
 if(o.state==='down'&&d<160)return I(gd);
 return I('F');
 function begin(key){c.lastMove=f.move?.name;c.q=macro(f,key);return c.q.shift()||I(gd);}
 function normal(b){return I(gd,f.inputHistory.at(-1)?.btn===b?null:b);}
}
function value(g,id,base){
 let f=g.fighters[id],o=g.fighters[1-id],a=g.players[id],b=g.players[1-id];
 let v=0;
 const total=(p,f)=> (3-p.active-1)*1000+f.hp;
 v+=(total(a,f)-total(b,o))-(total(base.players[id],base.fighters[id])-total(base.players[1-id],base.fighters[1-id]));
 v+=0.72*(f.meter-base.fighters[id].meter)-0.6*(o.meter-base.fighters[1-id].meter);
 if(g.status==='finished')v+=g.winner===id?2000:g.winner===1-id?-2000:0;
 v+= (o.state==='hitstun'?13:0)-(f.state==='hitstun'?18:0);
 v+= (o.state==='down'?12:0)-(f.state==='down'?16:0);
 // Prefer room to retreat, and progress when far away and no projectile tool.
 let d=dist(f,o);let zoner=Object.values(f.def.specials).some(s=>s.projectile?.speed>0);
 if(zoner)v-=Math.max(0,d-450)*0.025;
 else v-=Math.max(0,d-130)*0.025;
 for(let p of g.projectiles){let target=g.fighters[1-p.owner];if(p.fuseAt>0)continue;let dx=(target.x-p.x)*Math.sign(p.vx);if(dx < -30)continue;let potential=(p.data.damage||0)*0.45*Math.exp(-Math.max(0,dx)/1500);v+=(p.owner===id?1:-1)*potential;}
 for(let z of g.fighters){let m=z.move;if(m?.data.projectile&&!m.projectileFired){let potential=m.data.projectile.damage*0.36*Math.min(1,(m.frame+4)/Math.max(1,m.data.startup));v+=(z.owner===id?1:-1)*potential;}}
 if(f.state==='attack'&&f.move&&!f.move.hasHit&&!f.move.data.projectile&&f.move.frame>=f.move.data.startup+f.move.data.active)v-=9;
 return v;
}
function roll(base,id,window,oppstyle,horizon=54,gen=null){
 let g=clone(base),own=controller('balanced'),opp=controller(oppstyle),out=[];
 for(let t=0;t<horizon&&g.status==='playing';t++){
  let x=t<15?(gen?control(g,id,gen):window[t]):control(g,id,own);
  let y=control(g,1-id,opp);let ins=[];ins[id]=x;ins[1-id]=y;
  if(t<15)out.push(x);sim.stepFrame(g,ins);
 }
 while(out.length<15)out.push(I());return {g,out,v:value(g,id,base)};
}
function candidateWindows(g,id){
 let f=g.fighters[id];
 let keys=['DB','B','F','UF','UB','LP','LK','HP','HK',...actionList(f).filter(m=>(!m.cost||f.meter>=m.cost)).map(m=>m.key)];
 let candidates=[],seen=new Set();
 let add=w=>{let k=JSON.stringify(w);if(!seen.has(k)){seen.add(k);candidates.push(w);}};
 for(let key of keys)for(let delay of [0,4])add(roll(g,id,null,'balanced',15,controller('balanced',key,delay)).out);
 for(let style of ['balanced','zone','rush','safe','heavy'])for(let op of ['balanced','zone'])add(roll(g,id,null,op,15,controller(style)).out);
 add(Array.from({length:15},()=>I(guard(g,f))));return candidates;
}
function decide(g,id,opts={}){
 let f=g.fighters[id],o=g.fighters[1-id],candidates=candidateWindows(g,id);
 let scenarios=['balanced','zone','rush','safe','heavy','jump'];
 let weights=opts.weights||[0.28,0.2,0.18,0.12,0.12,0.10];
 let horizon=dist(f,o)>500?90:66;
 let threats=[];
 if(opts.robust!==false){
  let enemy=candidateWindows(g,1-id).map(w=>({w,score:0}));
  for(let e of enemy)e.score=['balanced','safe','rush'].reduce((v,style)=>v+roll(g,1-id,e.w,style,horizon).v/3,0);
  enemy.sort((a,b)=>b.score-a.score);
  // Keep distinct tactical starts, avoiding multiple copies of the same plan.
  let signatures=new Set();
  for(let e of enemy){let signature=e.w.filter(i=>i.btn).map(i=>i.btn).join(',')+'|'+e.w.slice(0,3).map(i=>i.dir).join(',');if(!signatures.has(signature)){signatures.add(signature);threats.push(e.w);}if(threats.length>=3)break;}
 }
 let scores=[];
 for(let w of candidates){
  let vals=scenarios.map(style=>roll(g,id,w,style,horizon).v);
  let tactical=threats.map(enemy=>rollFixed(g,id,w,enemy,horizon));
  let avg=vals.reduce((v,x,i)=>v+x*weights[i],0);
  if(tactical.length)avg=avg*0.65+tactical.reduce((a,b)=>a+b,0)/tactical.length*0.35;
  let worst=Math.min(...vals,...tactical),score=avg*0.81+worst*0.19;
  scores.push({score,w,vals:vals.concat(tactical)});
 }
 scores.sort((a,b)=>b.score-a.score);
 return {inputs:scores[0].w,note:'帧模拟评估',debug:opts.debug?scores.slice(0,5):undefined};
}
function rollFixed(base,id,own,enemy,horizon){
 let g=clone(base),controllers=[controller('balanced'),controller('balanced')];
 for(let t=0;t<horizon&&g.status==='playing';t++){
  let ins=[];
  for(let i=0;i<2;i++)ins[i]=t<15?(i===id?own[t]:enemy[t]):control(g,i,controllers[i]);
  sim.stepFrame(g,ins);
 }
 return value(g,id,base);
}
if(require.main===module){
 const rl=require('readline').createInterface({input:process.stdin});let prev=null;
 rl.on('line',line=>{try{let s=JSON.parse(line);let g=hydrate(s,prev),r=decide(g,s.yourPlayer??0);prev=g;prev.fighters[s.yourPlayer??0].inputHistory.push(...r.inputs);prev.fighters[s.yourPlayer??0].inputHistory=prev.fighters[s.yourPlayer??0].inputHistory.slice(-30);console.log(JSON.stringify({inputs:r.inputs,note:r.note}));}catch(e){console.error(e.stack);console.log(JSON.stringify({inputs:Array.from({length:15},()=>I())}));}});
}
module.exports={hydrate,decide,control,controller,roll,value,candidateWindows,rollFixed};
