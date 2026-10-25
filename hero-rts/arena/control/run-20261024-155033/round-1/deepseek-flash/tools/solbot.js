'use strict';
// Sparring replica of GPT-6.1 Sol's doctrine (from public r3 replays):
// greedy 18-worker economy, farm/range/arcane boom, hero farms the near creep
// camp, lone footmen take the N/S nodes, heroes summoned on a timer, mass
// archer+priest deathball pushes the enemy base from ~150s, towers at home.
function d2(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
const RAD={townhall:58,altar:40,barracks:38,range:38,stable:38,arcane:38,workshop:38,aviary:38,forge:38,lumbermill:30,farm:25,tower:25};

class SolBot{
  constructor(opts={}){ this.name='solbot'; this.opts=opts; this.mem={reissueAt:0,lastTarget:null,sites:[],holdAt:0}; }
  decide(st){
    const me=st.yourPlayer, p=st.players[me];
    const mine=st.units.filter(u=>u.owner===me&&u.hp>0);
    const blds=st.buildings.filter(b=>b.owner===me&&b.hp>0);
    const enemies=st.units.filter(u=>u.owner>=0&&u.owner!==me&&u.hp>0);
    const enemyBlds=st.buildings.filter(b=>b.owner>=0&&b.owner!==me&&b.hp>0);
    const myTH=blds.find(b=>b.type==='townhall');
    const side=myTH&&myTH.x<1600?'west':'east';
    const MX=side==='west'?1:-1;                    // +ox is inward, toward map centre
    const baseX=myTH?myTH.x:1600, baseY=myTH?myTH.y:1000;
    const t=st.now;
    const cmds=[];
    const workers=mine.filter(u=>u.type==='worker');
    const combat=mine.filter(u=>u.type!=='worker');
    const of=ty=>blds.filter(b=>b.type===ty);
    const done=ty=>blds.filter(b=>b.type===ty&&b.complete);

    const canPlace=(type,x,y)=>{
      const R=RAD[type]; if(!R)return false;
      const r=R+12;
      if(x<r+8||y<r+8||x>3200-r-8||y>2000-r-8)return false;
      if(st.map.obstacles.some(o=>x>o.x-r&&x<o.x+o.w+r&&y>o.y-r&&y<o.y+o.h+r))return false;
      if(st.buildings.some(b=>b.hp>0&&d2(b,{x,y})<b.r+r+4))return false;
      if(st.resources.some(q=>q.amount>0&&d2(q,{x,y})<q.r+R+20))return false;
      if(st.nodes.some(n=>d2(n,{x,y})<n.r+R))return false;
      if(enemies.some(u=>d2(u,{x,y})<u.r+R))return false;
      if(this.mem.sites.some(s=>s.type===type&&d2(s,{x,y})<R*2+20))return false;
      return true;
    };
    const findSpot=(type,dx,dy)=>{
      const c=side==='west'?{x:baseX+dx,y:baseY+dy}:{x:baseX-dx,y:baseY-dy};
      if(canPlace(type,c.x,c.y))return c;
      for(let ring=1;ring<=12;ring++)for(let k=0;k<16;k++){
        const a=k*Math.PI/8, pt={x:c.x+Math.cos(a)*ring*35,y:c.y+Math.sin(a)*ring*35};
        if(canPlace(type,pt.x,pt.y))return pt;
      }
      return null;
    };

    // ---------- desired buildings ----------
    const free=workers.filter(w=>w.order.type==='hold'||w.order.type==='gather');
    const assigned=new Set();
    const wants=[];
    const addWant=(type,dx,dy,cond)=>{ if(cond) wants.push({type,dx,dy}); };
    const freeHousing=p.popCap-p.population;
    addWant('lumbermill',55,340,t>=8&&of('lumbermill').length<1);
    addWant('range',190,85,t>=(this.opts.turtle?14:20)&&of('range').length<1);
    addWant('arcane',310,-120,t>=28&&of('arcane').length<1);
    addWant('range',370,180,t>=(this.opts.turtle?28:50)&&of('range').length<2);
    addWant('range',420,-25,t>=(this.opts.turtle?40:72)&&of('range').length<3);
    addWant('range',250,-260,t>=(this.opts.turtle?52:95)&&of('range').length<4);
    addWant('range',460,300,t>=(this.opts.turtle?64:120)&&of('range').length<5);
    addWant('forge',160,-330,t>=138&&of('forge').length<1);
    addWant('tower',300,-180,t>=(this.opts.towerAt||150)&&of('tower').length<(this.opts.towerCount||2));
    addWant('workshop',280,300,p.tier>=2&&of('workshop').length<1);
    if(freeHousing<=10&&of('farm').length<12&&!of('farm').some(b=>!b.complete)) addWant('farm',0,0,true);
    const busyTypes=new Set(blds.filter(b=>!b.complete).map(b=>b.type));
    const COST={lumbermill:[100,60],range:[150,85],arcane:[175,120],forge:[150,100],tower:[140,100],workshop:[220,160],farm:[70,40]};
    // prune planned sites that now host a building
    this.mem.sites=this.mem.sites.filter(s=>!st.buildings.some(b=>d2(b,s)<45));
    if(process.env.SOLDBG&&t<50)console.error('[wants] t',t.toFixed(1),'free',free.length,'wants',wants.map(x=>x.type).join(','),'busy',[...busyTypes].join(','));
    for(const w of wants){
      if(busyTypes.has(w.type))continue;
      if(!free.length)break;
      const cc=COST[w.type]; if(cc&&(p.gold<cc[0]+60||p.wood<cc[1]+30))continue;
      let spot;
      if(w.type==='farm'){
        const n=of('farm').length;
        spot=findSpot('farm',130+(n%4)*60,200+Math.floor(n/4)*75);
      }else spot=findSpot(w.type,w.dx,w.dy);
      if(!spot){if(process.env.SOLDBG&&t<50)console.error('  no spot for',w.type,w.dx,w.dy);continue;}
      const wk=free.shift(); assigned.add(wk.id);
      this.mem.sites.push({type:w.type,x:spot.x,y:spot.y});
      cmds.push({type:'build',building:w.type,units:[wk.id],x:spot.x,y:spot.y});
      busyTypes.add(w.type);
    }
    for(const w of free){
      if(assigned.has(w.id))continue;
      const goldCount=workers.filter(x=>x.order.type==='gather'&&x.gatherKind==='gold').length;
      const kind=goldCount<11?'gold':'wood';
      const res=st.resources.filter(r=>r.amount>0&&r.kind===kind).sort((a,b)=>d2(w,a)-d2(w,b))[0];
      if(res)cmds.push({type:'gather',units:[w.id],target:res.id});
    }

    // ---------- production ----------
    const th=done('townhall')[0];
    if(th&&workers.length<(this.opts.turtle?16:18)&&th.queue.length<(this.opts.workerQueue||2)&&p.gold>=60) cmds.push({type:'train',unit:'worker',building:th.id});
    for(const r of done('range')) if(r.queue.length<2&&p.gold>=95&&p.wood>=25&&freeHousing>=0) cmds.push({type:'train',unit:'archer',building:r.id});
    for(const a of done('arcane')) if(a.queue.length<2&&p.gold>=110&&p.wood>=50&&freeHousing>=0) cmds.push({type:'train',unit:'priest',building:a.id});
    const altar=done('altar')[0];
    if(altar){
      const has=ty=>p.heroes.some(h=>h.type===ty);
      const heroSpec=this.opts.solr3?[[0,'frost'],[46,'pyromancer'],[71,'oracle'],[89,'ranger']]:this.opts.turtle?[[0,'frost']]:[[15,'frost'],[48,'pyromancer'],[72,'oracle'],[90,'ranger']];
      for(const [tt,hy] of heroSpec){
        if(t>=tt&&!has(hy)&&p.heroes.length<5&&p.gold>=(this.opts.solr3?360:360+120)&&p.wood>=80&&altar.queue.length<2){cmds.push({type:'summon',hero:hy});break;}
      }
      const dead=p.heroes.find(h=>h.dead&&!h.queued&&t>=h.respawnAt&&p.gold>=150+h.level*40);
      if(dead)cmds.push({type:'revive',hero:dead.type});
    }
    if(p.tier===1&&done('forge').length&&p.gold>=350&&p.wood>=220&&!blds.some(b=>b.queue.some(q=>q.type==='tier2'))) cmds.push({type:'research',tech:'tier2',building:th.id});
    if(p.tier===2&&p.gold>=550&&p.wood>=320&&t>=260&&!blds.some(b=>b.queue.some(q=>q.type==='tier3'))) cmds.push({type:'research',tech:'tier3',building:th.id});

    // ---------- army ----------
    const hero=combat.find(u=>u.hero&&u.type==='druid')||combat.find(u=>u.hero);
    const fighters=combat.filter(u=>u.type!=='treant');
    const thAtRisk=enemies.filter(e=>myTH&&d2(e,myTH)<750);
    const ENode=side==='west'?{x:900,y:1000}:{x:2300,y:1000};
    const campA=side==='west'?{x:750,y:480}:{x:2450,y:1520},campB=side==='west'?{x:750,y:1520}:{x:2450,y:480};
    const camp=this.opts.solr3?(t<27?campA:campB):campA;
    const enemyTH=enemyBlds.find(b=>b.type==='townhall');

    if(hero&&hero.hp>0){
      const ready=id=>(hero.cooldowns[id]||0)<=t;
      const near=enemies.filter(e=>d2(e,hero)<460);
      if(hero.type==='druid'){
        if(ready('d_trees')&&near.length)cmds.push({type:'cast',unit:hero.id,skill:'d_trees',x:nearest(near,hero).x,y:nearest(near,hero).y});
        const low=fighters.filter(a=>a.hp<a.maxHp*.6&&d2(a,hero)<380);
        if(ready('d_heal')&&low.length>=2)cmds.push({type:'cast',unit:hero.id,skill:'d_heal',x:low[0].x,y:low[0].y});
        if(ready('d_root')&&near.length){const n=nearest(near,hero);cmds.push({type:'cast',unit:hero.id,skill:'d_root',target:n.id});}
      }else if(hero.type==='frost'){
        const cl=clump(near);
        if(ready('f_blizzard')&&cl&&cl.n>=2)cmds.push({type:'cast',unit:hero.id,skill:'f_blizzard',x:cl.x,y:cl.y});
        if(ready('f_cone')&&near.length){const n=nearest(near,hero);cmds.push({type:'cast',unit:hero.id,skill:'f_cone',x:n.x,y:n.y});}
        if(ready('f_root')&&cl)cmds.push({type:'cast',unit:hero.id,skill:'f_root',x:cl.x,y:cl.y});
        const low=fighters.filter(a=>a.hp<a.maxHp*.55&&d2(a,hero)<380);
        if(ready('f_armor')&&low.length)cmds.push({type:'cast',unit:hero.id,skill:'f_armor',target:low[0].id});
      }else if(hero.type==='pyromancer'){
        const cl=clump(enemies.filter(e=>d2(e,hero)<640));
        if(ready('p_flame')&&cl&&cl.n>=2)cmds.push({type:'cast',unit:hero.id,skill:'p_flame',x:cl.x,y:cl.y});
        if(ready('p_bolt')&&cl)cmds.push({type:'cast',unit:hero.id,skill:'p_bolt',x:cl.x,y:cl.y});
      }else if(hero.type==='oracle'){
        const low=fighters.filter(a=>a.hp<a.maxHp*.55&&d2(a,hero)<380);
        if(ready('o_heal')&&low.length)cmds.push({type:'cast',unit:hero.id,skill:'o_heal',target:low[0].id});
        const cl=clump(fighters.filter(a=>a.hp<a.maxHp*.8));
        if(ready('o_renew')&&cl&&cl.n>=3)cmds.push({type:'cast',unit:hero.id,skill:'o_renew',x:cl.x,y:cl.y});
      }else if(hero.type==='ranger'){
        const cl=clump(enemies.filter(e=>d2(e,hero)<660));
        if(ready('r_rain')&&cl&&cl.n>=3)cmds.push({type:'cast',unit:hero.id,skill:'r_rain',x:cl.x,y:cl.y});
        if(ready('r_arrow')&&cl)cmds.push({type:'cast',unit:hero.id,skill:'r_arrow',x:cl.x,y:cl.y});
      }
    }

    let target=null;
    if(this.opts.turtle) target=thAtRisk.length?avg(thAtRisk):avg(enemies)||{x:baseX,y:baseY};
    else if(thAtRisk.length) target=avg(thAtRisk);
    else if(t<42&&!this.opts.turtle) target=camp;
    else if(t<(this.opts.pushAt||150)&&!this.opts.turtle) target=ENode;
    else if(enemyTH) target={x:enemyTH.x,y:enemyTH.y};
    else target=avg(enemies)||ENode;

    const holders=[];
    if(t<170&&!this.opts.noHolders){
      const fms=fighters.filter(u=>u.type==='footman');
      if(fms[0])holders.push(fms[0].id);
      if(fms[1])holders.push(fms[1].id);
    }
    const movers=fighters.filter(u=>!holders.includes(u.id));
    if(target&&movers.length){
      const changed=!this.mem.lastTarget||d2(target,this.mem.lastTarget)>130;
      const reissue=t>=this.mem.reissueAt;
      if((changed||reissue)&&!combat.some(u=>u.attack)){
        cmds.push({type:'attackMove',units:movers.map(u=>u.id),x:Math.round(target.x),y:Math.round(target.y)});
        this.mem.lastTarget=target;this.mem.reissueAt=t+2.5;
      }
    }
    if(holders.length&&t>=this.mem.holdAt){
      this.mem.holdAt=t+3;
      holders.forEach((id,i)=>{
        const node=side==='west'?{x:1600,y:i===0?280:1720}:{x:1600,y:i===0?1720:280};
        if(t<12){ // waypoint that avoids the side creep camp
          const wp=side==='west'?{x:baseX+700,y:baseY+(i===0?-350:300)}:{x:baseX-700,y:baseY-(i===0?-350:300)};
          cmds.push({type:'attackMove',units:[id],x:Math.round(wp.x),y:Math.round(wp.y)});
        }else cmds.push({type:'attackMove',units:[id],x:node.x,y:node.y});
      });
    }
    return {commands:cmds.slice(0,20)};
  }
}
function nearest(arr,u){let b=null,bd=1e9;for(const v of arr){const d=d2(v,u);if(d<bd){bd=d;b=v;}}return b;}
function avg(arr){return {x:arr.reduce((s,u)=>s+u.x,0)/arr.length,y:arr.reduce((s,u)=>s+u.y,0)/arr.length};}
function clump(arr){let b=null,bc=0;for(const a of arr){const sub=arr.filter(v=>d2(a,v)<150);if(sub.length>bc){bc=sub.length;b=avg(sub);}}return b?{...b,n:bc}:null;}
module.exports={SolBot};
