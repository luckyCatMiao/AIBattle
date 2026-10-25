'use strict';
// Stochastic sol model: same fitted policy with per-decision and per-game noise.
// Used to estimate robustness against model error. Not used in the final entry.
const T={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function rngFactory(seed){let s=(seed|0)||1;return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};}
function makeSolStoch(cfg,seed){
  const C=Object.assign({engage:186,fireWindow:0.85,kiteLen:50,maxQueue:2,upReserve:40,baseAttackR:200,focus:'nearest',pushAllNodes:true},cfg||{});
  const rnd=rngFactory(seed||7);
  const uni=(a,b)=>a+(b-a)*rnd();
  const G={fw:C.fireWindow,eng:C.engage,kite:C.kiteLen,maxQ:C.maxQueue>1?2:1,
    upRes:uni(25,60),pushAll:C.pushAllNodes?rnd()<0.7:rnd()<0.3,
    opSplit:rnd()<0.75?'1n3n':(rnd()<0.5?'2n2n':'4n0n')};
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
    const sign=base.x<640?1:-1;
    const nearNodeId=(base.x<640)?'n2':'n1';
    const cmds=[];
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
        if(G.opSplit==='1n3n'){cmds.push({type:'attackMove',units:[rifles[0].id],x:nn.x,y:nn.y});cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:north.x,y:north.y});}
        else if(G.opSplit==='2n2n'){cmds.push({type:'attackMove',units:rifles.slice(0,2).map(u=>u.id),x:nn.x,y:nn.y});cmds.push({type:'attackMove',units:rifles.slice(2,4).map(u=>u.id),x:north.x,y:north.y});}
        else {cmds.push({type:'attackMove',units:rifles.map(u=>u.id),x:north.x,y:north.y});}
      }
      return cmds.slice(0,10);
    }
    if(t<=1.5)cmds.push({type:'rally',x:640+sign*47,y:420});
    const armyC=army.length?{x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length}:{x:base.x,y:base.y};
    const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(armyC,a)-dist(armyC,b));
    if(rnd()<0.7&&free.length>1){const tmp=free[0];free[0]=free[1];free[1]=tmp;}
    let obj;
    const threat=eCombat.filter(u=>dist(u,base)<380);
    if(threat.length){obj={x:base.x+sign*120,y:base.y};}
    else if(free.length){obj={x:free[0].x+sign*55,y:free[0].y+8};}
    else if(ebase&&G.pushAll){obj={x:ebase.x-sign*94,y:ebase.y};}
    else {const n0=nodes.find(n=>n.id==='n0');obj={x:n0.x+sign*55,y:n0.y+8};}
    if(!st.obj||Math.hypot(obj.x-st.obj.x,obj.y-st.obj.y)>120||Math.abs(t%18)<1e-9){
      if(!st.obj||Math.hypot(obj.x-st.obj.x,obj.y-st.obj.y)>120||t>10){st.obj=obj;cmds.push({type:'rally',x:obj.x,y:obj.y});}
    }
    st.rally=st.obj||obj;
    const eCombatNow=eCombat;
    const cand=obs.mines.filter(m=>m.ore>0&&!eCombatNow.some(v=>dist(v,m)<220)).sort((a,b)=>dist(a,base)-dist(b,base));
    const taskMine=cand[0]||obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
    if(taskMine&&workers.length){
      const idle=workers.filter(u=>!u.order||u.order.type!=='gather'||u.order.target!==taskMine.id);
      if(idle.length)cmds.push({type:'gather',units:idle.map(u=>u.id),target:taskMine.id});
    }
    const cr=obs.players[p].credits,lvl=obs.players[p].level,q=base.queue;
    if(cr>=160&&q.length<G.maxQ)cmds.push({type:'train',unit:'tank'});
    if(lvl<2){const cost=180+lvl*120;if(cr>=cost+G.upRes){G.upRes=uni(25,60);cmds.push({type:'upgrade'});}}
    for(const u of army.slice().sort((a,b)=>a.id<b.id?-1:1)){
      const eng=G.eng+uni(-3,3);
      const fs=foes.filter(v=>dist(u,v)<=eng).sort((a,b)=>dist(u,a)-dist(u,b));
      const near=fs[0];
      if(near){
        let tgt=near;
        if(C.focus==='lowhp'){tgt=fs.slice().sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0]||near;}
        else if(rnd()<0.12){tgt=fs[Math.floor(rnd()*fs.length)];}
        if(rnd()<0.04)continue;
        if(u.fireAt-t<=G.fw+uni(-0.08,0.08)){
          cmds.push({type:'attack',units:[u.id],target:tgt.id});
        } else {
          const d=dist(u,near)||1;const kl=G.kite+uni(-8,8);
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+(u.x-near.x)/d*kl)),y:Math.max(15,Math.min(825,u.y+(u.y-near.y)/d*kl))});
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
module.exports={makeSolStoch};
