'use strict';
// Bot v3: spread-formation kiting micro + tunable macro.
const TYPES={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const POWER={rifle:16.25*110,tank:20*360,raider:24.6*150};
const RANGE={rifle:115,tank:160,raider:94,worker:0};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={
  workers:4, build:['tank'],
  spread:0.6, form:50, kiteLen:55, kiteMode:'alt',
  engageR:188, armyR:520,
  focus:'nearest',
  upgrades:true, upT:0, reserve:40,
  repair:true,
  capture:true, captureN:1, captureSafe:190, captureMinArmy:3,
  pushMul:1.6, pushTime:70,
  retreatMul:0.55,
  stance:'balanced', anchorD:150, anchorR:520,
  opening:'north3',   // north3 | north4 | split
  pushBaseWhenClear:true,
  kiteTypes:['tank','raider'],
  rifleMicro:false,
};
function makeBot3(cfgOverride){
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
      if(rifles.length&&north){
        if(C.opening==='north4')cmds.push({type:'attackMove',units:rifles.map(u=>u.id),x:north.x,y:north.y});
        else if(C.opening==='split'&&side){
          cmds.push({type:'attackMove',units:rifles.slice(0,2).map(u=>u.id),x:side.x,y:side.y});
          cmds.push({type:'attackMove',units:rifles.slice(2).map(u=>u.id),x:north.x,y:north.y});
        }else if(side){
          cmds.push({type:'attackMove',units:[rifles[0].id],x:side.x,y:side.y});
          cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:north.x,y:north.y});
        }
      }
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
    if(C.repair&&base.hp<base.maxHp-300&&cr-spent>=100+C.reserve&&(t-obs.players[p].repairAt)>=30){cmds.push({type:'repair'});spent+=100;}
    if(army.length){
      army.sort((a,b)=>(a.id<b.id?-1:1));
      const cent={x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length};
      const myPow=army.reduce((s,u)=>s+POWER[u.type],0);
      const threats=eCombat.slice().sort((a,b)=>dist(a,cent)-dist(b,cent));
      const near=threats.filter(u=>dist(u,cent)<=C.armyR);
      const ePow=near.reduce((s,u)=>s+POWER[u.type],0);
      const baseThreat=eCombat.filter(u=>dist(u,base)<400);
      // ---- capture assignment ----
      const capIds=new Set();
      if(C.capture){
        for(const uid of Object.keys(st.cap)){const u=army.find(x=>x.id===uid);const nd=nodes.find(n=>n.id===st.cap[uid]);if(!u||!nd||nd.owner===p){delete st.cap[uid];continue;}if(eCombat.some(v=>dist(v,nd)<165)){delete st.cap[uid];continue;}capIds.add(uid);}
        const canCap=near.length===0&&!baseThreat.length;
        if(canCap){
          for(const nd of nodes){
            if(nd.owner===p)continue;
            if(Object.values(st.cap).includes(nd.id))continue;
            if(eCombat.some(v=>dist(v,nd)<C.captureSafe))continue;
            if(capIds.size>=C.captureN)break;
            if(army.length-capIds.size<C.captureMinArmy)break;
            const cand=army.filter(u=>!capIds.has(u.id)).sort((a,b)=>dist(a,nd)-dist(b,nd))[0];
            if(!cand)break;
            st.cap[cand.id]=nd.id;capIds.add(cand.id);
          }
        }
      }
      const capUnits=army.filter(u=>capIds.has(u.id));
      const main=army.filter(u=>!capIds.has(u.id));
      // ---- posture ----
      const anchor=C.stance==='turtle'?{x:base.x+dir*C.anchorD,y:base.y}:null;
      let mode='advance';
      if(baseThreat.length&&ePow>myPow*0.4)mode='defend';
      else if(near.length){
        if(myPow>0&&ePow>myPow*(1/C.retreatMul))mode='retreat';
        else mode='engage';
      }
      let obj;
      const unowned=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(a,cent)-dist(b,cent));
      if(mode==='retreat')obj={x:base.x+dir*60,y:base.y};
      else if(mode==='defend')obj={x:base.x+dir*110,y:base.y};
      else{
        if(ebase&&C.pushBaseWhenClear&&ePow<myPow*C.pushMul&&t>C.pushTime&&near.length===0)obj={x:ebase.x,y:ebase.y};
        else if(unowned.length)obj={x:unowned[0].x,y:unowned[0].y};
        else if(ebase)obj={x:ebase.x,y:ebase.y};
        else obj={x:640,y:420};
        if(anchor&&dist(cent,anchor)>C.anchorR)obj=anchor;
      }
      // ---- micro ----
      const mainCent=main.length?{x:main.reduce((s,u)=>s+u.x,0)/main.length,y:main.reduce((s,u)=>s+u.y,0)/main.length}:cent;
      const pool=(mode==='defend'?baseThreat:near);
      const focus=pool.length?pool.slice().sort((a,b)=>C.focus==='lowhp'?(a.hp-b.hp):(dist(a,mainCent)-dist(b,mainCent)))[0]:null;
      const fcent=near.length?{x:near.reduce((s,u)=>s+u.x,0)/near.length,y:near.reduce((s,u)=>s+u.y,0)/near.length}:null;
      const atk=[];
      main.forEach((u,idx)=>{
        const fs=eCombat.slice().sort((a,b)=>dist(u,a)-dist(u,b));
        const nu=fs[0];
        if(nu&&dist(u,nu)<=RANGE[u.type]+nu.r){
          const ready=u.fireAt<=t+1e-9;
          const canKite=C.kiteTypes.includes(u.type);
          let kite=false;
          if(canKite&&!ready){
            if(C.kiteMode==='always')kite=true;
            else if(C.kiteMode==='alt')kite=!st.kite[u.id];
          }
          if(kite){
            st.kite[u.id]=true;
            const dx=(u.x-nu.x)||1,dy=(u.y-nu.y)||1,d=Math.hypot(dx,dy);
            let vx=dx/d,vy=dy/d;
            if(C.spread>0){
              const sgn=(idx%2===0?1:-1);
              const nx=vx*(1-C.spread)+(-dy/d)*C.spread*sgn;
              const ny=vy*(1-C.spread)+(dx/d)*C.spread*sgn;
              const l=Math.hypot(nx,ny)||1;vx=nx/l;vy=ny/l;
            }
            cmds.push({type:'move',units:[u.id],x:Math.max(20,Math.min(1260,u.x+vx*C.kiteLen)),y:Math.max(20,Math.min(820,u.y+vy*C.kiteLen))});
            return;
          }
          st.kite[u.id]=false;
          if(nu&&dist(u,nu)<=C.engageR)atk.push(u.id);
          else cmds.push({type:'attack',units:[u.id],target:nu.id});
          return;
        }
        st.kite[u.id]=false;
        // approach in spread formation
        if(nu&&(mode==='engage'||mode==='defend')&&dist(nu,mainCent)<=C.armyR+200){
          if(C.form>0&&fcent){
            const ddx=fcent.x-mainCent.x,ddy=fcent.y-mainCent.y,dl=Math.hypot(ddx,ddy)||1;
            const px=-ddy/dl,py=ddx/dl;
            const off=(idx-(main.length-1)/2)*C.form;
            cmds.push({type:'attackMove',units:[u.id],x:Math.max(20,Math.min(1260,nu.x+px*off)),y:Math.max(20,Math.min(820,nu.y+py*off))});
          }else cmds.push({type:'attackMove',units:[u.id],x:nu.x,y:nu.y});
        }else{
          cmds.push({type:'attackMove',units:[u.id],x:obj.x,y:obj.y});
        }
      });
      if(atk.length&&focus)cmds.push({type:'attack',units:atk.slice(0,30),target:focus.id});
      for(const u of capUnits){if(cmds.length<10){const nd=nodes.find(n=>n.id===st.cap[u.id]);if(nd)cmds.push({type:'move',units:[u.id],x:nd.x,y:nd.y});}}
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeBot3};
