'use strict';
const E = require('./engine');
const C = E.characters;
const motions = {qcf:['D','DF','F'],qcb:['D','DB','B'],dp:['F','D','DF'],hcb:['F','DF','D','DB','B']};
const I=(dir='N',btn=null)=>({dir,btn});
function dataByName(char,name) {
 const c=C[char];
 for(const d of [...Object.values(c.normals),...Object.values(c.specials),c.super,...Object.values(E.AIR_MOVE)]) if(d.name===name) return d;
 if(name==='架式反击') return c.specials.parry?.riposte;
 return null;
}
function clone(g) {
 return {...g,roundLog:g.roundLog.slice(),players:g.players.map(p=>({...p,team:p.team.slice()})),fighters:g.fighters.map(f=>({...f,inputHistory:f.inputHistory.slice(),held:{...f.held},move:f.move?{...f.move}:null})), projectiles:g.projectiles.map(p=>({...p,arc:p.arc?{...p.arc}:null})),events:[]};
}
function frozenSince(events,start,end) {
 let n=0,right=start;
 for(const ev of events) {
  if(ev.frame>=end) continue;
  let h=0;
  if(ev.type==='hit'||ev.type==='block') h=ev._stop||0;
  else if(ev.type==='armor') h=4;
  else if(ev.type==='parry') h=8;
  const lo=Math.max(start+1,ev.frame+1,right+1),hi=Math.min(end-1,ev.frame+h);
  if(h&&hi>=lo){n+=hi-lo+1;right=hi;}
 }
 return n;
}

