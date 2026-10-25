'use strict';
const path=require('path');
const R=require(path.join('..','rules.js'));
const {createMatch,step,snapshot,DT}=R;
function mk(g,owner,comp,cx,cy){
  let k=0;
  const out={};
  for(const type of ['rifle','tank','raider']){
    out[type]=[];
    for(let i=0;i<(comp[type]||0);i++){
      const u=R.spawn(g,owner,type,cx+((k%8)-3.5)*24,cy+(Math.floor(k/8)-1)*24);
      u.order={type:'attackMove',x:owner===0?1200:80,y:420};out[type].push(u.id);k++;
    }
  }
  return out;
}
function duel(compA,compB,microA,microB,opts={}){
  const g=createMatch({id:'duel',players:[{name:'A'},{name:'B'}]});
  g.status='playing';g.units.length=0;
  const idsA=mk(g,0,compA,640-250,420),idsB=mk(g,1,compB,640+250,420);
  for(const b of g.bases){b.x=b.owner===0?30:1250;b.y=30;b.hp=1e12;}
  let t=0;
  for(;t<150;t++){
    for(const [owner,micro] of [[0,microA],[1,microB]]){
      if(!micro)continue;
      const o=snapshot(g,owner);o.lastErrors=[];
      let cmds=[];try{cmds=micro(o,g,owner)||[]}catch(e){if(opts.verbose)console.log('err',e)}
      let n=0;for(const c of cmds){if(n++>=10)break;try{R.command(g,owner,c)}catch(e){}}
    }
    for(let i=0;i<20;i++)step(g,DT);
    if(!g.units.some(u=>u.owner===0)||!g.units.some(u=>u.owner===1))break;
  }
  const alive=[0,1].map(p=>g.units.filter(u=>u.owner===p));
  return {sec:t,alive:alive.map(a=>a.length),hp:alive.map(a=>Math.round(a.reduce((s,u)=>s+u.hp,0))),
    winner:alive[0].length&&!alive[1].length?0:(!alive[0].length&&alive[1].length?1:null),
    surv:alive.map(us=>us.reduce((o,u)=>{o[u.type]=(o[u.type]||0)+1;return o},{}))};
}
const focus=(o,g,owner)=>{const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
 if(!me.length||!foe.length)return[];const tgt=foe.slice().sort((a,b)=>a.hp-b.hp)[0];
 return [{type:'attack',units:me.map(u=>u.id),target:tgt.id}];};
const tankMicro=(o,g,owner)=>{const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
 if(!me.length||!foe.length)return[];const tgt=foe.slice().sort((a,b)=>a.hp-b.hp)[0];
 const hurt=me.filter(u=>u.hp<u.maxHp*.25),rest=me.filter(u=>u.hp>=u.maxHp*.25);
 const cmds=[];if(rest.length)cmds.push({type:'attack',units:rest.map(u=>u.id),target:tgt.id});
 if(hurt.length)cmds.push({type:'move',units:hurt.map(u=>u.id),x:owner===0?30:1250,y:60});return cmds;};
// raider micro: split into k groups around target, all attack same target from different vectors (approach points)
function raiderSplit(k){return (o,g,owner)=>{
 const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
 if(!me.length||!foe.length)return[];
 const c={x:me.reduce((s,u)=>s+u.x,0)/me.length,y:me.reduce((s,u)=>s+u.y,0)/me.length};
 const tgt=foe.slice().sort((a,b)=>(a.hp+0.3*Math.hypot(a.x-c.x,a.y-c.y)))[0];
 const cmds=[];const groups=Array.from({length:k},()=>[]);
 me.forEach((u,i)=>groups[i%k].push(u.id));
 groups.forEach((ids,i)=>{if(!ids.length)return;const ang=Math.PI*2*i/k;
   // staged approach: attackMove to a point near target at angle, then attack
   const approach={x:tgt.x+Math.cos(ang)*70,y:tgt.y+Math.sin(ang)*70};
   cmds.push({type:'attackMove',units:ids,x:approach.x,y:approach.y});
 });
 // also direct focus attack at the end (last command wins for those units) -> use attack on group 0 only
 cmds.push({type:'attack',units:groups[0],target:tgt.id});
 return cmds;};}
const raiderFocusRetreat=(o,g,owner)=>{
 const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
 if(!me.length||!foe.length)return[];
 const c={x:me.reduce((s,u)=>s+u.x,0)/me.length,y:me.reduce((s,u)=>s+u.y,0)/me.length};
 const tgt=foe.slice().sort((a,b)=>(a.hp+0.4*Math.hypot(a.x-c.x,a.y-c.y)))[0];
 const hurt=me.filter(u=>u.hp<u.maxHp*.3),rest=me.filter(u=>u.hp>=u.maxHp*.3);
 const cmds=[];if(rest.length)cmds.push({type:'attack',units:rest.map(u=>u.id),target:tgt.id});
 if(hurt.length)cmds.push({type:'move',units:hurt.map(u=>u.id),x:owner===0?60:1220,y:420});
 return cmds;};
module.exports={duel,focus,tankMicro,raiderSplit,raiderFocusRetreat};
if(require.main===module){
 const T=n=>({rifle:0,tank:n,raider:0}), X=n=>({rifle:0,tank:0,raider:n});
 const cases=[[15,22],[10,15],[8,12],[7,11],[6,9],[12,18]];
 for(const [nt,nx] of cases){
  let line=`tank${nt} vs raider${nx}: `;
  line+=JSON.stringify(duel(T(nt),X(nx),null,focus));
  line+=' split3='+JSON.stringify(duel(T(nt),X(nx),null,raiderSplit(3)));
  line+=' retreat='+JSON.stringify(duel(T(nt),X(nx),null,raiderFocusRetreat));
  console.log(line);
 }
}

if(process.argv[2]==='matrix'){
  const T=n=>({rifle:0,tank:n,raider:0}), X=n=>({rifle:0,tank:0,raider:n});
  const micros={
    none:null,
    focus,
    spread:(o,g,owner)=>{const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
      if(!me.length||!foe.length)return[];const groups={};
      for(const u of me){let best=null,bd=1e9;for(const v of foe){const d=Math.hypot(v.x-u.x,v.y-u.y);if(d<bd){bd=d;best=v;}}
        if(best){(groups[best.id]=groups[best.id]||[]).push(u.id);}}
      const cmds=[];for(const k in groups)cmds.push({type:'attack',units:groups[k],target:k});return cmds.slice(0,10);},
    nearestFocus:(o,g,owner)=>{const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
      if(!me.length||!foe.length)return[];const c={x:me.reduce((s,u)=>s+u.x,0)/me.length,y:me.reduce((s,u)=>s+u.y,0)/me.length};
      let best=null,bd=1e9;for(const v of foe){const d=Math.hypot(v.x-c.x,v.y-c.y);if(d<bd){bd=d;best=v;}}
      return [{type:'attack',units:me.map(u=>u.id),target:best.id}];},
  };
  const nT=15,nX=22;
  for(const ank in micros)for(const bnk in micros){
    const r=duel(T(nT),X(nX),micros[ank],micros[bnk]);
    console.log(`tank(${ank}) vs raider(${bnk}) ->`,JSON.stringify(r));
  }
}
