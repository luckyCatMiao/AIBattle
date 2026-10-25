'use strict';
// Frontier RTS agent v3 - fitted micro, parameterizable.
const T={worker:{cost:50,build:4,hp:70,speed:76,range:0,damage:0,cooldown:1,r:9},rifle:{cost:60,build:5,hp:110,speed:64,range:115,damage:13,cooldown:.8,r:8},tank:{cost:160,build:12,hp:360,speed:37,range:160,damage:40,cooldown:2,r:14},raider:{cost:100,build:8,hp:150,speed:108,range:94,damage:16,cooldown:.65,r:11}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const DEF={
  engageTank:186, engageRifle:140, engageRaider:130,
  fireWindow:0.9, kiteLen:50,
  opening:'1n3n',
  maxQueue:2, workers:4,
  upReserve:60, upMax:2,
  repair:true, repairHp:1200, repairRes:220,
  obj:'node',
  defR:380, defOff:120,
  pushAdvantage:0,
  focus:'lowhp',
  kite:'always',
  capture:true,
};
function makeAgent(cfgOverride){
  const C=Object.assign({},DEF,cfgOverride||{});
  const st={obj:null,alt:{}};
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
      cmds.push({type:'rally',x:obj0.x+sign*47,y:obj0.y+8});
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
        else {a1=rifles.slice(0,4);a2=[];}
        if(a1.length)cmds.push({type:'attackMove',units:a1.map(u=>u.id),x:nn.x,y:nn.y});
        if(a2.length)cmds.push({type:'attackMove',units:a2.map(u=>u.id),x:north.x,y:north.y});
      }
      return cmds.slice(0,10);
    }
    const armyC=army.length?{x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length}:{x:base.x,y:base.y};
    const myPow=army.reduce((s,u)=>s+(u.type==='tank'?7200:u.type==='raider'?3690:1787),0);
    const ePow=eCombat.reduce((s,u)=>s+(u.type==='tank'?7200:u.type==='raider'?3690:1787),0);
    const threat=eCombat.filter(u=>dist(u,base)<C.defR);
    let obj;
    if(threat.length&&ePow>myPow*0.35)obj={x:base.x+sign*C.defOff,y:base.y};
    else if(C.obj==='home'&&dist(armyC,{x:base.x+sign*120,y:base.y})>300)obj={x:base.x+sign*120,y:base.y};
    else{
      const free=nodes.filter(n=>n.owner!==p).sort((a,b)=>dist(armyC,a)-dist(armyC,b));
      if(free.length)obj={x:free[0].x,y:free[0].y};
      else if(ePow<myPow*1.05||C.pushAdvantage<=0)obj={x:ebase.x,y:ebase.y};
      else obj={x:nodes[0].x,y:nodes[0].y};
    }
    st.obj=obj;
    const cr=obs.players[p].credits,lvl=obs.players[p].level,q=base.queue;
    const qw=q.filter(x=>x.type==='worker').length;
    let spent=0;
    if(workers.length+qw<C.workers&&cr>=50&&q.length<3&&my.length+q.length<40){cmds.push({type:'train',unit:'worker'});spent=50;}
    if(cr-spent>=160&&q.length<C.maxQueue&&my.length+q.length<40)cmds.push({type:'train',unit:'tank'});
    if(lvl<C.upMax){const cost=180+lvl*120;if(cr>=cost+C.upReserve)cmds.push({type:'upgrade'});}
    if(C.repair&&base.hp<C.repairHp&&cr>=C.repairRes&&(t-obs.players[p].repairAt)>=30)cmds.push({type:'repair'});
    const kills=[],kiteUnits=[],adv=[];
    for(const u of army){
      const er=u.type==='tank'?C.engageTank:u.type==='raider'?C.engageRaider:C.engageRifle;
      const fs=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      const near=fs[0];
      if(near&&dist(u,near)<=er){
        const cands=fs.filter(v=>dist(u,v)<=er);
        let tgt;
        if(C.focus==='lowhp')tgt=cands.slice().sort((a,b)=>(a.hp-b.hp)||(dist(u,a)-dist(u,b)))[0];
        else if(C.focus==='centroid')tgt=cands.slice().sort((a,b)=>dist(armyC,a)-dist(armyC,b))[0];
        else tgt=cands[0];
        const willFire=u.fireAt-t<=C.fireWindow;
        if(willFire){kills.push({u,tgt});continue;}
        let doKite=false;
        if(C.kite==='always')doKite=true;
        else if(C.kite==='threat'){
          const er2=T[tgt.type].range+u.r;
          doKite=dist(u,tgt)<=er2+8;
        } else { st.alt[u.id]=!st.alt[u.id]; doKite=st.alt[u.id]; }
        if(doKite){kiteUnits.push(u);continue;}
        adv.push({u,tgt});
        continue;
      }
      if(ebase&&dist(u,ebase)<=200){kills.push({u,tgt:ebase});continue;}
      adv.push({u,tgt:null});
    }
    const byT={};
    for(const k of kills){const key=k.tgt.id;(byT[key]=byT[key]||{tgt:k.tgt,ids:[]}).ids.push(k.u.id);}
    for(const key in byT){const g=byT[key];cmds.push({type:'attack',units:g.ids.slice(0,40),target:g.tgt.id});}
    if(kiteUnits.length){
      let vx=0,vy=0;
      for(const u of kiteUnits){
        const near=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
        if(!near)continue;
        const d=dist(u,near)||1;vx+=(u.x-near.x)/d;vy+=(u.y-near.y)/d;
      }
      const l=Math.hypot(vx,vy)||1;vx/=l;vy/=l;
      const ex=kiteUnits.reduce((s,u)=>s+u.x,0)/kiteUnits.length,ey=kiteUnits.reduce((s,u)=>s+u.y,0)/kiteUnits.length;
      cmds.push({type:'move',units:kiteUnits.map(u=>u.id),x:Math.max(15,Math.min(1265,ex+vx*C.kiteLen)),y:Math.max(15,Math.min(825,ey+vy*C.kiteLen))});
    }
    if(adv.length){
      const ids=adv.map(a=>a.u.id);
      cmds.push({type:'attackMove',units:ids.slice(0,40),x:obj.x,y:obj.y});
    }
    const safeMine=obs.mines.filter(m=>m.ore>0).sort((a,b)=>dist(a,base)-dist(b,base))[0];
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
