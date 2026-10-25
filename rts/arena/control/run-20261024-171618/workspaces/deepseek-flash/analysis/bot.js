'use strict';
// Parameterized candidate bot for strategy search.
const TYPES={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const DPS={rifle:13/.8,tank:40/2,raider:16/.65};
const HP={rifle:110,tank:360,raider:150,worker:70};
const RANGE={rifle:115,tank:160,raider:94,worker:0};
const POWER={rifle:16.25*110,tank:20*360,raider:24.6*150};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={
  workers:4, build:['tank'],
  kiteHp:0.45,
  kiteAll:false,
  focus:'nearest',
  engageMul:1.0,
  standRange:520,
  capture:true, captureN:1, captureSafe:200,
  upgrades:true, upT:20, reserve:0,
  repair:true,
  pushMul:2.2,
};
function makeBot(cfgOverride){
  const C=Object.assign({},DEF,cfgOverride||{});
  const st={prod:0,kite:{},cap:{}};
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
    if(workers.length+qWorkers<C.workers&&cr-spent>=50&&q.length<3&&my.length+q.length<40){cmds.push({type:'train',unit:'worker'});spent+=50;}
    const next=C.build[st.prod%C.build.length];
    if(cr-spent>=TYPES[next].cost&&q.length<2&&my.length+q.length<40){cmds.push({type:'train',unit:next});spent+=TYPES[next].cost;st.prod++;}
    if(C.upgrades&&lvl<2&&t>=C.upT){const cost=180+lvl*120;if(cr-spent>=cost+C.reserve){cmds.push({type:'upgrade'});spent+=cost;}}
    if(C.repair&&base.hp<base.maxHp-300&&cr-spent>=140&&(t-obs.players[p].repairAt)>=30){cmds.push({type:'repair'});spent+=100;}
    if(army.length){
      const cent={x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length};
      const myPow=army.reduce((s,u)=>s+POWER[u.type],0);
      const threats=eCombat.slice().sort((a,b)=>dist(a,cent)-dist(b,cent));
      const near=threats.filter(u=>dist(u,cent)<=C.standRange);
      const ePow=near.reduce((s,u)=>s+POWER[u.type],0);
      const baseThreat=eCombat.filter(u=>dist(u,base)<380);
      const capIds=new Set();
      if(C.capture){
        for(const uid of Object.keys(st.cap)){const u=army.find(x=>x.id===uid);const nd=nodes.find(n=>n.id===st.cap[uid]);if(!u||!nd||nd.owner===p){delete st.cap[uid];continue;}if(eCombat.some(v=>dist(v,nd)<170)){delete st.cap[uid];continue;}capIds.add(uid);}
        if(!baseThreat.length&&near.length===0){
          for(const nd of nodes){
            if(nd.owner===p)continue;
            if(Object.values(st.cap).includes(nd.id))continue;
            if(eCombat.some(v=>dist(v,nd)<C.captureSafe))continue;
            if(capIds.size>=C.captureN)break;
            const cand=army.filter(u=>!capIds.has(u.id)).sort((a,b)=>dist(a,nd)-dist(b,nd))[0];
            if(!cand)break;
            if(army.length-capIds.size<3)break;
            st.cap[cand.id]=nd.id;capIds.add(cand.id);
          }
        }
      }
      const capUnits=army.filter(u=>capIds.has(u.id));
      const main=army.filter(u=>!capIds.has(u.id));
      let mode='push';
      if(baseThreat.length)mode='defend';
      else if(near.length>0){
        if(myPow>0&&ePow>myPow*C.engageMul)mode='retreat';
        else if(myPow>0&&ePow<myPow*0.35)mode='push';
        else mode='fight';
      }
      let obj;
      if(mode==='push'){
        const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(a,cent)-dist(b,cent));
        if(ebase&&myPow>ePow*C.pushMul&&t>60)obj={x:ebase.x,y:ebase.y};
        else if(free.length)obj={x:free[0].x,y:free[0].y};
        else obj={x:640,y:420};
      }
      if(mode==='retreat')obj={x:base.x-dir*60,y:base.y};
      if(mode==='defend')obj={x:base.x+dir*120,y:base.y};
      let ft=null;
      if(mode==='fight'||mode==='defend'){
        const pool=(mode==='defend'?baseThreat:(near.length?near:threats.filter(u=>dist(u,cent)<=C.standRange+200)));
        if(pool.length){
          if(C.focus==='lowhp')ft=pool.slice().sort((a,b)=>a.hp-b.hp||dist(a,cent)-dist(b,cent))[0];
          else if(C.focus==='loweff')ft=pool.slice().sort((a,b)=>(a.hp/a.maxHp+0.001*dist(a,cent))-(b.hp/b.maxHp+0.001*dist(b,cent)))[0];
          else ft=pool.slice().sort((a,b)=>dist(a,cent)-dist(b,cent))[0];
        }
      }
      const atk=[];
      for(const u of main){
        const nearU=eCombat.filter(v=>dist(u,v)<=RANGE[u.type]+v.r+45).sort((a,b)=>dist(u,a)-dist(u,b))[0];
        const hpF=u.hp/u.maxHp;
        const wantKite=nearU&&((hpF<C.kiteHp)||(C.kiteAll&&u.fireAt>t));
        if(wantKite){
          const d=dist(u,nearU)||1;
          cmds.push({type:'move',units:[u.id],x:Math.max(20,Math.min(1260,u.x+(u.x-nearU.x)/d*60)),y:Math.max(20,Math.min(820,u.y+(u.y-nearU.y)/d*60))});
          continue;
        }
        if((mode==='fight'||mode==='defend')&&ft)atk.push(u.id);
        else cmds.push({type:'attackMove',units:[u.id],x:obj.x,y:obj.y});
      }
      if(atk.length&&ft)cmds.push({type:'attack',units:atk,target:ft.id});
      for(const u of capUnits){const nd=nodes.find(n=>n.id===st.cap[u.id]);if(nd)cmds.push({type:'move',units:[u.id],x:nd.x,y:nd.y});}
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeBot};
