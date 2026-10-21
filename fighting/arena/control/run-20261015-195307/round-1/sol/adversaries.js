'use strict';
const E=require('./engine');
const motions={qcf:['D','DF','F'],qcb:['D','DB','B'],dp:['F','D','DF'],hcb:['F','DF','D','DB','B']};
const I=(dir='N',btn=null)=>({dir,btn});
// Independent baselines: no use of the search planner's Policy implementation.
class Adversary {
 constructor(style){this.style=style;this.q=[];this.n=0;this.normal=0;this.id=null;}
 motion(m){this.q=motions[m.motion].map((d,i,a)=>I(d,i===a.length-1?m.button:null));return this.q.shift();}
 next(g,p){
  const f=g.fighters[p],o=g.fighters[1-p],c=f.def,d=Math.abs(f.x-o.x);this.n++;
  if(this.id!==f.id){this.q=[];this.id=f.id;}
  if(this.q.length)return this.q.shift();
  const guard=o.airborne||o.move?.data.guard==='overhead'?'B':'DB';
  if(this.style==='turtle')return I(guard);
  if(this.style==='runaway') {
   const shot=Object.values(c.specials).find(m=>m.projectile&&!m.projectile.arc&&m.projectile.speed);
   if(d>340&&shot&&['stand','crouch'].includes(f.state))return this.motion(shot);
   return I(d<350?'B':guard);
  }
  if(f.state==='attack') {
   if(f.move?.hasHit&&f.move.canCancelUntil>=g.frames&&!g.hitstop) {
    if(f.meter>=100)return this.motion(c.super);
    const moves=Object.values(c.specials).filter(m=>!m.airOnly&&m.hitbox);
    if(moves.length)return this.motion(moves[0]);
   }
   if(f.move?.hasHit&&o.state==='hitstun'&&!g.hitstop&&f.move.linkDepth<3){const keys=['HP','HK','LK','LP'];const key=keys[this.normal++%4];return I(guard,key);}
   return I(guard);
  }
  if(!['stand','crouch','jump','air'].includes(f.state))return I(guard);
  if(f.airborne){
   if(!f.airMoveUsed&&f.vy>0&&d<160)return I('F','HK');
   return I('F');
  }
  if(f.meter>=100&&d<(c.super.hitbox?.x||0)+(c.super.hitbox?.w||0)/2+20+(c.super.travel?.distance||0))return this.motion(c.super);
  if(this.style==='grab'&&c.specials.grab&&d<78&&o.state!=='down')return this.motion(c.specials.grab);
  if(this.style==='parry'&&c.specials.parry&&d<200&&o.state==='attack')return this.motion(c.specials.parry);
  if(this.style==='bomb'&&c.specials.bomb&&d>230&&d<500)return this.motion(c.specials.bomb);
  if(this.style==='dp') {
   const inv=Object.values(c.specials).find(m=>m.invuln&&!m.airOnly&&m.hitbox);
   if(inv&&d<170)return this.motion(inv);
  }
  if(this.style==='rush') {
   const dash=Object.values(c.specials).find(m=>m.travel);
   if(dash&&d<460&&d>140)return this.motion(dash);
  }
  if(this.style==='jump'&&d>130&&d<470)return I('UF');
  const shot=Object.values(c.specials).find(m=>m.projectile&&!m.projectile.arc&&m.projectile.speed);
  if((this.style==='zone'||this.style==='dp')&&shot&&d>200)return this.motion(shot);
  // Stand guarding stops movement; crouch guarding also covers low strings.
  if(o.move&&o.state==='attack'&&o.move.frame<o.move.data.startup+o.move.data.active&&d<180&&this.style==='punish')return I(guard);
  if(d>150)return I('F');
  if(d<114){
   const btn=this.style==='mix'?(this.normal++%3===0?'HK':'LK'):'LP';
   if(f.held.btn===btn)return I(guard);
   return I(guard,btn);
  }
  const btn=this.style==='mix'?'HK':'HP';
  return f.held.btn===btn?I(guard):I(guard,btn);
 }
}
module.exports={Adversary};
