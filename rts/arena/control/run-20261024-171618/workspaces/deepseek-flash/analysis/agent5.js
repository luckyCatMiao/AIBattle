'use strict';
// Frontier RTS agent v5 - unified parameterized policy for offline search.
const T={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const VAL={tank:7200,raider:3690,rifle:1787,worker:0};
const DEF={
  engageTank:186, engageRifle:140, engageRaider:130,
  fireWindow:0.9, kiteLen:50,
  opening:'1n3n',
  maxQueue:2, workers:4,
  upReserve:60, upMax:2, upMode:'cr',   // cr threshold vs after-first-tank
  repair:true, repairHp:1200, repairRes:220,
  defR:380, defOff:120,
  focus:'unit-lowhp',   // unit-lowhp | global-lowhp | global-nearest | nearest
  focusR:300,
  retreatFrac:0,        // 0 = never retreat
  kite:'always',
  groupKite:true,
  stageR:0,             // 0 = no staging
  objPull:0,            // pull objective this many px toward own base
  defendMode:'base',    // base | none
  workerRebuild:true,
  attackBaseR:200,
  homeWeight:0,
  nearFirst:false,
  pushAdvantage:0,
  pushMin:3,
  raidN:0,
  raidUntil:120,
  raidAvoid:130,
  raidTargetWorkers:true,
};
function makeAgent(cfgOverride){
  const C=Object.assign({},DEF,cfgOverride||{});
  const st={hold:null};
  return function(obs){
    const p=obs.yourPlayer,t=obs.now;
    const base=obs.bases.find(b=>b.owner===p&&b.hp>0);
    const ebase=obs.bases.find(b=>b.owner!==p&&b.hp>0);
    if(!base||!ebase)return [];
    const my=obs.units.filter(u=>u.owner===p&&u.hp>0);
    const foes=obs.units.filter(u=>u.owner!==p&&u.hp>0);
    const army=my.filter(u=>u.type!=='worker');
    const workers=my.filter(u=>u.type==='worker');
    const eCombat=foes.filter(u=>u.type!=='worker');
    const nodes=obs.nodes||[];
    const sign=base.x<640?1:-1;
    const cmds=[];
    const nearNodeId=base.x<640?'n2':'n1';
    if(t===0){
      cmds.push({type:'train',unit:'tank'});
      cmds.push({type:'train',unit:'worker'});
      const obj0=nodes.find(n=>n.id==='n0');
      const nearN=nodes.find(n=>n.id===nearNodeId);
      let rp=obj0;
      if(C.firstRally==='near'&&nearN)rp=nearN;
      else if(C.firstRally==='center')rp={x:640,y:420};
      cmds.push({type:'rally',x:rp.x+sign*47,y:rp.y+8});
      const mine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
      if(mine&&workers.length)cmds.push({type:'gather',units:workers.map(u=>u.id),target:mine.id});
      const rifles=army.filter(u=>u.type==='rifle').sort((a,b)=>a.id<b.id?-1:1);
      const nn=nodes.find(n=>n.id===nearNodeId)||nodes.filter(n=>n.y>400)[0];
      const north=nodes.find(n=>n.id==='n0');
      if(rifles.length>=4&&C.opening!=='none'){
        let a1,a2;
        if(C.opening==='1n3n'){a1=[rifles[0]];a2=rifles.slice(1,4);}
        else if(C.opening==='2n2n'){a1=rifles.slice(0,2);a2=rifles.slice(2,4);}
        else if(C.opening==='3n1n'){a1=rifles.slice(0,3);a2=rifles.slice(3,4);}
        else if(C.opening==='4n0n'){a1=[];a2=rifles.slice(0,4);}
        else if(C.opening==='4near'){a1=rifles.slice(0,4);a2=[];}
        else {a1=rifles.slice(0,4);a2=[];}
        if(a1.length)cmds.push({type:'attackMove',units:a1.map(u=>u.id),x:nn.x,y:nn.y});
        if(a2.length)cmds.push({type:'attackMove',units:a2.map(u=>u.id),x:north.x,y:north.y});
      }
      return cmds.slice(0,10);
    }
    const armyC=army.length?{x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length}:{x:base.x,y:base.y};
    const myPow=army.reduce((s,u)=>s+(VAL[u.type]||0),0);
    const ePow=eCombat.reduce((s,u)=>s+(VAL[u.type]||0),0);
    const threat=eCombat.filter(u=>dist(u,base)<C.defR);
    let obj;
    if(C.defendMode==='base'&&threat.length&&ePow>myPow*0.35)obj={x:base.x+sign*C.defOff,y:base.y};
    else{
      const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>{
        if(C.nearFirst){
          const na=a.id===nearNodeId?0:1, nb=b.id===nearNodeId?0:1;
          if(na!==nb)return na-nb;
        }
        return (dist(armyC,a)+C.homeWeight*dist(base,a))-(dist(armyC,b)+C.homeWeight*dist(base,b));
      });
      if(C.pushAdvantage>0&&army.length>=C.pushMin&&myPow>C.pushAdvantage*ePow&&threat.length===0){
        obj={x:ebase.x,y:ebase.y};
      } else if(free.length)obj={x:free[0].x,y:free[0].y};
      else obj={x:ebase.x,y:ebase.y};
      if(C.objPull>0){obj={x:obj.x-sign*C.objPull,y:obj.y};}
    }
    if(C.objHyst>0){
      const old=st.hold;
      if(old){
        const on=obs.nodes.find(n=>n.id===old.node);
        const oldValid=on?on.owner!==p:true;
        const dOld=dist(armyC,old);
        const dNew=dist(armyC,obj);
        if(oldValid&&dOld<dNew+C.objHyst){obj={x:old.x,y:old.y};}
      }
      const hit=obs.nodes.filter(n=>dist(n,obj)<70)[0];
      st.hold={x:obj.x,y:obj.y,node:hit?hit.id:null};
    }
    if(C.enemyObjR>0&&eCombat.length){
      const nearE=eCombat.filter(v=>dist(v,armyC)<=C.enemyObjR);
      if(nearE.length&&!threat.length){
        obj={x:nearE.reduce((s,u)=>s+u.x,0)/nearE.length,y:nearE.reduce((s,u)=>s+u.y,0)/nearE.length};
      }
    }
    const cr=obs.players[p].credits,lvl=obs.players[p].level,q=base.queue;
    let spent=0;
    const qw=q.filter(x=>x.type==='worker').length;
    if(C.workerRebuild&&workers.length+qw<C.workers&&cr>=50&&q.length<3&&my.length+q.length<40){cmds.push({type:'train',unit:'worker'});spent=50;}
    if(C.earlyRaider>0&&t>8&&t<60){
      const qr0=q.filter(x=>x.type==='raider').length;
      const r0=army.filter(u=>u.type==='raider').length;
      if(r0+qr0<C.earlyRaider&&cr-spent>=100&&q.length<3&&my.length+q.length<40){cmds.push({type:'train',unit:'raider'});spent+=100;}
    }
    const qr=q.filter(x=>x.type==='raider').length;
    const raiders=army.filter(u=>u.type==='raider').length;
    if(C.raidN>0&&t<C.raidUntil&&raiders+qr<C.raidN&&cr-spent>=100&&q.length<3&&my.length+q.length<40){
      cmds.push({type:'train',unit:'raider'});spent+=100;
    }
    if(C.mainUnit==='raider'){
      if(raiders+qr<C.mixRatio&&cr-spent>=100&&q.length<C.maxQueue&&my.length+q.length<40)cmds.push({type:'train',unit:'raider'});
      else if(cr-spent>=100&&q.length<C.maxQueue&&my.length+q.length<40)cmds.push({type:'train',unit:'raider'});
    } else if(cr-spent>=160&&q.length<C.maxQueue&&my.length+q.length<40)cmds.push({type:'train',unit:'tank'});
    if(lvl<C.upMax){const cost=180+lvl*120;if(cr-spent>=cost+C.upReserve)cmds.push({type:'upgrade'});}
    if(C.repair&&base.hp<C.repairHp&&cr-spent>=C.repairRes&&(t-obs.players[p].repairAt)>=30)cmds.push({type:'repair'});
    // focus target
    let gFocus=null;
    if(C.focus.startsWith('global')&&eCombat.length){
      const pool=eCombat.filter(v=>dist(v,armyC)<=C.focusR);
      const pp=pool.length?pool:eCombat;
      gFocus=C.focus==='global-lowhp'
        ? pp.slice().sort((a,b)=>(a.hp-b.hp)||(dist(armyC,a)-dist(armyC,b)))[0]
        : pp.slice().sort((a,b)=>dist(armyC,a)-dist(armyC,b))[0];
    }
    const kills=[],kiteUnits=[],adv=[],retreat=[];
    const enemyWorkers=foes.filter(v=>v.type==='worker');
    for(const u of army){
      if(C.localRetreat>0){
        const friends=army.filter(v=>dist(v,u)<260);
        const enemies=foes.filter(v=>v.type!=='worker'&&dist(v,u)<260);
        const fp=friends.reduce((s,v)=>s+(VAL[v.type]||0),0);
        const ep=enemies.reduce((s,v)=>s+(VAL[v.type]||0),0);
        if(enemies.length&&fp<ep*C.localRetreat&&dist(u,base)>260){
          cmds.push({type:'attackMove',units:[u.id],x:base.x+sign*90,y:base.y});continue;
        }
      }
      if(C.cohesion>0&&dist(u,armyC)>C.cohesion&&army.length>1){
        cmds.push({type:'attackMove',units:[u.id],x:armyC.x,y:armyC.y});continue;
      }
      if(C.raidN>0&&u.type==='raider'&&enemyWorkers.length&&t<C.raidUntil+90){
        const tankNear=foes.filter(v=>v.type==='tank'&&dist(u,v)<C.raidAvoid).sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(tankNear){
          const d=dist(u,tankNear)||1;
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+(u.x-tankNear.x)/d*60)),y:Math.max(15,Math.min(825,u.y+(u.y-tankNear.y)/d*60))});
          continue;
        }
        const w=enemyWorkers.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(dist(u,w)<=T.raider.range+w.r)cmds.push({type:'attack',units:[u.id],target:w.id});
        else cmds.push({type:'attackMove',units:[u.id],x:w.x,y:w.y});
        continue;
      }
      const er=u.type==='tank'?C.engageTank:u.type==='raider'?C.engageRaider:C.engageRifle;
      if(C.retreatFrac>0&&u.hp/u.maxHp<C.retreatFrac&&u.type!=='rifle'){
        const eNear=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(eNear&&dist(u,eNear)<120){retreat.push(u);continue;}
      }
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      const near=fs[0];
      if(near&&dist(u,near)<=er){
        let tgt=near;
        if(gFocus&&dist(u,gFocus)<=er+40)tgt=gFocus;
        else if(C.focus==='unit-lowhp'){
          const cands=fs.filter(v=>dist(u,v)<=er);
          tgt=cands.slice().sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0]||near;
        } else if(C.focus==='fire-lowhp'){
          const fr=T[u.type].range;
          const cands=fs.filter(v=>dist(u,v)<=fr+v.r);
          const cands2=cands.length?cands:fs.filter(v=>dist(u,v)<=er);
          tgt=cands2.slice().sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0]||near;
        }
        if(u.fireAt-t<=C.fireWindow){kills.push({u,tgt});continue;}
        if(C.kite==='never'){adv.push({u,tgt});continue;}
        kiteUnits.push(u);continue;
      }
      if(ebase&&dist(u,ebase)<=C.attackBaseR){kills.push({u,tgt:ebase});continue;}
      adv.push({u,tgt:null});
    }
    const byT={};
    for(const k of kills){const key=k.tgt.id;(byT[key]=byT[key]||{tgt:k.tgt,ids:[]}).ids.push(k.u.id);}
    for(const key in byT){const g=byT[key];cmds.push({type:'attack',units:g.ids.slice(0,40),target:g.tgt.id});}
    if(kiteUnits.length){
      if(C.groupKite||kiteUnits.length>3){
        let vx=0,vy=0;
        for(const u of kiteUnits){
          const near=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
          if(!near)continue;
          const d=dist(u,near)||1;vx+=(u.x-near.x)/d;vy+=(u.y-near.y)/d;
        }
        const l=Math.hypot(vx,vy)||1;vx/=l;vy/=l;
        const ex=kiteUnits.reduce((s,u)=>s+u.x,0)/kiteUnits.length,ey=kiteUnits.reduce((s,u)=>s+u.y,0)/kiteUnits.length;
        cmds.push({type:'move',units:kiteUnits.map(u=>u.id),x:Math.max(15,Math.min(1265,ex+vx*C.kiteLen)),y:Math.max(15,Math.min(825,ey+vy*C.kiteLen))});
      } else {
        for(const u of kiteUnits){
          const near=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
          if(!near)continue;
          const d=dist(u,near)||1;
          cmds.push({type:'move',units:[u.id],x:Math.max(15,Math.min(1265,u.x+(u.x-near.x)/d*C.kiteLen)),y:Math.max(15,Math.min(825,u.y+(u.y-near.y)/d*C.kiteLen))});
        }
      }
    }
    if(retreat.length)cmds.push({type:'move',units:retreat.map(u=>u.id),x:base.x+sign*30,y:base.y});
    if(adv.length){
      let rest=adv;
      if(C.stageR>0){
        const far=adv.filter(a=>dist(a.u,armyC)>C.stageR);
        const nearAdv=adv.filter(a=>dist(a.u,armyC)<=C.stageR);
        if(nearAdv.length)cmds.push({type:'attackMove',units:nearAdv.map(a=>a.u.id),x:obj.x,y:obj.y});
        if(far.length)cmds.push({type:'attackMove',units:far.map(a=>a.u.id),x:armyC.x,y:armyC.y});
        rest=[];
      }
      if(rest.length)cmds.push({type:'attackMove',units:rest.map(a=>a.u.id).slice(0,40),x:obj.x,y:obj.y});
    }
    const minesAvail=obs.mines.filter(m=>m.ore>0);
    const minesSafe=minesAvail.filter(m=>!eCombat.some(v=>dist(v,m)<C.mineSafeR)).sort((a,b)=>dist(a,base)-dist(b,base));
    const safeMine=minesSafe[0]||minesAvail.sort((a,b)=>dist(a,base)-dist(b,base))[0];
    if(safeMine&&workers.length){
      const danger=eCombat.filter(u=>workers.some(w=>dist(u,w)<170));
      if(danger.length){
        cmds.push({type:'move',units:workers.map(u=>u.id),x:base.x-sign*40,y:base.y+20});
      } else {
        const idle=workers.filter(u=>!u.order||u.order.type!=='gather'||u.order.target!==safeMine.id);
        if(idle.length)cmds.push({type:'gather',units:idle.map(u=>u.id),target:safeMine.id});
      }
    }
    return cmds.slice(0,10);
  };
}
module.exports={makeAgent,DEF};
