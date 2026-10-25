'use strict';
// Reconstruction of the frozen "sol" policy from public replays (round-3 build).
const TYPES={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const POWER={rifle:16.25*110,tank:20*360,raider:24.6*150,worker:0};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={engageR:188,kiteLen:50,maxQueue:2,upReserve1:56,upReserve2:63,pushTime:40,capture:true,captureMin:2,rebuildWorkers:false,repair:false};
function makeSol(cfgOverride){
 const C=Object.assign({},DEF,cfgOverride||{});
 const st={kite:{},prod:0};
 return function(obs){
  const p=obs.yourPlayer,t=obs.now;
  const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
  const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
  if(!base||!ebase)return[];
  const my=obs.units.filter(u=>u.owner===p&&u.hp>0), foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
  const army=my.filter(u=>u.type!=='worker'), eCombat=foes.filter(u=>u.type!=='worker');
  const cmds=[];
  const dir=base.x<640?1:-1;
  const nodes=obs.nodes;
  const nearNode=nodes.filter(n=>n.y>400).sort((a,b)=>dist(a,base)-dist(b,base))[0];
  const northNode=nodes.filter(n=>n.y<300).sort((a,b)=>dist(a,base)-dist(b,base))[0]||nodes[0];
  // ---- opening (exact from replays) ----
  if(t===0){
   cmds.push({type:'train',unit:'tank'});
   cmds.push({type:'train',unit:'worker'});
   cmds.push({type:'rally',x:640-dir*47,y:267});
   const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
   const ws=my.filter(u=>u.type==='worker');
   if(mine&&ws.length)cmds.push({type:'gather',units:ws.map(u=>u.id),target:mine.id});
   const rifles=army.filter(u=>u.type==='rifle').sort((a,b)=>a.id<b.id?-1:1);
   if(rifles.length>=4){
     cmds.push({type:'attackMove',units:[rifles[0].id],x:nearNode.x,y:nearNode.y});
     cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:northNode.x,y:northNode.y});
   }
   return cmds.slice(0,10);
  }
  if(t===1)cmds.push({type:'rally',x:640-dir*47,y:420});
  if(t===18)cmds.push({type:'rally',x:640+dir*66,y:497});
  // ---- economy ----
  const cr=obs.players[p].credits, lvl=obs.players[p].level, q=base.queue;
  const qlen=q.length;
  if(C.rebuildWorkers){const ws=my.filter(u=>u.type==='worker').length;const qw=q.filter(x=>x.type==='worker').length;if(ws+qw<4&&cr>=50&&qlen<3)cmds.push({type:'train',unit:'worker'});}
  if(cr>=160&&qlen<C.maxQueue)cmds.push({type:'train',unit:'tank'});
  if(lvl<2){
    const cost=180+lvl*120, res=lvl===0?C.upReserve1:C.upReserve2;
    if(cr>=cost+res)cmds.push({type:'upgrade'});
  }
  if(C.repair&&base.hp<base.maxHp-350&&cr>=140&&(t-obs.players[p].repairAt)>=30)cmds.push({type:'repair'});
  // ---- army ----
  const main=army;
  const myC=main.length?{x:main.reduce((s,u)=>s+u.x,0)/main.length,y:main.reduce((s,u)=>s+u.y,0)/main.length}:{x:base.x,y:base.y};
  const eC=eCombat.length?{x:eCombat.reduce((s,u)=>s+u.x,0)/eCombat.length,y:eCombat.reduce((s,u)=>s+u.y,0)/eCombat.length}:null;
  const myPow=main.reduce((s,u)=>s+(POWER[u.type]||0),0);
  const ePow=eCombat.reduce((s,u)=>s+(POWER[u.type]||0),0);
  const baseThreat=eCombat.filter(u=>dist(u,base)<420);
  // objective
  let obj;
  const baseTh = baseThreat.length>0&&ePow>myPow*0.6;
  if(baseTh)obj={x:base.x+dir*120,y:base.y};
  else if(t>C.pushTime&&ePow<myPow*0.85&&ebase)obj={x:ebase.x,y:ebase.y};
  else{
    const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(a,myC)-dist(b,myC));
    obj=free.length?{x:free[0].x,y:free[0].y}:{x:640,y:420};
  }
  if(t>18&&(Math.floor(t)%40===18))cmds.push({type:'rally',x:obj.x,y:obj.y});
  // per-unit
  const group={}, groupMove={};
  for(const u of main){
    if(u.type==='rifle')continue;
    const foes2=foes.filter(v=>v.hp>0).sort((a,b)=>dist(u,a)-dist(u,b));
    const near=foes2[0];
    let acted=false;
    if(near&&dist(u,near)<=C.engageR){
      const ready=u.fireAt<=t+1e-9;
      const k=st.kite[u.id]||false;
      if(!ready&&!k&&u.hp/u.maxHp<0.98){
        const d=dist(u,near)||1;
        const tx=Math.max(15,Math.min(1265,u.x+(u.x-near.x)/d*C.kiteLen));
        const ty=Math.max(15,Math.min(825,u.y+(u.y-near.y)/d*C.kiteLen));
        cmds.push({type:'move',units:[u.id],x:tx,y:ty});
        st.kite[u.id]=true; acted=true;
      }else{
        st.kite[u.id]=false;
        // focus nearest enemy in range
        const tgt=foes2.filter(v=>dist(u,v)<=C.engageR+30)[0]||near;
        cmds.push({type:'attack',units:[u.id],target:tgt.id}); acted=true;
      }
    }
    if(!acted){
      st.kite[u.id]=false;
      const key=Math.round(obj.x/60)+','+Math.round(obj.y/60);
      (groupMove[key]=groupMove[key]||[]).push(u.id);
    }
  }
  for(const k in groupMove){cmds.push({type:'attackMove',units:groupMove[k],x:obj.x,y:obj.y});}
  // rifles: attackMove to north node then join
  const rifles=main.filter(u=>u.type==='rifle');
  if(rifles.length){cmds.push({type:'attackMove',units:rifles.map(u=>u.id),x:northNode.x,y:northNode.y});}
  return cmds.slice(0,10);
 };
}
module.exports={makeSol};
