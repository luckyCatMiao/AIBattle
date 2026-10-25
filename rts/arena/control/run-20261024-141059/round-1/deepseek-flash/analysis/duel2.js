'use strict';
const path=require('path');
const R=require(path.join('..','rules.js'));
const {createMatch,step,snapshot,DT}=R;
function mk(g,owner,comp,cx,cy){
  let k=0;const out=[];
  for(const type of ['rifle','tank','raider'])for(let i=0;i<(comp[type]||0);i++){
    const u=R.spawn(g,owner,type,cx+((k%8)-3.5)*22,cy+(Math.floor(k/8)-1)*22);
    u.order={type:'attackMove',x:640,y:420};out.push(u.id);k++;
  }
  return out;
}
function duel(compA,compB,opts={}){
  const g=createMatch({id:'duel',players:[{name:'A'},{name:'B'}]});
  g.status='playing';g.units.length=0;
  const idsA=mk(g,0,compA,640-260,420),idsB=mk(g,1,compB,640+260,420);
  for(const b of g.bases){b.x=b.owner===0?40:1240;b.y=40;b.hp=1e9;}
  const errs=[[],[]];let t=0;
  for(;t<120&&g.status==='playing';t++){
    if(opts.micro){
      for(const owner of [0,1]){
        const o=snapshot(g,owner);o.lastErrors=[];
        let cmds=[];try{cmds=opts.micro(o,g,owner)||[]}catch(e){}
        let n=0;for(const c of cmds){if(n++>=10)break;try{R.command(g,owner,c)}catch(e){errs[owner].push(e.message)}}
      }
    }
    for(let i=0;i<20;i++)step(g,DT);
    if(!g.units.some(u=>u.owner===0)||!g.units.some(u=>u.owner===1))break;
  }
  const alive=[0,1].map(p=>g.units.filter(u=>u.owner===p));
  return {sec:t,alive:alive.map(a=>a.length),hp:alive.map(a=>a.reduce((s,u)=>s+u.hp,0)),
    winner:alive[0].length&&!alive[1].length?0:(!alive[0].length&&alive[1].length?1:null),
    surv:alive.map(us=>us.reduce((o,u)=>{o[u.type]=(o[u.type]||0)+1;return o},{}))};
}
// compositions by equal production-seconds P: rifle 5s, raider 8s, tank 12s
function comp(prefix,P){const r={rifle:0,tank:0,raider:0};if(prefix==='t')r.tank=Math.floor(P/12);if(prefix==='x')r.raider=Math.floor(P/8);if(prefix==='r')r.rifle=Math.floor(P/5);if(prefix==='m'){r.tank=Math.floor(P/3/12);r.raider=Math.floor(P/3/8);r.rifle=Math.floor(P/3/5);}return r;}
const microFocus=(o,g,owner)=>{const me=o.units.filter(u=>u.owner===owner);const foe=o.units.filter(u=>u.owner!==owner);if(!me.length||!foe.length)return [];
  // focus lowest hp; retreat units under 30%
  const tgt=foe.slice().sort((a,b)=>a.hp-b.hp)[0];
  const hurt=me.filter(u=>u.hp<u.maxHp*.3);
  const cmds=[];
  if(hurt.length)cmds.push({type:'move',units:hurt.map(u=>u.id),x:owner===0?80:1200,y:420});
  const rest=me.filter(u=>u.hp>=u.maxHp*.3);
  if(rest.length)cmds.push({type:'attack',units:rest.map(u=>u.id),target:tgt.id});
  return cmds;};
const microSpread=(o,g,owner)=>{const me=o.units.filter(u=>u.owner===owner);const foe=o.units.filter(u=>u.owner!==owner);if(!me.length||!foe.length)return [];
  // each unit attacks nearest enemy: spread damage, avoid overkill clump
  const cmds=[];const groups={};
  for(const u of me){let best=null,bd=1e9;for(const v of foe){const d=Math.hypot(v.x-u.x,v.y-u.y);if(d<bd){bd=d;best=v;}}if(best){groups[best.id]=groups[best.id]||[];groups[best.id].push(u.id);}}
  for(const k in groups)cmds.push({type:'attack',units:groups[k],target:k});
  return cmds.slice(0,10);};
const P=180;
const names=['t','x','r','m'];
for(const a of names)for(const b of names){ if(a>=b)continue;
  for(const [mn,m] of [['none',null],['focus',microFocus],['spread',microSpread]]){
    const ca=comp(a,P),cb=comp(b,P);
    const r=duel(ca,cb,{micro:m});
    console.log('P'+P,a,JSON.stringify(ca),'vs',b,JSON.stringify(cb),mn,'->',JSON.stringify(r));
  }
}
