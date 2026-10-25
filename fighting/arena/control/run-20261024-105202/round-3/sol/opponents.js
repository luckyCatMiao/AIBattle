const a=require('./agent'),C=require('./catalog');
const I=(dir='DB',btn=null)=>({dir,btn});
function create(style){return {style,q:[],tick:0,baseline:a.controller(style)};}
function act(g,id,c){
 const f=g.fighters[id],o=g.fighters[1-id],d=Math.abs(f.x-o.x);c.tick++;
 if(c.q.length)return c.q.shift();
 if(['balanced','zone','rush','safe','heavy','jump','block'].includes(c.style))return a.control(g,id,c.baseline);
 const moves=Object.entries(f.def.specials);
 const specials=(key)=>{let m=key==='super'?f.def.super:f.def.specials[key];c.q=C.parseMotion(m.motion).map((dir,i,ar)=>I(dir,i===ar.length-1?m.button:null));return c.q.shift();};
 const gd=o.airborne||o.move?.data.guard==='overhead'?'B':'DB';
 if(f.state==='attack'){
  if((f.move.kind==='normal'||f.move.kind==='air')&&f.move.hasHit&&o.state==='hitstun')return a.control(g,id,c.baseline);
  return I(gd);
 }
 if(['hitstun','blockstun','down','wakeup','stance'].includes(f.state))return I(gd);
 if(f.airborne)return (f.vy>0&&d<130)?I('F','HK'):I('F');
 if(f.meter>=100&&(d<230||f.def.super.travel&&d<450))return specials('super');
 if(c.style==='reversal'){
  let m=moves.find(([k,m])=>m.invuln&&m.hitbox&&!m.airOnly)||moves.find(([k,m])=>m.travel);
  if(m&&d<220)return specials(m[0]);
 }
 if(c.style==='throw'){
  let m=moves.find(([k,m])=>m.kind==='throw');if(m&&d<73)return specials(m[0]);
 }
 if(c.style==='parry'&&d<190){let m=moves.find(([k,m])=>m.kind==='stance');if(m)return specials(m[0]);}
 if(c.style==='bomb'){let m=moves.find(([k,m])=>m.projectile?.fuse);if(m&&d>200&&d<650)return specials(m[0]);}
 if(c.style==='artillery'){
  let m=moves.find(([k,m])=>m.projectile&&m.projectile.speed>0);if(m&&d>130)return specials(m[0]);
 }
 if(c.style==='hopper'&&d>140)return I('UF');
 if(d<115){let b=c.tick%4<2?'LP':'LK';return I(gd,b);}
 if(d<175&&c.style==='heavyspam')return I('DB',c.tick%2?'HK':null);
 return I('F');
}
module.exports={create,act};
