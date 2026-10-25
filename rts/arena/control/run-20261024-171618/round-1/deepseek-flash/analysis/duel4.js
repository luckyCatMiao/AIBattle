'use strict';
const path=require('path');
const R=require(path.join('..','rules.js'));
const {createMatch,step,snapshot,DT}=R;
function mk(g,owner,n,cx,cy){
  const ids=[];for(let i=0;i<n;i++){const u=R.spawn(g,owner,'tank',cx+((i%6)-2.5)*26,cy+(Math.floor(i/6)-1)*26);u.order={type:'attackMove',x:owner===0?1200:80,y:420};ids.push(u.id);}
  return ids;
}
function duel(nA,nB,microA,microB){
  const g=createMatch({id:'d',players:[{name:'A'},{name:'B'}]});g.status='playing';g.units.length=0;
  mk(g,0,nA,640-260,420);mk(g,1,nB,640+260,420);
  for(const b of g.bases){b.x=b.owner===0?30:1250;b.y=30;b.hp=1e12;}
  let t=0;
  for(;t<120;t++){
    for(const [owner,micro] of [[0,microA],[1,microB]]){
      if(!micro)continue;
      const o=snapshot(g,owner);o.lastErrors=[];
      let cmds=[];try{cmds=micro(o,g,owner)||[]}catch(e){}
      let k=0;for(const c of cmds){if(k++>=10)break;try{R.command(g,owner,c)}catch(e){}}
    }
    for(let i=0;i<20;i++)step(g,DT);
    if(!g.units.some(u=>u.owner===0)||!g.units.some(u=>u.owner===1))break;
  }
  const alive=[0,1].map(p=>g.units.filter(u=>u.owner===p));
  return {sec:t,a:alive[0].length,b:alive[1].length,hpA:Math.round(alive[0].reduce((s,u)=>s+u.hp,0)),hpB:Math.round(alive[1].reduce((s,u)=>s+u.hp,0)),winner:alive[0].length&&!alive[1].length?0:(!alive[0].length&&alive[1].length?1:null)};
}
const focus=(o)=>{const me=o.units.filter(u=>u.owner===0),foe=o.units.filter(u=>u.owner!==0);
 if(!me.length||!foe.length)return[];const c={x:me.reduce((s,u)=>s+u.x,0)/me.length,y:me.reduce((s,u)=>s+u.y,0)/me.length};
 const tgt=foe.slice().sort((a,b)=>(a.hp+0.25*Math.hypot(a.x-c.x,a.y-c.y))-(b.hp+0.25*Math.hypot(b.x-c.x,b.y-c.y)))[0];
 return [{type:'attack',units:me.map(u=>u.id),target:tgt.id}];};
const focus1=(o)=>{const me=o.units.filter(u=>u.owner===1),foe=o.units.filter(u=>u.owner!==1);
 if(!me.length||!foe.length)return[];const c={x:me.reduce((s,u)=>s+u.x,0)/me.length,y:me.reduce((s,u)=>s+u.y,0)/me.length};
 const tgt=foe.slice().sort((a,b)=>(a.hp+0.25*Math.hypot(a.x-c.x,a.y-c.y))-(b.hp+0.25*Math.hypot(b.x-c.x,b.y-c.y)))[0];
 return [{type:'attack',units:me.map(u=>u.id),target:tgt.id}];};
// spread: each unit attacks nearest enemy
function spread(owner){return (o)=>{const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
 if(!me.length||!foe.length)return[];const groups={};
 for(const u of me){let best=null,bd=1e9;for(const v of foe){const d=Math.hypot(v.x-u.x,v.y-u.y);if(d<bd){bd=d;best=v;}}if(best)(groups[best.id]=groups[best.id]||[]).push(u.id);}
 const cmds=[];for(const k in groups)cmds.push({type:'attack',units:groups[k],target:k});return cmds.slice(0,10);};}
// flank: first 5 move to a flank point then all focus
function flank(owner){return (o)=>{const me=o.units.filter(u=>u.owner===owner),foe=o.units.filter(u=>u.owner!==owner);
 if(!me.length||!foe.length)return[];
 const c={x:me.reduce((s,u)=>s+u.x,0)/me.length,y:me.reduce((s,u)=>s+u.y,0)/me.length};
 const tgt=foe.slice().sort((a,b)=>(a.hp+0.25*Math.hypot(a.x-c.x,a.y-c.y))-(b.hp+0.25*Math.hypot(b.x-c.x,b.y-c.y)))[0];
 if(o.now<2){const half=me.slice(0,Math.ceil(me.length/2));const mid=foe.reduce((s,u)=>({x:s.x+u.x,y:s.y+u.y}),{x:0,y:0});const fc={x:mid.x/foe.length,y:mid.y/foe.length};
   return [{type:'move',units:half.map(u=>u.id),x:fc.x,y:fc.y-160},{type:'attack',units:me.map(u=>u.id),target:tgt.id}];}
 return [{type:'attack',units:me.map(u=>u.id),target:tgt.id}];};}
for(const [na,nb] of [[12,12],[15,15],[10,10]]){
 console.log('focus vs spread',na,nb,JSON.stringify(duel(na,nb,focus,spread(1))));
 console.log('focus vs flank ',na,nb,JSON.stringify(duel(na,nb,focus,flank(1))));
 console.log('focus vs focus ',na,nb,JSON.stringify(duel(na,nb,focus,focus1)));
}
