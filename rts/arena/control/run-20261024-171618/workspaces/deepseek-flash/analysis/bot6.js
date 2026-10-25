'use strict';
// Bot v5: early double-outpost opening + kiting tank army + aggressive upgrades.
const TYPES={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const POWER={rifle:16.25*110,tank:20*360,raider:24.6*150};
const RANGE={rifle:115,tank:160,raider:94,worker:0};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={
  workers:4, raidN:0, buildFirst:[],
  kiteMode:'alt', kiteLen:55, spread:0, form:0,
  engageR:188, focusR:218, armyR:560,
  upRes1:0, upRes2:0, upgrades:true,
  repair:true, repairRes:250,
  earlyNodes:true, captureN:1, captureSafe:170,
  pushMul:1.0, pushTime:60,
  retreatAt:1.9,       // retreat when ePow > ownPow*retreatAt
  posture:'nodes',     // nodes | home | push
  anchorD:120, anchorR:300,
  maxQueue:2,
  workerSafe:false, mineThreat:240, leashR:0, guard:false,
};
function makeBot5(cfgOverride){
  const C=Object.assign({},DEF,cfgOverride||{});
  const st={cap:{},prod:0,kite:{},built:0};
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
    const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
    if(!base)return[];
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const army=my.filter(u=>u.type!=='worker');
    const workers=my.filter(u=>u.type==='worker');
    const eCombat=foes.filter(u=>u.type!=='worker');
    const nodes=obs.nodes, cmds=[];
    const dir=base.x<640?1:-1;
    const nearNode=nodes.filter(n=>n.y>400).sort((a,b)=>dist(a,base)-dist(b,base))[0];
    const northNode=nodes.filter(n=>n.y<300)[0]||nodes[0];
    const mineNode=nodes.filter(n=>n.y>400).sort((a,b)=>dist(a,base)-dist(b,base))[0];
    // ---------- opening ----------
    if(t===0){
      if(C.buildFirst.length){cmds.push({type:'train',unit:C.buildFirst[0]});st.built=1;}else cmds.push({type:'train',unit:'tank'});
      cmds.push({type:'train',unit:'worker'});
      cmds.push({type:'rally',x:640,y:420});
      const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(mine&&workers.length)cmds.push({type:'gather',units:workers.map(u=>u.id),target:mine.id});
      const rifles=army.filter(u=>u.type==='rifle').sort((a,b)=>a.id<b.id?-1:1);
      if(rifles.length>=4){
        if(C.earlyNodes){
          cmds.push({type:'attackMove',units:rifles.slice(0,2).map(u=>u.id),x:mineNode.x,y:mineNode.y});
          cmds.push({type:'attackMove',units:rifles.slice(2,4).map(u=>u.id),x:northNode.x,y:northNode.y});
        }else{
          cmds.push({type:'attackMove',units:[rifles[0].id],x:mineNode.x,y:mineNode.y});
          cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:northNode.x,y:northNode.y});
        }
      }
      return cmds.slice(0,10);
    }
    // ---------- production ----------
    const cr=obs.players[p].credits, lvl=obs.players[p].level, q=base.queue;
    let spent=0;
    const qw=q.filter(x=>x.type==='worker').length;
    if(workers.length+qw<C.workers&&cr-spent>=50&&q.length<3&&my.length+q.length<40){cmds.push({type:'train',unit:'worker'});spent+=50;}
    if(st.built<C.buildFirst.length){const bt=C.buildFirst[st.built];if(cr-spent>=TYPES[bt].cost&&q.length<C.maxQueue&&my.length+q.length<40){cmds.push({type:'train',unit:bt});spent+=TYPES[bt].cost;st.built=(st.built||0)+1;}}
    else if(cr-spent>=160&&q.length<C.maxQueue&&my.length+q.length<40){cmds.push({type:'train',unit:'tank'});spent+=160;}
    if(C.upgrades&&lvl<2){const cost=180+lvl*120;if(cr-spent>=cost+(lvl===0?C.upRes1:C.upRes2)){cmds.push({type:'upgrade'});spent+=cost;}}
    // ---- worker safety: mine only at safe mines, else retreat to base ----
    if(C.workerSafe&&workers.length){
      const safe=obs.mines.filter(m=>m.ore>0&&!eCombat.some(v=>dist(v,m)<C.mineThreat));
      const cur=st.mine&&obs.mines.find(m=>m.id===st.mine);
      let tgt=null;
      if(cur&&cur.ore>0&&safe.includes(cur))tgt=cur;
      else if(safe.length)tgt=safe.sort((a,b)=>dist(a,base)-dist(b,base))[0];
      st.mine=tgt?tgt.id:null;
      if(tgt)cmds.push({type:'gather',units:workers.map(u=>u.id),target:tgt.id});
      else cmds.push({type:'move',units:workers.map(u=>u.id),x:Math.max(20,base.x+dir*70),y:base.y});
    }
    if(C.repair&&base.hp<base.maxHp-C.repairRes&&cr-spent>=100&&(t-obs.players[p].repairAt)>=30){cmds.push({type:'repair'});spent+=100;}
    // ---------- army ----------
    if(army.length){
      const combat=army.slice().sort((a,b)=>(a.id<b.id?-1:1));
      const cent={x:combat.reduce((s,u)=>s+u.x,0)/combat.length,y:combat.reduce((s,u)=>s+u.y,0)/combat.length};
      const myPow=combat.reduce((s,u)=>s+POWER[u.type],0);
      const threats=eCombat.slice().sort((a,b)=>dist(a,cent)-dist(b,cent));
      const near=threats.filter(u=>dist(u,cent)<=C.armyR);
      const ePow=near.reduce((s,u)=>s+POWER[u.type],0);
      const baseThreat=eCombat.filter(u=>dist(u,base)<420);
      // capture assignments (early phase: dedicated, later: opportunistic)
      const capIds=new Set();
      for(const uid of Object.keys(st.cap)){
        const u=combat.find(x=>x.id===uid);const nd=nodes.find(n=>n.id===st.cap[uid]);
        if(!u||!nd||nd.owner===p){delete st.cap[uid];continue;}
        if(eCombat.some(v=>dist(v,nd)<155)){delete st.cap[uid];continue;}
        capIds.add(uid);
      }
      if(C.captureN>0&&!baseThreat.length){
        for(const nd of nodes){
          if(nd.owner===p||Object.values(st.cap).includes(nd.id))continue;
          if(eCombat.some(v=>dist(v,nd)<C.captureSafe))continue;
          if(capIds.size>=C.captureN)continue;
          if(combat.length-capIds.size<3)break;
          const cand=combat.filter(u=>!capIds.has(u.id)).sort((a,b)=>dist(a,nd)-dist(b,nd))[0];
          if(!cand)break;
          st.cap[cand.id]=nd.id;capIds.add(cand.id);
        }
      }
      const main=combat.filter(u=>!capIds.has(u.id));
      const raiders=main.filter(u=>u.type==='raider');
      const raidIds=new Set(raiders.map(u=>u.id));
      for(const u of raiders){
        const ew=foes.filter(v=>v.type==='worker'&&v.hp>0).sort((a,b)=>dist(u,a)-dist(u,b))[0];
        const tankNear=eCombat.filter(v=>dist(u,v)<210).sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(u.hp/u.maxHp<0.45&&tankNear){const d=dist(u,tankNear)||1;cmds.push({type:'move',units:[u.id],x:u.x+(u.x-tankNear.x)/d*70,y:u.y+(u.y-tankNear.y)/d*70});continue;}
        if(ew&&dist(u,ew)<330){cmds.push({type:'attack',units:[u.id],target:ew.id});continue;}
        const em=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,ebase)-dist(b,ebase))[0];
        if(ew){cmds.push({type:'attackMove',units:[u.id],x:ew.x,y:ew.y});continue;}
        if(em)cmds.push({type:'attackMove',units:[u.id],x:em.x,y:em.y});
      }
      // posture / objective
      const anchor={x:base.x+dir*C.anchorD,y:base.y};
      let mode='fight';
      if(baseThreat.length&&ePow>myPow*0.4)mode='defend';
      else if(C.guard&&eCombat.some(v=>dist(v,base)<dist(cent,base)-40))mode='defend';
      else if(near.length>0)mode=(myPow>0&&ePow>myPow*C.retreatAt)?'retreat':'fight';
      else mode='push';
      let obj;
      if(mode==='retreat')obj={x:base.x+dir*40,y:base.y};
      else if(mode==='defend')obj={x:base.x+dir*110,y:base.y};
      else{
        const unowned=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(a,cent)-dist(b,cent));
        if(C.posture==='home'&&dist(cent,anchor)>C.anchorR)obj=anchor;
        else if(ebase&&ePow<myPow*C.pushMul&&t>C.pushTime&&near.length===0)obj={x:ebase.x,y:ebase.y};
        else if(unowned.length)obj={x:unowned[0].x,y:unowned[0].y};
        else if(ebase)obj={x:ebase.x,y:ebase.y};
        else obj={x:640,y:420};
      }
      const mainCent=main.length?{x:main.reduce((s,u)=>s+u.x,0)/main.length,y:main.reduce((s,u)=>s+u.y,0)/main.length}:cent;
      const focusPool=(mode==='defend'?baseThreat:near);
      const focus=focusPool.length?focusPool.slice().sort((a,b)=>dist(a,mainCent)-dist(b,mainCent))[0]:null;
      const eCent=eCombat.length?{x:eCombat.reduce((s,u)=>s+u.x,0)/eCombat.length,y:eCombat.reduce((s,u)=>s+u.y,0)/eCombat.length}:null;
      const atk=[];
      main.forEach((u,idx)=>{
        if(raidIds.has(u.id))return;
        if(C.leashR>0&&anchor&&dist(u,anchor)>C.leashR){cmds.push({type:'attackMove',units:[u.id],x:anchor.x,y:anchor.y});return;}
        const fs=eCombat.slice().sort((a,b)=>dist(u,a)-dist(u,b));
        const nu=fs[0];
        if(nu&&dist(u,nu)<=RANGE[u.type]+nu.r){
          const ready=u.fireAt<=t+1e-9;
          let kite=false;
          if(!ready&&u.type!=='rifle'){
            if(C.kiteMode==='always')kite=true;
            else if(C.kiteMode==='alt')kite=!st.kite[u.id];
          }
          if(kite){
            st.kite[u.id]=true;
            const dx=(u.x-nu.x)||1,dy=(u.y-nu.y)||1,d=Math.hypot(dx,dy);
            let vx=dx/d,vy=dy/d;
            if(C.spread>0){const sgn=(idx%2===0?1:-1);const nx=vx*(1-C.spread)+(-dy/d)*C.spread*sgn;const ny=vy*(1-C.spread)+(dx/d)*C.spread*sgn;const l=Math.hypot(nx,ny)||1;vx=nx/l;vy=ny/l;}
            cmds.push({type:'move',units:[u.id],x:Math.max(20,Math.min(1260,u.x+vx*C.kiteLen)),y:Math.max(20,Math.min(820,u.y+vy*C.kiteLen))});
            return;
          }
          st.kite[u.id]=false;
          if(dist(u,nu)<=C.focusR)atk.push(u.id);
          else cmds.push({type:'attack',units:[u.id],target:nu.id});
          return;
        }
        st.kite[u.id]=false;
        if(nu&&(mode==='fight'||mode==='defend')){
          if(C.form>0&&eCent){
            const ddx=eCent.x-mainCent.x,ddy=eCent.y-mainCent.y,dl=Math.hypot(ddx,ddy)||1;
            const px=-ddy/dl,py=ddx/dl,off=(idx-(main.length-1)/2)*C.form;
            cmds.push({type:'attackMove',units:[u.id],x:Math.max(20,Math.min(1260,nu.x+px*off)),y:Math.max(20,Math.min(820,nu.y+py*off))});
          }else cmds.push({type:'attackMove',units:[u.id],x:nu.x,y:nu.y});
        }else cmds.push({type:'attackMove',units:[u.id],x:obj.x,y:obj.y});
      });
      if(atk.length&&focus)cmds.push({type:'attack',units:atk.slice(0,30),target:focus.id});
      for(const u of combat)if(capIds.has(u.id)&&cmds.length<10){const nd=nodes.find(n=>n.id===st.cap[u.id]);if(nd)cmds.push({type:'move',units:[u.id],x:nd.x,y:nd.y});}
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeBot5, makeBot6:makeBot5};
