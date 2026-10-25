'use strict';
// Reconstruction v2 of frozen sol: fitted from recorded commands r1/r2.
const T={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={engage:186,fireWindow:0.85,kiteLen:50,maxQueue:2,upReserve:40,baseAttackR:200,objMode:'nearestNode',rebuildWorkers:false,repair:false,focus:'nearest',pushAllNodes:true};
function makeSol(cfg){
  const C=Object.assign({},DEF,cfg||{});
  const st={rally:null,obj:null};
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
    const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
    if(!base) return [];
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const eCombat=foes.filter(u=>u.type!=='worker');
    const army=my.filter(u=>u.type!=='worker');
    const workers=my.filter(u=>u.type==='worker');
    const nodes=obs.nodes;
    const dir=base.x<640?1:-1; // +1 if west base? careful: west base 170 => dir=1 means +x toward center.
    const sign=base.x<640?1:-1;
    const nearNodeId=(base.x<640)?'n2':'n1';
    const cmds=[];
    // ---------- opening ----------
    if(t===0){
      cmds.push({type:'train',unit:'tank'});
      cmds.push({type:'train',unit:'worker'});
      cmds.push({type:'rally',x:640+sign*47,y:267});
      const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(mine&&workers.length)cmds.push({type:'gather',units:workers.map(u=>u.id),target:mine.id});
      const rifles=army.filter(u=>u.type==='rifle').sort((a,b)=>a.id<b.id?-1:1);
      const nn=nodes.find(n=>n.id===nearNodeId)||nodes.filter(n=>n.y>400)[0];
      const north=nodes.find(n=>n.id==='n0');
      if(rifles.length>=4){
        cmds.push({type:'attackMove',units:[rifles[0].id],x:nn.x,y:nn.y});
        cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:north.x,y:north.y});
      }
      return cmds.slice(0,10);
    }
    if(t<=1.5)cmds.push({type:'rally',x:640+sign*47,y:420});
    // ---------- objective / rally ----------
    const armyC=army.length?{x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length}:{x:base.x,y:base.y};
    const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(armyC,a)-dist(armyC,b));
    let obj;
    const threat=eCombat.filter(u=>dist(u,base)<380);
    if(threat.length){obj={x:base.x+sign*120,y:base.y};}
    else if(free.length){obj={x:free[0].x+sign*55,y:free[0].y+8};}
    else if(ebase&&C.pushAllNodes){obj={x:ebase.x-sign*94,y:ebase.y};}
    else {const n0=nodes.find(n=>n.id==='n0');obj={x:n0.x+sign*55,y:n0.y+8};}
    // rally update: every 18s or when objective moved > 120
    if(!st.obj||Math.hypot(obj.x-st.obj.x,obj.y-st.obj.y)>120||Math.abs(t%18)<1e-9){
      if(!st.obj||Math.hypot(obj.x-st.obj.x,obj.y-st.obj.y)>120||t>10){st.obj=obj;cmds.push({type:'rally',x:obj.x,y:obj.y});}
    }
    st.rally=st.obj||obj;
    // ---------- workers: keep mining (sol re-tasks when mine dries up) ----------
    const eCombatNow=foes.filter(u=>u.type!=='worker');
    const cand=obs.mines.filter(m=>m.ore>0&&!eCombatNow.some(v=>dist(v,m)<220)).sort((a,b)=>dist(a,base)-dist(b,base));
    const taskMine=cand[0]||obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
    if(taskMine&&workers.length){
      const idle=workers.filter(u=>!u.order||u.order.type!=='gather'||u.order.target!==taskMine.id);
      if(idle.length)cmds.push({type:'gather',units:idle.map(u=>u.id),target:taskMine.id});
    }
    // ---------- production ----------
    const cr=obs.players[p].credits,lvl=obs.players[p].level,q=base.queue;
    if(C.rebuildWorkers){
      const qw=q.filter(x=>x.type==='worker').length;
      if(workers.length+qw<4&&cr>=50&&q.length<3)cmds.push({type:'train',unit:'worker'});
    }
    if(C.repair&&base.hp<base.maxHp-350&&cr>=140&&(t-obs.players[p].repairAt)>=30)cmds.push({type:'repair'});
    if(cr>=160&&q.length<C.maxQueue)cmds.push({type:'train',unit:'tank'});
    if(lvl<2){
      const cost=180+lvl*120;
      if(cr>=cost+C.upReserve)cmds.push({type:'upgrade'});
    }
    // ---------- per-unit micro ----------
    for(const u of army.slice().sort((a,b)=>a.id<b.id?-1:1)){
      const fs=foes.filter(v=>dist(u,v)<=C.engage).sort((a,b)=>dist(u,a)-dist(u,b));
      const near=fs[0];
      const stats=T[u.type];
      if(near){
        let tgt=near;
        if(C.focus==='lowhp'){
          const fs2=foes.filter(v=>dist(u,v)<=C.engage);
          tgt=fs2.slice().sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0]||near;
        }
        if(u.fireAt-t<=C.fireWindow){
          cmds.push({type:'attack',units:[u.id],target:tgt.id});
        } else {
          const d=dist(u,near)||1;
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+(u.x-near.x)/d*C.kiteLen)),y:Math.max(15,Math.min(825,u.y+(u.y-near.y)/d*C.kiteLen))});
        }
      } else if(ebase&&dist(u,ebase)<=C.baseAttackR){
        cmds.push({type:'attack',units:[u.id],target:ebase.id});
      } else {
        cmds.push({type:'attackMove',units:[u.id],x:st.rally.x,y:st.rally.y});
      }
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeSol};
