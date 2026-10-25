'use strict';
// Bot v4: sol-equivalent macro, switchable micro (for controlled experiments).
const TYPES={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const POWER={rifle:16.25*110,tank:20*360,raider:24.6*150};
const RANGE={rifle:115,tank:160,raider:94,worker:0};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={
  workers:4, workerAt:0,
  maxQueue:2, upRes1:56, upRes2:63, upgrades:true,
  repair:false, repairRes:300,
  engageR:188, kiteMode:'alt', kiteLen:50, spread:0, form:0,
  target:'per', focusR:218, pushMul:0.85, pushTime:40,
  captureN:0, captureSafe:190,
  rifleMode:'push',
  microTypes:'tank',
  kiteHp:0.98,
  chase:true, chaseR:800,
};
function makeBot4(cfgOverride){
  const C=Object.assign({},DEF,cfgOverride||{});
  const st={kite:{},prod:0,cap:{}};
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
    const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
    if(!base||!ebase)return[];
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0), foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const army=my.filter(u=>u.type!=='worker'), eCombat=foes.filter(u=>u.type!=='worker');
    const workers=my.filter(u=>u.type==='worker');
    const nodes=obs.nodes, cmds=[];
    const dir=base.x<640?1:-1;
    const nearNode=nodes.filter(n=>n.y>400).sort((a,b)=>dist(a,base)-dist(b,base))[0];
    const northNode=nodes.filter(n=>n.y<300).sort((a,b)=>dist(a,base)-dist(b,base))[0]||nodes[0];
    if(t===0){
      cmds.push({type:'train',unit:'tank'});
      if(C.workers>3)cmds.push({type:'train',unit:'worker'});
      cmds.push({type:'rally',x:640-dir*47,y:267});
      const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(mine&&workers.length)cmds.push({type:'gather',units:workers.map(u=>u.id),target:mine.id});
      const rifles=army.filter(u=>u.type==='rifle').sort((a,b)=>a.id<b.id?-1:1);
      if(rifles.length>=4){
        cmds.push({type:'attackMove',units:[rifles[0].id],x:nearNode.x,y:nearNode.y});
        cmds.push({type:'attackMove',units:rifles.slice(1,4).map(u=>u.id),x:northNode.x,y:northNode.y});
      }
      return cmds.slice(0,10);
    }
    if(t===1)cmds.push({type:'rally',x:640-dir*47,y:420});
    if(t===18)cmds.push({type:'rally',x:640+dir*66,y:497});
    const cr=obs.players[p].credits, lvl=obs.players[p].level, q=base.queue;
    if(cr>=160&&q.length<C.maxQueue)cmds.push({type:'train',unit:'tank'});
    if(C.upgrades&&lvl<2){const cost=180+lvl*120,res=lvl===0?C.upRes1:C.upRes2;if(cr>=cost+res)cmds.push({type:'upgrade'});}
    if(C.repair&&base.hp<base.maxHp-C.repairRes&&cr>=140&&(t-obs.players[p].repairAt)>=30)cmds.push({type:'repair'});
    const main=army.filter(u=>u.type!=='rifle');
    if(main.length){
      const cent={x:main.reduce((s,u)=>s+u.x,0)/main.length,y:main.reduce((s,u)=>s+u.y,0)/main.length};
      const myPow=main.reduce((s,u)=>s+POWER[u.type],0);
      const ePow=eCombat.reduce((s,u)=>s+POWER[u.type],0);
      const baseThreat=eCombat.filter(u=>dist(u,base)<420);
      let obj;
      const baseTh=baseThreat.length>0&&ePow>myPow*0.6;
      if(baseTh)obj={x:base.x+dir*110,y:base.y};
      else if(t>C.pushTime&&ePow<myPow*C.pushMul)obj={x:ebase.x,y:ebase.y};
      else{
        const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(a,cent)-dist(b,cent));
        obj=free.length?{x:free[0].x,y:free[0].y}:{x:640,y:420};
      }
      // capture detachment
      const capIds=new Set();
      if(C.captureN>0){
        for(const uid of Object.keys(st.cap)){const u=main.find(x=>x.id===uid);const nd=nodes.find(n=>n.id===st.cap[uid]);if(!u||!nd||nd.owner===p){delete st.cap[uid];continue;}if(eCombat.some(v=>dist(v,nd)<160)){delete st.cap[uid];continue;}capIds.add(uid);}
        if(!baseThreat.length){
          for(const nd of nodes){
            if(nd.owner===p||Object.values(st.cap).includes(nd.id))continue;
            if(eCombat.some(v=>dist(v,nd)<C.captureSafe))continue;
            if(capIds.size>=C.captureN)break;
            if(main.length-capIds.size<3)break;
            const cand=main.filter(u=>!capIds.has(u.id)).sort((a,b)=>dist(a,nd)-dist(b,nd))[0];
            if(!cand)break;st.cap[cand.id]=nd.id;capIds.add(cand.id);
          }
        }
      }
      const fight=main.filter(u=>!capIds.has(u.id));
      const fcent=fight.length?{x:fight.reduce((s,u)=>s+u.x,0)/fight.length,y:fight.reduce((s,u)=>s+u.y,0)/fight.length}:cent;
      const fcentE=eCombat.length?{x:eCombat.reduce((s,u)=>s+u.x,0)/eCombat.length,y:eCombat.reduce((s,u)=>s+u.y,0)/eCombat.length}:null;
      const global=main.length?eCombat.slice().sort((a,b)=>dist(a,fcent)-dist(b,fcent))[0]:null;
      const atk=[];
      fight.forEach((u,idx)=>{
        const fs=eCombat.slice().sort((a,b)=>dist(u,a)-dist(u,b));
        const nu=fs[0];
        const inR=nu&&dist(u,nu)<=RANGE[u.type]+nu.r;
        if(inR){
          const ready=u.fireAt<=t+1e-9;
          let kite=false;
          if(!ready&&u.hp/u.maxHp<C.kiteHp){
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
          if(C.target==='per'){if(dist(u,nu)<=C.focusR)cmds.push({type:'attack',units:[u.id],target:nu.id});else atk.push(u.id);}
          else atk.push(u.id);
          return;
        }
        st.kite[u.id]=false;
        if(C.chase&&nu&&dist(nu,fcent)<=C.chaseR){
          if(C.form>0&&fcentE){
            const ddx=fcentE.x-fcent.x,ddy=fcentE.y-fcent.y,dl=Math.hypot(ddx,ddy)||1;
            const px=-ddy/dl,py=ddx/dl,off=(idx-(fight.length-1)/2)*C.form;
            cmds.push({type:'attackMove',units:[u.id],x:Math.max(20,Math.min(1260,nu.x+px*off)),y:Math.max(20,Math.min(820,nu.y+py*off))});
          }else cmds.push({type:'attackMove',units:[u.id],x:nu.x,y:nu.y});
        }else cmds.push({type:'attackMove',units:[u.id],x:obj.x,y:obj.y});
      });
      if(atk.length&&global)cmds.push({type:'attack',units:atk.slice(0,30),target:global.id});
      for(const u of main)if(capIds.has(u.id)){if(cmds.length<10){const nd=nodes.find(n=>n.id===st.cap[u.id]);if(nd)cmds.push({type:'move',units:[u.id],x:nd.x,y:nd.y});}}
      const rifles=army.filter(u=>u.type==='rifle');
      if(rifles.length&&cmds.length<9)cmds.push({type:'attackMove',units:rifles.map(u=>u.id),x:northNode.x,y:northNode.y});
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeBot4};
