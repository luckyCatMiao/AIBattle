'use strict';
const E=require('./engine'),A=require('./agent'),{Adversary}=require('./adversaries');
let errors={},samples={},n=0;
for(const teams of [[['kestrel','aegis','vex'],['aegis','torv','nyx']],[['vex','sable','aegis'],['kestrel','nyx','torv']]]) {
 const g=E.createMatch({players:teams.map((team,i)=>({name:'p'+i,kind:'api',team}))});
 const ctrl=new A.Controller(),pols=[new Adversary('mix'),new Adversary('dp')];
 for(let w=0;w<300&&g.status==='playing';w++) {
  const o=E.snapshot(g,0),r=ctrl.restore(o);n++;
  function cmp(key,actual,pred){if(actual!==pred){errors[key]=(errors[key]||0)+1;if(!samples[key])samples[key]={frame:g.frames,actual,pred,events:o.events.slice(-4)};}}
  cmp('hitstop',g.hitstop,r.hitstop);
  for(let p=0;p<2;p++) {
   const f=g.fighters[p],h=r.fighters[p];
   if(f.state==='hitstun')cmp('hitstunLeft',f.hitstunLeft,h.hitstunLeft);
   if(f.state==='blockstun')cmp('blockstunLeft',f.blockstunLeft,h.blockstunLeft);
   if(f.move){cmp('hasHit',f.move.hasHit,h.move.hasHit);cmp('canCancelUntil',f.move.canCancelUntil,h.move.canCancelUntil);cmp('linkDepth',f.move.linkDepth,h.move.linkDepth);}
  }
  for(let t=0;t<15&&g.status==='playing';t++)A.stepFrame(g,pols.map((pol,p)=>pol.next(g,p)));
 }
}
console.log(JSON.stringify({n,errors,samples},null,2));