class Controller {
 constructor(){this.last=null;this.lastInputs=[];this.enemyStats={};}
 restore(o) {
  const g=E.createMatch({players:o.players.map(p=>({name:p.name,kind:'api',team:p.team})),seed:o.seed});
  g.frames=o.frame;g.tick=o.tick;g.now=o.now;g.round=o.round;g.roundFrames=o.roundFrame;g.status=o.status;g.winner=o.winner;g.reason=o.reason;g.roundLog=o.roundLog.slice();g.players=o.players.map(p=>({...p,team:p.team.slice()}));g.eventId=99999;g.nextId=10000;g.events=[];
  const evs=o.events.map(ev=>({...ev}));
  let moves=[null,null],shots=[[],[]];
  for(const ev of evs) {
   if(ev.type==='move') moves[ev.owner]=dataByName(o.fighters[ev.owner].char,ev.name);
   if(ev.type==='projectile'&&moves[ev.owner]?.projectile)shots[ev.owner].push(moves[ev.owner].projectile);
   if(ev.type==='hit'||ev.type==='block') {
    const atk=ev.type==='hit'?ev.owner:1-ev.owner;
    const m=moves[atk];
    let d=m?.projectile||m;
    if(ev.text?.startsWith('投技')) {ev._stop=0;ev._data=C[o.fighters[atk].char].specials.grab;continue;}
    const scale=E.rules.comboScale[Math.min(7,Math.max(0,(ev.combo||1)-1))];
    const candidates=[m,...shots[atk].slice().reverse()].filter(Boolean);
    if(ev.type==='hit') {
     const match=candidates.find(x=>x.damage&&Math.round(x.damage*scale)===ev.damage);
     if(match)d=match;
    }else{
     const chip=Number(ev.text?.match(/削防 (\d+)/)?.[1]||0);
     const match=candidates.find(x=>(x.chip||0)===chip);
     if(match)d=match;
    }
    ev._data=d;ev._direct=!!(d===m&&m?.hitbox);
    ev._stop=ev.type==='block'?Math.min(4,d?.hitstop||4):(d?.hitstop||4);
   }
  }
  for(let p=0;p<2;p++) {
   let prev=null;
   for(const ev of evs) {
    if(ev.type==='round'||ev.type==='hit'&&ev.owner===1-p||ev.type==='block'&&ev.owner===p)prev=null;
    if(ev.type==='move'&&ev.owner===p){
     const d=dataByName(o.fighters[p].char,ev.name);
     const isNormal=Object.values(C[o.fighters[p].char].normals).includes(d)||Object.values(E.AIR_MOVE).includes(d);
     ev._depth=isNormal?1:0;
     if(isNormal&&prev?._depth) {
      const pd=dataByName(o.fighters[p].char,prev.name);
      const elapsed=ev.frame-prev.frame-frozenSince(evs,prev.frame,ev.frame);
      if(elapsed<=(pd.startup||0)+(pd.active||0)+(pd.recovery||0))ev._depth=prev._depth+1;
     }
     prev=ev;
    }
   }
  }
  g.hitstop=0;
  for(const ev of evs) {const stop=ev._stop||(ev.type==='parry'?8:ev.type==='armor'?4:0);if(stop)g.hitstop=Math.max(g.hitstop,ev.frame+stop+1-o.frame);}
  for(let p=0;p<2;p++) {
   const v=o.fighters[p], f=g.fighters[p];Object.assign(f,v);f.def=C[v.char];f.move=null;f.hitTaken=v.combo;f.hitTakenAt=-999;
   let latestHit=null,latestBlock=null,latestMove=null,latestDown=null,latestJump=null;
   for(const ev of evs) {
    if(ev.type==='hit'&&ev.owner===1-p) latestHit=ev;
    if(ev.type==='block'&&ev.owner===p) latestBlock=ev;
    if(ev.type==='move'&&ev.owner===p) latestMove=ev;
    if(ev.type==='down'&&ev.owner===p) latestDown=ev;
    if(ev.type==='jump'&&ev.owner===p) latestJump=ev;
   }
   if(latestHit) f.hitTakenAt=latestHit.frame;
   f.airMoveUsed=v.airborne&&(v.state==='air'||v.state==='attack'||!!(latestMove&&latestJump&&latestMove.frame>=latestJump.frame));
   f.stateAt=o.frame;
   if(v.state==='down') f.stateAt=latestDown?.frame??latestHit?.frame??o.frame-12;
   if(v.state==='wakeup') f.stateAt=(latestDown?.frame??o.frame-30)+27;
   if(v.state==='jump') f.stateAt=latestJump?.frame??o.frame-10;
   const latest=v.state==='blockstun'?latestBlock:latestHit;
   if(latest) {
    let lastAtk=latest._data;
    let elapsed=Math.max(0,o.frame-latest.frame-1-frozenSince(evs,latest.frame,o.frame));
    f.hitstunLeft=v.airborne?(lastAtk?.hitstun||12):Math.max(1,(lastAtk?.hitstun||12)-elapsed);
    f.blockstunLeft=Math.max(1,(lastAtk?.blockstun||7)-elapsed);
   }
   f.invulnUntil=v.invulnerable?o.frame+3:0; f.armorUntil=v.armored?o.frame+3:0;
   if(v.invulnerable&&v.state==='down') {
    if(latestDown)f.invulnUntil=Math.max(o.frame+1,latestDown.frame+10);
    else if(latestHit)f.invulnUntil=latestHit.frame+(latestHit.text?.startsWith('投技')?36:32);
   }
   if(v.move) {
    const d=dataByName(v.char,v.move.name)||{};
    const me=latestMove?.name===v.move.name?latestMove:null;
    f.stateAt=me?.frame??o.frame-v.move.frame;
    let hit=null;
    if(me) for(const ev of evs) if(ev.frame>=me.frame&&ev._direct&&((ev.type==='hit'&&ev.owner===p)||(ev.type==='block'&&ev.owner===1-p))) hit=ev;
    const multi=d.hits>1;
    const per=Math.max(1,Math.floor((d.active||1)/(d.hits||1)));
    const done=multi?Math.min(d.hits,Math.floor(Math.max(0,v.move.frame-(d.startup||0))/per)):0;
    f.move={kind:v.move.kind,name:v.move.name,data:d,frame:v.move.frame,hasHit:!!hit,projectileFired:v.move.frame>=(d.startup||0),travelLeft:Math.max(0,(d.travel?.frames||0)-v.move.frame),hitsLeft:d.hits||1,hitsDone:done,hitsConsumed:done,canCancelUntil:hit?.type==='hit'?hit.frame+10:null,linkDepth:me?._depth||0,linkKey:me?._depth>1?Object.keys(C[v.char].normals).find(k=>C[v.char].normals[k].name===v.move.name):null,teleported:v.move.frame>0};
    if(me&&d.hitbox)for(const ev of evs)if(ev.frame>=me.frame&&ev.owner===p&&ev.type==='whiff')f.move.hasHit=true;
    if(v.invulnerable&&d.invuln) f.invulnUntil=f.stateAt+d.invuln[1];
    if(v.armored&&d.armor) f.armorUntil=f.stateAt+d.armor[1];
    if(v.state==='stance') f.parryActive=f.stateAt+(d.parryWindow||16);
   }
   if(p===o.yourPlayer&&this.last&&this.last.id===o.id&&this.last.fighters[p].id===v.id&&o.frame-this.last.frame===15) f.inputHistory=this.lastInputs.slice();
   else {
    f.inputHistory=[];
    if(f.move) {
     const d=f.move.data;
     if(d.motion) for(const dir of motions[d.motion]) f.inputHistory.push(I(dir));
     if(d.button) f.inputHistory.push(I(motions[d.motion]?.at(-1)||'N',d.button));
    }
    f.inputHistory.push(I(v.state==='crouch'?'DB':'N'));
   }
   f.held=f.inputHistory.at(-1)||I();
  }
  g.projectiles=o.projectiles.map(p=>{
   const c=C[o.fighters[p.owner].char];
   let d=Object.values(c.specials).map(s=>s.projectile).find(x=>x&&x.color===p.color)||Object.values(c.specials).find(s=>s.projectile)?.projectile;
   d=d||{speed:9,damage:80,hitstun:12,w:p.w,h:p.h,life:100};
   let facing=g.fighters[p.owner].facing;
   const old=this.last?.id===o.id?this.last.projectiles.find(x=>x.id===p.id):null;
   if(old&&p.x!==old.x)facing=Math.sign(p.x-old.x);
   else {
    let pos=null,spawn=null;
    for(const ev of evs){if(ev.type==='move'&&ev.owner===p.owner)pos=ev.x;if(ev.type==='projectile'&&ev.owner===p.owner&&pos!==null)spawn={x:ev.x,ownerX:pos};}
    if(spawn)facing=Math.sign(spawn.x-spawn.ownerX)||facing;
   }
   let arc=null,arcFrame=0;
   if(d.arc&&p.fuse>4){arc={...d.arc};arcFrame=Math.max(0,d.fuse-p.fuse);}
   return {...p,vx:d.speed*facing,vy:0,data:d,life:d.life||120,fuseAt:p.fuse,dead:false,arc,arcFrame};
  });
  return g;
 }
 choose(o) {
  const g=this.restore(o);const owner=o.yourPlayer||0;
  const result=search(g,owner);
  this.last=o;this.lastInputs=result.inputs;
  return result;
 }
}
function stepFrame(g,inputs) {
 for(let p=0;p<2;p++) {const f=g.fighters[p];f.inputHistory.push(inputs[p]);if(f.inputHistory.length>30) f.inputHistory.shift();f.held=inputs[p];}
 E.step(g);

}
function guardDir(g,p) {
 const o=g.fighters[1-p];
 return o.airborne||o.move?.data.guard==='overhead'?'B':'DB';
}
function reach(m){return m?.hitbox?m.hitbox.x+m.hitbox.w/2+27:0;}
// A policy produces a legal open-loop sequence when rolled out against a model.
class Policy {
 constructor(style='balanced',opening=null,delay=0) {this.noCombo=opening==='guard';this.style=style;this.opening=opening;this.delay=delay;this.queue=[];this.t=0;this.lastMove=null;}
 next(g,p) {
  const f=g.fighters[p],o=g.fighters[1-p],dist=Math.abs(f.x-o.x),c=f.def;
  this.t++;
  if(this.queue.length) return this.queue.shift();
  const guarded=guardDir(g,p);
  const ready=['stand','crouch','air','jump'].includes(f.state);
  // Link/cancel only after a genuine hit, with the simulated freeze accounted for.
  if(f.state==='attack') {
   const m=f.move;
   if(m&&(m.kind==='normal'||m.kind==='air')&&m.hasHit&&o.state==='hitstun'&&!this.noCombo) {
    if(this.opening&&this.t>this.delay) {
     const a=this.opening;
     if(['LP','HP','LK','HK'].includes(a)&&m.linkDepth<3) {
      if(g.hitstop)return I(guarded);
      this.opening=null;return this.press(a,guarded,f);
     }
     const sp=a==='super'?c.super:c.specials[a];
     if(sp&&m.canCancelUntil>=g.frames&&!sp.airOnly&&!['throw','stance','move'].includes(sp.kind)) {
      this.opening=null;return this.motion(sp,g.hitstop);
     }
    }
    if(f.meter>=100&&m.canCancelUntil>=g.frames) return this.motion(c.super,g.hitstop);
    if(m.canCancelUntil>=g.frames) {
     const special=Object.values(c.specials).find(s=>!s.airOnly&&s.motion==='qcf'&&s.projectile&&!s.projectile.arc);
     const reversal=Object.values(c.specials).find(s=>!s.airOnly&&s.motion==='dp'&&s.hitbox);
     if(reversal&&dist<reach(reversal)-5) return this.motion(reversal,g.hitstop);
     if(special) return this.motion(special,g.hitstop);
    }
    if(!g.hitstop&&(m.linkDepth||1)<3) {
     const options=['hp','hk','lk','lp'].filter(k=>c.normals[k].name!==m.name&&dist<reach(c.normals[k])-2&&(!o.airborne||o.y>425));
     if(options.length) {const key=options.sort((a,b)=>c.normals[b].damage-c.normals[a].damage)[0];return this.press(key.toUpperCase(),guarded,f);}
    }
   }
   return I(guarded);
  }
  if(!ready) return I(guarded);
  if(this.opening&&this.t>this.delay) {const a=this.opening;this.opening=null;return this.action(g,p,a);}
  if(this.opening&&this.t<=this.delay) return I(guarded);
  if(f.airborne) {
   // Descending attacks; normals hit below the feet.
   if(!f.airMoveUsed&&(f.vy>0||dist<110)&&dist<165) return this.press('HK','F',f);
   return I(guarded);
  }
  if(this.style==='guard') return I(guarded);
  const projectile=Object.values(c.specials).find(s=>s.projectile&&!s.projectile.arc&&s.projectile.speed>0);
  const reversal=Object.values(c.specials).find(s=>!s.airOnly&&s.invuln&&s.hitbox);
  const rush=Object.values(c.specials).find(s=>s.travel);
  if(f.meter>=100&&dist<reach(c.super)+(c.super.travel?.distance||0)-15&&o.invulnUntil<=g.frames) return this.motion(c.super);
  if(f.meter>=100&&dist<reach(c.super)-8&&o.state!=='down'&&o.state!=='wakeup') return this.motion(c.super);
  if(this.style==='jump'&&dist>130&&dist<500) return I('UF');
  if(this.style==='zone'&&dist>220&&projectile) return this.motion(projectile);
  if(this.style==='rush'&&dist>180&&rush&&dist<430) return this.motion(rush);
  if(o.state==='down'||o.state==='wakeup') {
   if(dist>115) return I('F');
   if(projectile&&dist>105) return this.motion(projectile);
   return I(guarded);
  }
  // Prefer the invincible move against a committed close attack / jump.
  if(reversal&&dist<reach(reversal)-8&&(o.airborne||o.state==='attack')&&this.style!=='normal') return this.motion(reversal);
  if(o.state==='attack'&&o.move) {
   const m=o.move,remaining=(m.data.startup||0)-m.frame;
   if(dist<reach(m.data)+8&&remaining<7&&remaining>-m.data.active&&this.style!=='rush'&&this.style!=='normal') return I(guarded);
  }
  if(dist<reach(c.normals.lp)-8) return this.press(this.style==='low'?'LK':'LP',guarded,f);
  if(dist<reach(c.normals.hp)-10&&this.style!=='zone') return this.press(this.style==='low'?'LK':(this.style==='overhead'?'HK':'HP'),guarded,f);
  if(projectile&&dist>220&&(this.style==='balanced'||this.style==='zone')) return this.motion(projectile);
  if(this.style==='zone') return I('B');
  return I('F');
 }
 press(btn,dir,f) {
  if(f.held.btn===btn){this.queue.push(I(dir,btn));return I(dir);}
  return I(dir,btn);
 }
 motion(d,hold=0) {
  const seq=motions[d.motion]||['N'];
  this.queue=seq.map((dir,k)=>I(dir,k===seq.length-1?d.button:null));
  for(let j=0;j<hold;j++)this.queue.push(I(seq.at(-1),d.button));
  return this.queue.shift();
 }
 action(g,p,a) {
  const f=g.fighters[p];
  if(a==='guard')return I(guardDir(g,p));
  if(a==='forward'||a==='back'||a==='jump'||a==='jumpback') {
   const dir={forward:'F',back:'B',jump:'UF',jumpback:'UB'}[a];
   for(let i=0;i<5;i++)this.queue.push(I(dir));
   return I(dir);
  }
  if(['LP','HP','LK','HK'].includes(a)) return this.press(a,guardDir(g,p),f);
  if(a==='super')return this.motion(f.def.super);
  if(f.def.specials[a])return this.motion(f.def.specials[a]);
  return I();
 }
}
function evaluate(g,p,base) {
 let value=(g.players[p].damageDealt-base.players[p].damageDealt)-(g.players[1-p].damageDealt-base.players[1-p].damageDealt)*1.16;
 // Chip is excluded from damageDealt: include actual HP for current characters.
 if(g.round===base.round) value=(base.fighters[1-p].hp-g.fighters[1-p].hp)-(base.fighters[p].hp-g.fighters[p].hp)*1.16;
 if(g.round!==base.round) value+= g.players[p].wins>base.players[p].wins?550:-650;
 if(g.status==='finished')value+=g.winner===p?2000:g.winner===1-p?-2200:0;
 const f=g.fighters[p],o=g.fighters[1-p],dist=Math.abs(f.x-o.x);
 value+=0.35*(f.meter-base.fighters[p].meter)-0.23*(o.meter-base.fighters[1-p].meter);
 if(g.round===base.round) {
  if(o.state==='hitstun')value+=o.airborne?17:Math.min(20,o.hitstunLeft)*1.4;
  if(f.state==='hitstun')value-=f.airborne?23:Math.min(20,f.hitstunLeft)*1.6;
  if(o.state==='down')value+=14;
  if(f.state==='down')value-=18;
 }
 // Reward safe projectile pressure, avoiding distant retreat loops.
 for(const q of g.projectiles) {const d=Math.abs(q.x-g.fighters[1-q.owner].x); value+=(q.owner===p?1:-1.1)*Math.max(0,18-d*0.025);}
 if(f.state==='attack'&&f.move&&!f.move.hasHit&&f.move.data.hitbox&&dist>reach(f.move.data)+(f.move.travelLeft||0)*25) value-=7;
 value-=Math.max(0,dist-240)*0.009;
 if(f.hp>o.hp+100&&g.roundFrames>850)value+=Math.min(5,dist*0.01);
 return value;
}
function rollout(base,p,policy,enemyStyle,n,fixed=null,collect=false) {
 const g=clone(base),opp=new Policy(enemyStyle),inputs=[];
 for(let t=0;t<n&&g.status==='playing';t++) {
  const a=fixed&&t<fixed.length?fixed[t]:policy.next(g,p);
  const b=opp.next(g,1-p);const pair=[];pair[p]=a;pair[1-p]=b;
  if(collect&&t<15)inputs.push(a);
  stepFrame(g,pair);g.events=[];
 }
 return {value:evaluate(g,p,base),inputs,g};
}
function search(g,p) {
 const f=g.fighters[p],o=g.fighters[1-p],dist=Math.abs(f.x-o.x);
 const actions=['guard','forward','back','jump','LP','HP','LK','HK',...Object.keys(f.def.specials).filter(k=>!f.def.specials[k].airOnly)];
 if(f.meter>=100) actions.push('super');
 const styles=['balanced','rush','zone','low','guard','jump'];
 const candidates=[];const seen=new Set();
 for(const act of actions)for(const delay of [0,4,9]) {
  // Generate each plan against two alternative movements to diversify timings.
  for(const style of ['balanced','rush']) {
   const pol=new Policy('balanced',act,delay);
   const r=rollout(g,p,pol,style,15,null,true);
   while(r.inputs.length<15) r.inputs.push(I());
   const key=JSON.stringify(r.inputs);if(seen.has(key))continue;seen.add(key);
   candidates.push({inputs:r.inputs,act,delay});
  }
 }
 // Include pure passive/movement plans and sustained zoning / rush plans.
 for(const style of styles) {
  const r=rollout(g,p,new Policy(style), 'balanced',15,null,true);
  while(r.inputs.length<15)r.inputs.push(I());
  const key=JSON.stringify(r.inputs);if(!seen.has(key)){seen.add(key);candidates.push({inputs:r.inputs,act:style});}
 }
 let best=null;
 for(const cand of candidates) {
  let vals=[];
  for(const style of styles) {
   const r=rollout(g,p,new Policy('balanced'),style,54,cand.inputs);
   vals.push(r.value);
  }
  vals.sort((a,b)=>a-b);
  // Risk-sensitive ensemble, without allowing a permanently passive model to veto attacks.
  const score=vals[0]*0.33+vals[1]*0.17+vals.reduce((a,b)=>a+b,0)/vals.length*0.50;
  if(!best||score>best.score)best={...cand,score,vals};
 }
 return {inputs:best?.inputs||Array.from({length:15},()=>I('DB')),note:`${best?.act||'guard'} ${Math.round(best?.score||0)}`};
}
module.exports={Controller,Policy,search,clone,stepFrame,rollout,evaluate};
if(require.main===module) {
 const ctrl=new Controller();
 require('readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  try {const o=JSON.parse(line);require('fs').writeSync(1,JSON.stringify(ctrl.choose(o))+'\n');}
  catch(e){console.error(e.stack);require('fs').writeSync(1,JSON.stringify({inputs:Array.from({length:15},()=>I('DB'))})+'\n');}
 });
}
