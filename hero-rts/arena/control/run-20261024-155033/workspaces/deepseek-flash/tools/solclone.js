'use strict';
// State-reactive clone of GPT-6.1 Sol's observable doctrine (calibrated from the
// public r3 and r1 replays): greedy 18-worker boom, 3 ranges + 2 arcanes,
// towers at home, 5 heroes on a gold-gated timer, one footman per outer shrine,
// druid farms the corner camp, army waits at the east shrine and attack-moves at
// anything that approaches the base, then pushes the enemy hall from ~175s.
// Not the opponent's code -- a sparring model built only from public replays.
function d2(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
const RAD={townhall:58,altar:40,barracks:38,range:38,stable:38,arcane:38,workshop:38,aviary:38,forge:38,lumbermill:30,farm:25,tower:25};
const COST={barracks:[150,70],farm:[70,40],range:[150,85],arcane:[175,120],forge:[150,100],tower:[140,100],lumbermill:[100,60],workshop:[220,160]};
function nearest(arr,p){let b=null,bd=1e9;for(const v of arr){const d=d2(v,p);if(d<bd){bd=d;b=v;}}return b;}
function avg(arr){if(!arr||!arr.length)return null;return {x:arr.reduce((s,u)=>s+u.x,0)/arr.length,y:arr.reduce((s,u)=>s+u.y,0)/arr.length};}
function clump(arr,r=150){let b=null,bc=0;for(const a of arr){const s=arr.filter(v=>d2(a,v)<r);if(s.length>bc){bc=s.length;b=avg(s);}}return b?{x:b.x,y:b.y,n:bc}:null;}

class SolClone{
  constructor(opts={}){
    this.opts=Object.assign({
      workers:18,
      pushAt:175,
      towerAt:78,
      tower2At:117,
      aggroRange:900,      // how far from home it will chase attackers
      skill:true,
      unitSkills:true,
      defenseBias:0,       // extra units kept home
      push:true,
      heroFarm:true,
    },opts);
    this.mem={sites:[],at:{},workerKind:{},rallySet:{}};
  }
  decide(st){
    const me=st.yourPlayer,p=st.players[me],t=st.now;
    const mine=st.units.filter(u=>u.owner===me&&u.hp>0);
    const blds=st.buildings.filter(b=>b.owner===me&&b.hp>0);
    const th=blds.find(b=>b.type==='townhall');
    if(!th)return{commands:[]};
    const foes=st.units.filter(u=>u.owner>=0&&u.owner!==me&&u.hp>0);
    const foeBlds=st.buildings.filter(b=>b.owner>=0&&b.owner!==me&&b.hp>0);
    const foeTH=foeBlds.find(b=>b.type==='townhall');
    const base={x:th.x,y:th.y};
    const side=th.x<1600?'west':'east';
    const M=(x,y)=>side==='west'?{x,y}:{x:3200-x,y:2000-y};
    const T=(ox,oy)=>side==='west'?{x:base.x+ox,y:base.y+oy}:{x:base.x-ox,y:base.y-oy};
    const workers=mine.filter(u=>u.type==='worker');
    const combat=mine.filter(u=>u.type!=='worker');
    const heroes=combat.filter(u=>u.hero);
    const druid=heroes.find(u=>u.type==='druid')||heroes[0];
    const cmds=[];const push=c=>{if(cmds.length<20)cmds.push(c);};
    const at=(k,v)=>{this.mem.at[k]=v;};
    const since=k=>t-(this.mem.at[k]??-1e9);
    const of=ty=>blds.filter(b=>b.type===ty);
    const done=ty=>blds.filter(b=>b.type===ty&&b.complete);

    // placement (mirrors Sol's actual offsets closely enough)
    const canPlace=(type,x,y)=>{
      const R=RAD[type];if(!R)return false;const r=R+12;
      if(x<r+8||y<r+8||x>3200-r-8||y>2000-r-8)return false;
      if(st.map.obstacles.some(o=>x>o.x-r&&x<o.x+o.w+r&&y>o.y-r&&y<o.y+o.h+r))return false;
      if(st.buildings.some(b=>b.hp>0&&d2(b,{x,y})<b.r+r+4))return false;
      if(st.resources.some(q=>q.amount>0&&d2(q,{x,y})<q.r+R+20))return false;
      if(st.nodes.some(n=>d2(n,{x,y})<n.r+R))return false;
      if(foes.some(u=>d2(u,{x,y})<u.r+R))return false;
      if(this.mem.sites.some(s=>d2(s,{x,y})<(RAD[s.type]||20)+(R||20)+6))return false;
      return true;
    };
    const spot=(type,dx,dy)=>{
      const c=T(dx,dy);
      if(canPlace(type,c.x,c.y))return c;
      for(let ring=1;ring<=12;ring++)for(let k=0;k<16;k++){
        const a=k*Math.PI/8,pt={x:c.x+Math.cos(a)*ring*32,y:c.y+Math.sin(a)*ring*32};
        if(canPlace(type,pt.x,pt.y))return pt;
      }
      return null;
    };
    this.mem.sites=this.mem.sites.filter(s=>!st.buildings.some(b=>d2(b,s)<45));
    const free=workers.filter(w=>!w.order||w.order.type==='hold'||(w.order.type==='gather'&&!w.returning));
    const busy=ty=>of(ty).some(b=>!b.complete);
    const build=(type,dx,dy,resG=0,resW=0)=>{
      if(busy(type)||!free.length)return false;
      const c=COST[type];if(!c||p.gold<c[0]+resG||p.wood<c[1]+resW)return false;
      const s=spot(type,dx,dy);if(!s)return false;
      const w=free.shift();this.mem.sites.push({type,x:s.x,y:s.y});
      push({type:'build',building:type,units:[w.id],x:Math.round(s.x),y:Math.round(s.y)});
      return true;
    };

    // ---------------- macro ----------------
    if(of('farm').length<1)build('farm',90,-350);
    else if(t>=11&&of('lumbermill').length<1)build('lumbermill',-55,340);
    else if(t>=24&&of('range').length<1)build('range',190,85);
    else if(t>=30&&of('arcane').length<1)build('arcane',310,-120,40,10);
    else if(t>=76&&of('tower').length<1&&this.opts.towerAt>=0)build('tower',300,-180);
    else if(t>=115&&of('tower').length<2&&this.opts.tower2At>=0)build('tower',300,180);
    else if(t>=144&&of('range').length<2)build('range',370,180);
    else if(t>=150&&of('range').length<3)build('range',420,-25);
    else if(t>=151&&of('forge').length<1)build('forge',160,-330);
    else if(t>=193&&of('arcane').length<2)build('arcane',250,-260);
    else if(t>=214&&of('workshop').length<1&&p.tier>=2)build('workshop',280,300);
    else if(p.popCap-p.population<=12&&of('farm').length<14&&!busy('farm'))build('farm',120+((of('farm').length%4)*55),200+Math.floor(of('farm').length/4)*70);

    // workers -> 18, gold-heavy
    if(workers.length<this.opts.workers&&th.queue.length<2&&p.gold>=60)push({type:'train',unit:'worker',building:th.id});
    for(const w of free){
      if(since('wk'+w.id)<8)continue;
      const goldW=workers.filter(x=>x.order&&x.order.type==='gather'&&x.gatherKind==='gold').length;
      const kind=goldW<12?'gold':'wood';
      const res=st.resources.filter(r=>r.amount>0&&r.kind===kind).sort((a,b)=>d2(w,a)-d2(w,b))[0];
      if(res){push({type:'gather',units:[w.id],target:res.id});at('wk'+w.id,t);}
    }

    // production
    for(const r of done('range'))if(r.queue.length<2&&p.gold>=95&&p.wood>=25&&p.population+2<=p.popCap)push({type:'train',unit:'archer',building:r.id});
    for(const a of done('arcane'))if(a.queue.length<2&&p.gold>=110&&p.wood>=50&&p.population+2<=p.popCap)push({type:'train',unit:'priest',building:a.id});
    const altar=done('altar')[0];
    if(altar){
      const has=ty=>p.heroes.some(h=>h.type===ty);
      const spec=[[0,'frost',0],[45,'pyromancer',0],[105,'oracle',0],[155,'ranger',0]];
      for(const [tt,hy] of spec){
        if(t>=tt&&!has(hy)&&p.heroes.length<5&&p.gold>=360&&p.wood>=80&&altar.queue.length<2){push({type:'summon',hero:hy});break;}
      }
      const dead=p.heroes.find(h=>h.dead&&!h.queued&&t>=h.respawnAt&&p.gold>=150+h.level*40);
      if(dead)push({type:'revive',hero:dead.type});
    }
    // tech: exactly Sol's late, gold-gated sequence
    if(p.tier===1&&done('forge').length&&p.gold>=350&&p.wood>=220&&t>=165&&!blds.some(b=>b.queue.some(q=>q.type==='tier2')))push({type:'research',tech:'tier2',building:th.id});
    if(p.tier>=2&&done('forge').length&&p.gold>=180&&p.wood>=110&&t>=190&&p.tech.weapons<Math.min(3,p.tier)&&!blds.some(b=>b.queue.some(q=>q.type==='weapons')))push({type:'research',tech:'weapons',building:done('forge')[0].id});
    if(p.tier>=2&&done('forge').length&&p.gold>=160&&p.wood>=120&&t>=205&&p.tech.armor<Math.min(3,p.tier)&&!blds.some(b=>b.queue.some(q=>q.type==='armor')))push({type:'research',tech:'armor',building:done('forge')[0].id});

    // ---------------- combat ----------------
    const homeEnemies=foes.filter(e=>d2(e,base)<this.opts.aggroRange+300);
    const threat=homeEnemies.filter(e=>d2(e,base)<this.opts.aggroRange);
    // Sol uses absolute N/S shrine points and the shrine adjacent to its own
    // base; its corner camp is south when it starts west, north when east.
    const EShrine=side==='west'?{x:900,y:1000}:{x:2300,y:1000};
    const NShrine={x:1600,y:280},SShrine={x:1600,y:1720};
    const nearCamp=side==='west'?{x:750,y:1520}:{x:2450,y:480};

    // holders: two footmen on the outer shrines (never come home)
    const footmen=combat.filter(u=>u.type==='footman');
    const holders=footmen.slice(0,2).map(u=>u.id);
    for(let i=0;i<Math.min(2,footmen.length);i++){
      const node=i===0?NShrine:SShrine;
      if(since('hold'+i)<4)continue;
      push({type:'move',units:[footmen[i].id],x:Math.round(node.x),y:Math.round(node.y)});
      at('hold'+i,t);
    }
    const movers=combat.filter(u=>!holders.includes(u.id));

    // druid: farm the corner camp while it is up, then join the shrine ball
    let target=null;
    const campId=side==='west'?'camp2':'camp2';
    const camp=(st.camps||[]).find(c=>d2(c,nearCamp)<100);
    const campAlive=camp&&!camp.cleared;
    if(this.opts.heroFarm&&campAlive&&t<45&&druid){
      target=nearCamp;
    }else if(this.opts.push&&t>=this.opts.pushAt&&foeTH){
      target={x:foeTH.x,y:foeTH.y};
    }else if(threat.length){
      target=avg(threat)||EShrine;
    }else if(homeEnemies.length&&this.opts.defenseBias>0){
      target=avg(homeEnemies)||EShrine;
    }else{
      target=EShrine;
    }
    // a real enemy army in the base half always pulls the defenders
    const raiders=foes.filter(e=>d2(e,base)<1250);
    if(t<this.opts.pushAt&&raiders.length>=3)target=avg(raiders)||target;

    if(target&&movers.length){
      const changed=!this.mem.lastTarget||d2(target,this.mem.lastTarget)>130;
      if((changed||since('army')>2.2)&&!movers.some(u=>u.attack)){
        push({type:'attackMove',units:movers.map(u=>u.id),x:Math.round(target.x),y:Math.round(target.y)});
        at('army',t);this.mem.lastTarget={x:target.x,y:target.y};
      }
    }

    // ---------------- hero skills ----------------
    if(this.opts.skill)for(const h of heroes){
      if(h.hp<=0||h.casting)continue;
      const cd=id=>((h.cooldowns&&h.cooldowns[id])||0)<=t;
      const mana=id=>{const sk=st.catalog?.skills?.[id];return !sk||((h.mana||0)>=sk.mana)&&h.level>=(sk.requiredLevel||1);};
      const rd=id=>cd(id)&&mana(id);
      const near=foes.filter(e=>d2(e,h)<520);
      const cl=clump(near.filter(e=>d2(e,h)<360));
      if(h.type==='druid'){
        if(rd('d_trees')&&(near.length||t<40)){const a=near.length?nearest(near,h):{x:h.x+120,y:h.y};if(d2(h,a)<=260)push({type:'cast',unit:h.id,skill:'d_trees',x:Math.round(a.x),y:Math.round(a.y)});}
        else if(rd('d_root')&&near.length){const n=nearest(near,h);if(d2(h,n)<=550)push({type:'cast',unit:h.id,skill:'d_root',target:n.id});}
        else if(rd('d_heal')){const low=combat.filter(a=>a.hp<a.maxHp*.55&&d2(a,h)<380);if(low.length>=2)push({type:'cast',unit:h.id,skill:'d_heal',x:Math.round(low[0].x),y:Math.round(low[0].y)});}
        else if(rd('d_growth')&&cl&&cl.n>=4)push({type:'cast',unit:h.id,skill:'d_growth',x:Math.round(cl.x),y:Math.round(cl.y)});
      }else if(h.type==='frost'){
        if(rd('f_blizzard')&&cl&&cl.n>=2)push({type:'cast',unit:h.id,skill:'f_blizzard',x:Math.round(cl.x),y:Math.round(cl.y)});
        else if(rd('f_cone')&&near.length){const n=nearest(near,h);if(d2(h,n)<=340)push({type:'cast',unit:h.id,skill:'f_cone',x:Math.round(n.x),y:Math.round(n.y)});}
        else if(rd('f_root')&&cl)push({type:'cast',unit:h.id,skill:'f_root',x:Math.round(cl.x),y:Math.round(cl.y)});
        else if(rd('f_armor')){const low=combat.filter(a=>a.hp<a.maxHp*.5&&d2(a,h)<400);if(low.length)push({type:'cast',unit:h.id,skill:'f_armor',target:low[0].id});}
      }else if(h.type==='pyromancer'){
        if(rd('p_flame')&&cl&&cl.n>=2)push({type:'cast',unit:h.id,skill:'p_flame',x:Math.round(cl.x),y:Math.round(cl.y)});
        else if(rd('p_bolt')&&cl)push({type:'cast',unit:h.id,skill:'p_bolt',x:Math.round(cl.x),y:Math.round(cl.y)});
        else if(rd('p_meteor')&&cl&&cl.n>=4)push({type:'cast',unit:h.id,skill:'p_meteor',x:Math.round(cl.x),y:Math.round(cl.y)});
      }else if(h.type==='oracle'){
        const low=combat.filter(a=>a.hp<a.maxHp*.55&&d2(a,h)<400);
        if(rd('o_heal')&&low.length)push({type:'cast',unit:h.id,skill:'o_heal',target:low[0].id});
        else if(rd('o_renew')){const l2=combat.filter(a=>a.hp<a.maxHp*.8&&d2(a,h)<300);if(l2.length>=3)push({type:'cast',unit:h.id,skill:'o_renew',x:Math.round(h.x),y:Math.round(h.y)});}
      }else if(h.type==='ranger'){
        if(rd('r_rain')&&cl&&cl.n>=3)push({type:'cast',unit:h.id,skill:'r_rain',x:Math.round(cl.x),y:Math.round(cl.y)});
        else if(rd('r_arrow')&&cl)push({type:'cast',unit:h.id,skill:'r_arrow',x:Math.round(cl.x),y:Math.round(cl.y)});
      }
    }
    // unit skills: footman shield wall / archer rapid fire in combat
    if(this.opts.unitSkills&&threat.length+raiders.length>0){
      let n=0;
      for(const u of combat){
        if(n>=2||cmds.length>=19)break;
        if(u.type==='footman'&&((u.cooldowns&&u.cooldowns.u_guard)||0)<=t&&!u.casting){push({type:'cast',unit:u.id,skill:'u_guard'});n++;}
        else if(u.type==='archer'&&((u.cooldowns&&u.cooldowns.u_rapid)||0)<=t&&!u.casting){push({type:'cast',unit:u.id,skill:'u_rapid'});n++;}
      }
    }
    return {commands:cmds.slice(0,20)};
  }
}
module.exports={SolClone};
