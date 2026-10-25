'use strict';
const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function makePolicy(kind,opts={}){
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const cmds=[];
    for(const u of my){
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      const near=fs[0];
      if(!near){continue;}
      const d=dist(u,near);
      const rng=R.TYPES[u.type].range;
      const ready=u.fireAt-t<=1.0;
      if(kind==='tankkite'){
        if(d<=rng+near.r+12){
          if(ready){cmds.push({type:'attack',units:[u.id],target:near.id});}
          else{
            const dx=(u.x-near.x)/d,dy=(u.y-near.y)/d;
            cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+dx*50)),y:Math.max(15,Math.min(825,u.y+dy*50))});
          }
        } else {
          cmds.push({type:'attackMove',units:[u.id],x:near.x,y:near.y});
        }
      } else if(kind==='tankstand'){
        if(d<=rng+near.r+12)cmds.push({type:'attack',units:[u.id],target:near.id});
        else cmds.push({type:'attackMove',units:[u.id],x:near.x,y:near.y});
      } else if(kind==='raider'){
        // focus lowest hp enemy in range; chase
        const inr=fs.filter(v=>dist(u,v)<=rng+v.r+12);
        const tgt=(inr.length?inr:fs).sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0];
        if(dist(u,tgt)<=rng+tgt.r)cmds.push({type:'attack',units:[u.id],target:tgt.id});
        else cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
      } else if(kind==='raiderkite'){
        const inr=fs.filter(v=>dist(u,v)<=rng+v.r+12);
        const tgt=(inr.length?inr:fs).sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0];
        if(dist(u,tgt)<=rng+tgt.r+4){
          if(ready)cmds.push({type:'attack',units:[u.id],target:tgt.id});
          else {const dd=dist(u,tgt);const dx=(u.x-tgt.x)/dd,dy=(u.y-tgt.y)/dd;
            cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+dx*30)),y:Math.max(15,Math.min(825,u.y+dy*30))});}
        } else cmds.push({type:'attackMove',units:[u.id],x:tgt.x,y:tgt.y});
      }
    }
    return cmds.slice(0,10);
  };
}
function run(kindA,nA,kindB,nB,opts={}){
  const m=R.createMatch({id:'arena',players:[{name:'A'},{name:'B'}],seed:1});
  R.command(m,0,{type:'start'});
  // clear all initial units/bases? keep bases far; remove starting units and workers
  m.units.length=0; m.mines.length=0;
  const ax=440, bx=840, y=420;
  for(let i=0;i<nA;i++){const u=R.spawn(m,0,kindA.startsWith('tank')?'tank':'raider',ax-((i%4)*30),y+Math.floor(i/4)*30);u.order={type:'hold'};}
  for(let i=0;i<nB;i++){const u=R.spawn(m,1,kindB.startsWith('tank')?'tank':'raider',bx+((i%4)*30),y+Math.floor(i/4)*30);u.order={type:'hold'};}
  const pa=makePolicy(kindA),pb=makePolicy(kindB);
  let t=0;
  while(m.status==='playing'&&m.now<120){
    const cmdsA=pa(R.snapshot(m,0))||[], cmdsB=pb(R.snapshot(m,1))||[];
    for(const c of cmdsA.slice(0,10))try{R.command(m,0,c);}catch(e){}
    for(const c of cmdsB.slice(0,10))try{R.command(m,1,c);}catch(e){}
    for(let k=0;k<20;k++)R.step(m);
    const aliveA=m.units.filter(u=>u.owner===0&&u.hp>0).length, aliveB=m.units.filter(u=>u.owner===1&&u.hp>0).length;
    if(!aliveA||!aliveB)break;
  }
  return {winner:m.winner,reason:m.reason,t:m.now,a:m.units.filter(u=>u.owner===0).length,b:m.units.filter(u=>u.owner===1).length};
}
module.exports={run,makePolicy};
if(require.main===module){
  // equal credits: tank160, raider100
  const cases=[
    ['tankkite',5,'raider',8],
    ['tankkite',4,'raider',6],
    ['tankkite',3,'raider',5],
    ['tankkite',2,'raider',3],
    ['tankstand',5,'raider',8],
    ['tankkite',8,'raider',13],
  ];
  for(const c of cases){const r=run(...c);console.log(c.join(' '),'=> winner',r.winner,'t',r.t.toFixed(1),'left',r.a+':'+r.b);}
}
