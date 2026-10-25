'use strict';
// Raider harassment bot: fast units, avoid tank balls, raid workers/base, capture nodes.
const TYPES={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const POWER={rifle:16.25*110,tank:20*360,raider:24.6*150};
const RANGE={rifle:115,tank:160,raider:94,worker:0};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={
  workers:3, build:['raider'],
  workers2:4, workerT:40,
  massT:38, raidT:30,
  engageMul:1.15,
  focus:'nearest',
  kiteHp:0.3, kiteLen:55,
  upgrades:true, upT:30,
  capture:true, captureN:1, captureSafe:170,
  repair:true,
  pushMul:1.0, pushTime:45,
  diveHp:900,       // dive base when base hp below / no defenders
  defendR:430,
};
function makeRaiderBot(cfgOverride){
  const C=Object.assign({},DEF,cfgOverride||{});
  const st={cap:{},prod:0};
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
    const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
    if(!base)return[];
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const workers=my.filter(u=>u.type==='worker');
    const army=my.filter(u=>u.type!=='worker');
    const eCombat=foes.filter(u=>u.type!=='worker');
    const eWork=foes.filter(u=>u.type==='worker');
    const nodes=obs.nodes;
    const cmds=[];
    const dir=base.x<640?1:-1;
    if(t===0){
      const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(workers.length&&mine)cmds.push({type:'gather',units:workers.map(u=>u.id),target:mine.id});
      const rifles=army.filter(u=>u.type==='rifle').sort((a,b)=>a.id<b.id?-1:1);
      const north=nodes.filter(n=>n.y<300).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      const side=nodes.filter(n=>n.y>400).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(rifles.length>=4&&north){
        if(side)cmds.push({type:'attackMove',units:[rifles[0].id],x:side.x,y:side.y});
        cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:north.x,y:north.y});
      }else if(rifles.length&&north)cmds.push({type:'attackMove',units:rifles.map(u=>u.id),x:north.x,y:north.y});
      cmds.push({type:'rally',x:640,y:420});
      return cmds.slice(0,10);
    }
    const cr=obs.players[p].credits, lvl=obs.players[p].level;
    const q=base.queue; let spent=0;
    const qWorkers=q.filter(x=>x.type==='worker').length;
    const wantWorkers=t<C.workerT?C.workers:C.workers2;
    if(workers.length+qWorkers<wantWorkers&&cr-spent>=50&&q.length<3&&my.length+q.length<40){cmds.push({type:'train',unit:'worker'});spent+=50;}
    const next=C.build[st.prod%C.build.length];
    if(cr-spent>=TYPES[next].cost&&q.length<2&&my.length+q.length<40){cmds.push({type:'train',unit:next});spent+=TYPES[next].cost;st.prod++;}
    if(C.upgrades&&lvl<2&&t>=C.upT){const cost=180+lvl*120;if(cr-spent>=cost){cmds.push({type:'upgrade'});spent+=cost;}}
    if(C.repair&&base.hp<base.maxHp-300&&cr-spent>=140&&(t-obs.players[p].repairAt)>=30){cmds.push({type:'repair'});spent+=100;}
    if(army.length){
      const cent={x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length};
      const myPow=army.reduce((s,u)=>s+POWER[u.type],0);
      const threats=eCombat.slice().sort((a,b)=>dist(a,cent)-dist(b,cent));
      const near=threats.filter(u=>dist(u,cent)<=420);
      const ePow=near.reduce((s,u)=>s+POWER[u.type],0);
      const baseThreat=eCombat.filter(u=>dist(u,base)<420);
      // capture
      const capIds=new Set();
      if(C.capture){
        for(const uid of Object.keys(st.cap)){const u=army.find(x=>x.id===uid);const nd=nodes.find(n=>n.id===st.cap[uid]);if(!u||!nd||nd.owner===p){delete st.cap[uid];continue;}if(eCombat.some(v=>dist(v,nd)<150)){delete st.cap[uid];continue;}capIds.add(uid);}
        for(const nd of nodes){
          if(nd.owner===p)continue;
          if(Object.values(st.cap).includes(nd.id))continue;
          if(eCombat.some(v=>dist(v,nd)<C.captureSafe))continue;
          if(capIds.size>=C.captureN)break;
          const cand=army.filter(u=>!capIds.has(u.id)).sort((a,b)=>dist(a,nd)-dist(b,nd))[0];
          if(!cand)break;
          if(army.length-capIds.size<4)break;
          st.cap[cand.id]=nd.id;capIds.add(cand.id);
        }
      }
      const capUnits=army.filter(u=>capIds.has(u.id));
      const main=army.filter(u=>!capIds.has(u.id));
      const aCent=main.length?{x:main.reduce((s,u)=>s+u.x,0)/main.length,y:main.reduce((s,u)=>s+u.y,0)/main.length}:cent;
      const weak=ePow<myPow*0.6;
      // decide objective
      let obj=null, mode='raid';
      const defenders=eCombat.filter(v=>dist(v,ebase)<330);
      if(baseThreat.length>0&&ePow>myPow*0.5){obj={x:base.x,y:base.y};mode='defend';}
      else if(t<C.massT){obj={x:base.x+dir*60,y:base.y};mode='regroup';}
      else if(eWork.length&&(near.length===0||near[0]&&dist(near[0],eWork[0])>500)){obj={x:eWork[0].x,y:eWork[0].y};mode='raidWork';}
      else if(myPow>0&&(defenders.length===0||ePow*1.6<myPow)&&t>C.pushTime){obj={x:ebase.x,y:ebase.y};mode='dive';}
      else{
        const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(a,aCent)-dist(b,aCent));
        if(weak&&near.length===0&&free.length){obj={x:free[0].x,y:free[0].y};mode='node';}
        else if(free.length){obj={x:free[0].x,y:free[0].y};mode='node';}
        else obj={x:ebase.x,y:ebase.y};
      }
      // if enemy army close and weaker -> fight
      let ft=null;
      if(near.length&&(ePow<myPow/C.engageMul||near.some(v=>dist(v,aCent)<220))){
        const p2=near;
        if(C.focus==='lowhp')ft=p2.slice().sort((a,b)=>a.hp-b.hp)[0];
        else ft=p2.slice().sort((a,b)=>dist(a,aCent)-dist(b,aCent))[0];
      }
      const atk=[],far=[],kiteIds=[];
      for(const u of main){
        const nearU=eCombat.filter(v=>dist(u,v)<=RANGE[u.type]+v.r+8).sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(nearU&&u.hp/u.maxHp<C.kiteHp){
          const d=dist(u,nearU)||1;
          cmds.push({type:'move',units:[u.id],x:Math.max(20,Math.min(1260,u.x+(u.x-nearU.x)/d*C.kiteLen)),y:Math.max(20,Math.min(820,u.y+(u.y-nearU.y)/d*C.kiteLen))});
          continue;
        }
        if(ft){
          if(dist(u,ft)<=RANGE[u.type]+ft.r+10&&dist(u,ft)<=230)atk.push(u.id);
          else far.push(u.id);
        }else far.push(u.id);
      }
      if(atk.length&&ft&&cmds.length<9)cmds.push({type:'attack',units:atk.slice(0,30),target:ft.id});
      if(far.length&&cmds.length<9)cmds.push({type:'attackMove',units:far.slice(0,30),x:obj.x,y:obj.y});
      for(const u of capUnits){if(cmds.length<10){const nd=nodes.find(n=>n.id===st.cap[u.id]);if(nd)cmds.push({type:'move',units:[u.id],x:nd.x,y:nd.y});}}
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeRaiderBot};
