'use strict';
// Raider raid test bot: fast worker-kill into base push.
const T={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={n:10, firstTank:0, topRoute:true, avoid:140, killWorkers:true, returnDefend:false};
function makeRaid(cfg){
  const C=Object.assign({},DEF,cfg||{});
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
    const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
    if(!base||!ebase)return [];
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const raiders=my.filter(u=>u.type==='raider');
    const workers=my.filter(u=>u.type==='worker');
    const army=my.filter(u=>u.type!=='worker');
    const eCombat=foes.filter(u=>u.type!=='worker');
    const eWorkers=foes.filter(u=>u.type==='worker');
    const cmds=[];
    const sign=base.x<640?1:-1;
    if(t===0){
      cmds.push({type:'train',unit:'raider'});
      cmds.push({type:'train',unit:'raider'});
      cmds.push({type:'train',unit:'worker'});
      const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(mine&&workers.length)cmds.push({type:'gather',units:workers.map(u=>u.id),target:mine.id});
      const rifles=army.filter(u=>u.type==='rifle');
      if(rifles.length)cmds.push({type:'attackMove',units:rifles.map(u=>u.id),x:640,y:250});
      return cmds.slice(0,10);
    }
    const cr=obs.players[p].credits,q=base.queue;
    const qr=q.filter(x=>x.type==='raider').length;
    if(C.firstTank&&raiders.length+qr>=3&&cr>=160&&q.length<2)cmds.push({type:'train',unit:'tank'});
    else if(raiders.length+qr<C.n&&cr>=100&&q.length<3)cmds.push({type:'train',unit:'raider'});
    else if(cr>=160&&q.length<2)cmds.push({type:'train',unit:'tank'});
    // waypoint route: top edge
    const mineTarget=(()=>{
      // nearest enemy mine to enemy base
      const ms=obs.mines.filter(m=>m.ore>0);
      if(!ms.length)return null;
      return ms.sort((a,b)=>dist(a,ebase)-dist(b,ebase))[0];
    })();
    for(const u of raiders){
      // defend own base if enemy army close and configured
      const tankNear=eCombat.filter(v=>dist(u,v)<C.avoid).sort((a,b)=>dist(u,a)-dist(u,b))[0];
      if(C.returnDefend&&eCombat.some(v=>dist(v,base)<220)){
        cmds.push({type:'attackMove',units:[u.id],x:base.x+sign*60,y:base.y});continue;
      }
      if(C.killWorkers&&eWorkers.length){
        const w=eWorkers.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(dist(u,w)<=T.raider.range+w.r){cmds.push({type:'attack',units:[u.id],target:w.id});continue;}
        // route
        let wp;
        if(C.topRoute){
          if(base.x<640){ // west agent -> enemy east
            wp = (u.y>160 ? {x:520,y:60} : {x:1150,y:90});
          } else {
            wp = (u.y>160 ? {x:760,y:60} : {x:130,y:90});
          }
        } else wp={x:w.x,y:w.y};
        if(tankNear){
          // dodge perpendicular
          const dx=u.x-tankNear.x,dy=u.y-tankNear.y,d=Math.hypot(dx,dy)||1;
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+dx/d*70)),y:Math.max(15,Math.min(825,u.y+dy/d*70))});
        } else {
          cmds.push({type:'move',units:[u.id],x:wp.x,y:wp.y});
        }
        continue;
      }
      // all workers dead -> attack base
      if(dist(u,ebase)<=T.raider.range+ebase.r)cmds.push({type:'attack',units:[u.id],target:ebase.id});
      else cmds.push({type:'attackMove',units:[u.id],x:ebase.x,y:ebase.y});
    }
    // workers
    const minesAvail=obs.mines.filter(m=>m.ore>0);
    const safe=minesAvail.filter(m=>!eCombat.some(v=>dist(v,m)<200)).sort((a,b)=>dist(a,base)-dist(b,base))[0]||minesAvail[0];
    if(safe&&workers.length){
      const idle=workers.filter(u=>!u.order||u.order.type!=='gather'||u.order.target!==safe.id);
      if(idle.length)cmds.push({type:'gather',units:idle.map(u=>u.id),target:safe.id});
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeRaid};
