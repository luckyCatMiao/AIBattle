'use strict';
// Ashen Throne agent. Pure decide(state) + stdin/stdout wrapper.
// Strategy: fast two-barracks footman rush with a summoner hero, aimed at the
// enemy worker line and town hall before the opponent's archer ball forms.
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
const RAD={townhall:58,altar:40,barracks:38,range:38,stable:38,arcane:38,workshop:38,aviary:38,forge:38,lumbermill:30,farm:25,tower:25};
const COST={barracks:[150,70],farm:[70,40],range:[150,85],arcane:[175,120],forge:[150,100],tower:[140,100],lumbermill:[100,60]};

class Agent{
  constructor(opts={}){
    this.opts=Object.assign({
      hero:'necromancer',
      marchAt:48,          // seconds
      minArmy:99,          // (disabled) march earlier if this many footmen
      route:'far',         // 'far' | 'farsouth' | 'direct' | 'mid'
      allin:true,
      workers:12,          // worker target during rush prep
      crew:3,              // workers per construction site (engine supports crews)
      barracks2At:0,
      focusWorkers:true,
      retreatHp:0.25,
    },opts);
    this.mem={phase:'prep',waypoint:0,lastOrder:0,target:null,built:{},sites:[]};
  }
  decide(st){
    const me=st.yourPlayer, p=st.players[me];
    const mine=st.units.filter(u=>u.owner===me&&u.hp>0);
    const blds=st.buildings.filter(b=>b.owner===me&&b.hp>0);
    const foes=st.units.filter(u=>u.owner>=0&&u.owner!==me&&u.hp>0);
    const foeBlds=st.buildings.filter(b=>b.owner>=0&&b.owner!==me&&b.hp>0);
    const th=blds.find(b=>b.type==='townhall');
    if(!th){return {commands:[]};}
    const side=th.x<1600?'west':'east';
    // The 2-player map is symmetric under 180-degree rotation about (1600,1000).
    // Canonical coordinates are written for the WEST seat; T maps them to the seat.
    const T=(ox,oy)=>side==='west'?{x:base.x+ox,y:base.y+oy}:{x:base.x-ox,y:base.y-oy};
    const base={x:th.x,y:th.y};
    const t=st.now;
    const workers=mine.filter(u=>u.type==='worker');
    const army=mine.filter(u=>u.type!=='worker'&&!u.summoned&&u.type!=='treant');
    const hero=army.find(u=>u.hero);
    const cmds=[];
    const push=(c)=>{if(cmds.length<20)cmds.push(c);};

    // ---------------- placement ----------------
    const canPlace=(type,x,y)=>{
      const R=RAD[type]; if(!R)return false; const r=R+12;
      if(x<r+8||y<r+8||x>3200-r-8||y>2000-r-8)return false;
      if(st.map.obstacles.some(o=>x>o.x-r&&x<o.x+o.w+r&&y>o.y-r&&y<o.y+o.h+r))return false;
      if(st.buildings.some(b=>b.hp>0&&dist(b,{x,y})<b.r+r+4))return false;
      if(st.resources.some(q=>q.amount>0&&dist(q,{x,y})<q.r+R+20))return false;
      if(st.nodes.some(n=>dist(n,{x,y})<n.r+R))return false;
      if(foes.some(u=>dist(u,{x,y})<u.r+R))return false;
      if(this.mem.sites.some(s=>dist(s,{x,y})<(RAD[s.type]||20)+(R||20)+6))return false;
      return true;
    };
    const spotNear=(type,dx,dy)=>{
      const c=T(dx,dy);
      if(canPlace(type,c.x,c.y))return c;
      for(let ring=1;ring<=10;ring++)for(let k=0;k<16;k++){
        const a=k*Math.PI/8, pt={x:c.x+Math.cos(a)*ring*30,y:c.y+Math.sin(a)*ring*30};
        if(canPlace(type,pt.x,pt.y))return pt;
      }
      return null;
    };
    this.mem.sites=this.mem.sites.filter(s=>!st.buildings.some(b=>dist(b,s)<40));

    // ---------------- army control (computed early; movement gets top priority) ----------------
    const foeTH=foeBlds.find(b=>b.type==='townhall'&&b.complete)||foeBlds.find(b=>b.type==='townhall');
    const enemyArmy=foes.filter(u=>u.type!=='worker');
    const homeThreat=foes.filter(e=>dist(e,base)<620);
    const routePts=this.routePoints(side,base,foeTH);
    const footmen=army.filter(u=>u.type==='footman').length;
    if(this.mem.phase==='prep'&&(t>=this.opts.marchAt||footmen>=this.opts.minArmy)) this.mem.phase='march';
    if(this.mem.phase==='march'&&foeTH&&avg(army)&&dist(avg(army),foeTH)<460) this.mem.phase='assault';
    if(this.mem.phase==='assault'&&homeThreat.length>=6) this.mem.phase='defend';
    if(this.mem.phase==='defend'&&homeThreat.length===0) this.mem.phase='assault';
    let target=null;
    if(this.mem.phase==='prep'){
      target=T(-60,-240);
    }else if(this.mem.phase==='march'){
      target=routePts[routePts.length-1];
    }else if(this.mem.phase==='defend'){
      target=avg(homeThreat)||{x:base.x,y:base.y};
    }else{
      const workersInBase=foes.filter(u=>u.type==='worker'&&foeTH&&dist(u,foeTH)<800);
      const defenders=enemyArmy.filter(e=>foeTH&&dist(e,foeTH)<560);
      if(this.opts.raid&&workersInBase.length) target=avg(workersInBase);
      else if(!this.opts.allin&&defenders.length>=Math.max(3,army.length*0.6)) target=avg(defenders);
      else if(workersInBase.length&&this.opts.focusWorkers&&!this.opts.allin) target=avg(workersInBase);
      else if(foeTH) target={x:foeTH.x,y:foeTH.y};
      else target=avg(foes)||{x:base.x,y:base.y};
    }
    // march->assault when the leading units reach the enemy base
    if(this.mem.phase==='march'&&foeTH&&army.some(u=>dist(u,foeTH)<720)) this.mem.phase='assault';
    if(hero&&hero.hp>0) this.heroSkills(st,hero,foes,army,push);
    if(army.length){
      const playerFoesNear=avg(army)&&foes.some(e=>dist(e,avg(army))<430);
      const transit=this.mem.phase==='march'&&!playerFoesNear;
      const orderType=transit?'move':'attackMove';
      this.mem.moveAt=this.mem.moveAt||{};
      if(this.mem.phase==='assault'&&foeTH){
        const rec=this.mem.moveAt.atk;
        const front=army.filter(u=>dist(u,foeTH)<900);
        const rear=army.filter(u=>dist(u,foeTH)>=900);
        const c0=avg(front);
        const defenders=c0?foes.filter(e=>e.type!=='worker'&&dist(e,c0)<430):[];
        if(front.length){
          const realDef=defenders.filter(e=>!e.summoned&&e.type!=='treant');
          const finish=foeTH.hp<=1000||realDef.length<3;
          if(finish){
            if(!rec||rec.mode!=='th'||rec.id!==foeTH.id||t>=rec.at+2.4){
              if(!front.some(u=>u.attack)){
                push({type:'attack',units:front.map(u=>u.id),target:foeTH.id});
                this.mem.moveAt.atk={mode:'th',id:foeTH.id,at:t};
              }
            }
          }else{
            // only engage defenders that are already on top of us; never chase a
            // kiting hero away from the hall
            const cc=avg(front);
            const prio=t=>t.type==='priest'?0:t.type==='archer'?1:t.type==='footman'?2:3;
            const close=cc?realDef.filter(e=>dist(e,cc)<270):[];
            const tgt=close.sort((a,b)=>prio(a)-prio(b)||a.hp-b.hp)[0];
            if(tgt&&(!rec||rec.mode!=='unit'||rec.id!==tgt.id||t>=rec.at+1.6)){
              push({type:'attack',units:front.map(u=>u.id),target:tgt.id});
              this.mem.moveAt.atk={mode:'unit',id:tgt.id,at:t};
            }else if(!tgt&&(!rec||rec.mode!=='th'||rec.id!==foeTH.id||t>=rec.at+2.4)){
              if(!front.some(u=>u.attack)){
                push({type:'attack',units:front.map(u=>u.id),target:foeTH.id});
                this.mem.moveAt.atk={mode:'th',id:foeTH.id,at:t};
              }
            }
          }
        }
        // reinforcements still at home follow the safe route instead of beelining
        this.mem.unitIdx=this.mem.unitIdx||{};
        const rb=new Map();
        for(const u of rear){
          let idx=this.mem.unitIdx[u.id]||0;
          while(idx<routePts.length-1&&dist(u,routePts[idx])<200) idx++;
          this.mem.unitIdx[u.id]=idx;
          if(!rb.has(idx))rb.set(idx,[]);
          rb.get(idx).push(u.id);
        }
        for(const [idx,ids] of rb){
          const wp=routePts[idx], r2=this.mem.moveAt['r'+idx];
          const changed=!r2||dist(wp,r2.wp)>90;
          if(r2&&!changed&&t<r2.at+2.4)continue;
          push({type:'move',units:ids,x:Math.round(wp.x),y:Math.round(wp.y)});
          this.mem.moveAt['r'+idx]={wp,at:t};
        }
      }else{
        const buckets=new Map();
        this.mem.unitIdx=this.mem.unitIdx||{};
        for(const u of army){
          let idx=this.mem.unitIdx[u.id]||0;
          while(idx<routePts.length-1&&dist(u,routePts[idx])<200) idx++;
          this.mem.unitIdx[u.id]=idx;
          if(!buckets.has(idx))buckets.set(idx,[]);
          buckets.get(idx).push(u.id);
        }
        for(const [idx,ids] of buckets){
          const wp=routePts[idx];
          const rec=this.mem.moveAt[idx];
          const changed=!rec||dist(wp,rec.wp)>90||rec.type!==orderType;
          if(rec&&!changed&&t<rec.at+2.4)continue;
          push({type:orderType,units:ids,x:Math.round(wp.x),y:Math.round(wp.y)});
          this.mem.moveAt[idx]={wp,at:t,type:orderType};
        }
      }
    }
    // recall check: if home is under real threat during assault, the next decide flips phase

    // ---------------- economy ----------------
    const free=workers.filter(w=>w.order.type==='hold'||w.order.type==='gather');
    const assigned=new Set();
    const buildOnce=(type,dx,dy,reserveGold=0,reserveWood=0,crew=1)=>{
      const c=COST[type]; if(!c)return false;
      if(p.gold<c[0]+reserveGold||p.wood<c[1]+reserveWood)return false;
      if(blds.some(b=>b.type===type&&!b.complete))return false;
      if(!free.length)return false;
      const s=spotNear(type,dx,dy); if(!s)return false;
      const crewIds=[];
      for(let i=0;i<crew&&free.length&&i<3;i++){const w=free.shift();assigned.add(w.id);crewIds.push(w.id);}
      this.mem.sites.push({type,x:s.x,y:s.y});
      push({type:'build',building:type,units:crewIds,x:s.x,y:s.y});
      return true;
    };

    // opening structures
    const nb=blds.filter(b=>b.type==='barracks').length;
    const farms=blds.filter(b=>b.type==='farm').length;
    if(t<this.opts.barracks2At+2&&nb<2) buildOnce('barracks',130,-140,0,0,this.opts.crew||1);
    if(this.opts.barracks3At!=null&&t>=this.opts.barracks3At&&nb<3) buildOnce('barracks',170,60);
    // insurance: two home towers once the first wave has left, so a failed
    // rush does not lose to the opponent's counter-push
    if((this.opts.homeTowersAt??95)>=0&&t>=(this.opts.homeTowersAt??95)&&blds.filter(b=>b.type==='tower').length<2){
      buildOnce('tower',-200,-60,0,0,this.opts.crew||3);
    }
    const wantFarm=(p.popCap-p.population)<=10&&farms<12;
    const farmBusy=blds.some(b=>b.type==='farm'&&!b.complete&&workers.some(w=>w.order.type==='build'&&w.order.target===b.id));
    if(wantFarm&&!farmBusy&&!this.opts.allinFarmHold) buildOnce('farm',-220,140+((farms%5)*95),0,0,this.opts.crew||1);
    const ranges=this.opts.ranges||0;
    if(t>=18&&(blds.filter(b=>b.type==='range').length<Math.min(ranges,1))) buildOnce('range',170,40,40,10);
    if(t>=38&&(blds.filter(b=>b.type==='range').length<Math.min(ranges,2))) buildOnce('range',210,-80,40,10);
    if(t>=58&&(blds.filter(b=>b.type==='range').length<Math.min(ranges,3))) buildOnce('range',250,150,40,10);
    if(this.opts.priests&&t>=32&&!blds.some(b=>b.type==='arcane')) buildOnce('arcane',200,-190,40,10);

    // workers: idle (hold) -> gather; gatherers are left alone
    const goldWorkers=workers.filter(w=>w.order.type==='gather'&&w.gatherKind==='gold').length;
    let reassign=0;
    for(const w of workers){
      if(assigned.has(w.id)||w.order.type!=='hold')continue;
      if(reassign++>=3)break;
      const kind=goldWorkers<Math.max(3,Math.floor(workers.length*0.6))?'gold':'wood';
      const res=st.resources.filter(r=>r.amount>0&&r.kind===kind).sort((a,b)=>dist(w,a)-dist(w,b))[0];
      if(res)push({type:'gather',units:[w.id],target:res.id});
    }

    // ---------------- production ----------------
    const producing=(ty)=>blds.filter(b=>b.type===ty&&b.complete);
    // workers to target
    if(workers.length<this.opts.workers&&th.queue.length<2&&p.gold>=60+90) push({type:'train',unit:'worker',building:th.id});
    // footmen from every barracks
    for(const b of producing('barracks')){
      if(b.queue.length<3&&p.gold>=90&&p.wood>=10&&p.population+2<=p.popCap) push({type:'train',unit:'footman',building:b.id});
    }
    // one archer line later (fallback macro)
    for(const r of producing('range')){
      if(r.queue.length<2&&p.gold>=95&&p.wood>=25&&p.population+2<=p.popCap) push({type:'train',unit:'archer',building:r.id});
    }
    for(const a of producing('arcane')){
      if(a.queue.length<2&&p.gold>=110&&p.wood>=50&&p.population+2<=p.popCap) push({type:'train',unit:'priest',building:a.id});
    }
    // extra hero in long games
    const altar=producing('altar')[0];
    if(altar&&this.opts.secondHero&&p.heroes.length<2&&p.gold>=360+80&&p.wood>=80&&t>=(this.opts.secondHeroAt||70)){
      const next=p.heroes.some(h=>h.type==='frost')?null:'frost';
      if(next)push({type:'summon',hero:next});
    } else if(altar&&p.heroes.length<2&&p.gold>=360+80&&p.wood>=80&&this.mem.phase!=='prep'&&t>110){
      const next=p.heroes.some(h=>h.type==='frost')?null:'frost';
      if(next)push({type:'summon',hero:next});
    }
    const dead=p.heroes.find(h=>h.dead&&!h.queued&&t>=h.respawnAt&&p.gold>=150+h.level*40+90);
    if(dead)push({type:'revive',hero:dead.type});

    return {commands:cmds.slice(0,20)};
  }

  heroSkills(st,hero,foes,army,push){
    const t=st.now, cd=hero.cooldowns||{}, mana=hero.mana;
    const SK=(st.catalog&&st.catalog.skills)||{};
    const ready=k=>{
      if((cd[k]||0)>t)return false;
      const sk=SK[k];
      if(sk){
        if(mana<(sk.mana||0))return false;
        if(hero.level<(sk.requiredLevel||1))return false;
      }
      return true;
    };
    const near=foes.filter(e=>dist(e,hero)<520);
    const nearest=(arr)=>{let b=null,bd=1e9;for(const v of arr){const d=dist(v,hero);if(d<bd){bd=d;b=v;}}return b;};
    const clump=(arr,r=150)=>{let b=null,bc=0;for(const a of arr){const s=arr.filter(v=>dist(a,v)<r);if(s.length>bc){bc=s.length;b=avg(s);}}return b?{...b,n:bc}:null;};
    if(hero.type==='necromancer'){
      if(ready('n_raise')&&mana>=75) push({type:'cast',unit:hero.id,skill:'n_raise',x:hero.x+(near.length?0:60),y:hero.y});
      if(ready('n_drain')&&near.length) push({type:'cast',unit:hero.id,skill:'n_drain',target:nearest(near).id});
      const cl=clump(near.filter(e=>dist(e,hero)<430));
      if(ready('n_curse')&&cl&&cl.n>=3) push({type:'cast',unit:hero.id,skill:'n_curse',x:cl.x,y:cl.y});
      if(ready('n_plague')&&cl&&cl.n>=4) push({type:'cast',unit:hero.id,skill:'n_plague',x:cl.x,y:cl.y});
    }else if(hero.type==='druid'){
      if(ready('d_trees')&&mana>=70) push({type:'cast',unit:hero.id,skill:'d_trees',x:hero.x+(near.length?40:80),y:hero.y});
      if(ready('d_root')&&near.length) push({type:'cast',unit:hero.id,skill:'d_root',target:nearest(near).id});
      const low=army.filter(a=>a.hp<a.maxHp*.6&&dist(a,hero)<400);
      if(ready('d_heal')&&low.length>=2) push({type:'cast',unit:hero.id,skill:'d_heal',x:low[0].x,y:low[0].y});
      const cl=clump(near.filter(e=>dist(e,hero)<430));
      if(ready('d_growth')&&cl&&cl.n>=4) push({type:'cast',unit:hero.id,skill:'d_growth',x:cl.x,y:cl.y});
    }else if(hero.type==='pyromancer'){
      const cl=clump(near.filter(e=>dist(e,hero)<600),140);
      if(ready('p_flame')&&cl&&cl.n>=2) push({type:'cast',unit:hero.id,skill:'p_flame',x:cl.x,y:cl.y});
      if(ready('p_bolt')&&cl) push({type:'cast',unit:hero.id,skill:'p_bolt',x:cl.x,y:cl.y});
      if(ready('p_meteor')&&cl&&cl.n>=4) push({type:'cast',unit:hero.id,skill:'p_meteor',x:cl.x,y:cl.y});
      if(ready('p_blink')&&hero.hp<hero.maxHp*.35&&near.length){
        const n=nearest(near); push({type:'cast',unit:hero.id,skill:'p_blink',x:hero.x+(hero.x-n.x),y:hero.y+(hero.y-n.y)});
      }
    }else if(hero.type==='frost'){
      const cl=clump(near.filter(e=>dist(e,hero)<430),150);
      if(ready('f_blizzard')&&cl&&cl.n>=3) push({type:'cast',unit:hero.id,skill:'f_blizzard',x:cl.x,y:cl.y});
      if(ready('f_cone')&&near.length){const n=nearest(near);push({type:'cast',unit:hero.id,skill:'f_cone',x:n.x,y:n.y});}
      if(ready('f_root')&&cl) push({type:'cast',unit:hero.id,skill:'f_root',x:cl.x,y:cl.y});
      const low=army.filter(a=>a.hp<a.maxHp*.55&&dist(a,hero)<400);
      if(ready('f_armor')&&low.length) push({type:'cast',unit:hero.id,skill:'f_armor',target:low[0].id});
    }else if(hero.type==='assassin'){
      const n=nearest(near.filter(e=>dist(e,hero)<420));
      if(ready('a_step')&&n&&!n.queue) push({type:'cast',unit:hero.id,skill:'a_step',target:n.id});
      if(ready('a_execute')&&n) push({type:'cast',unit:hero.id,skill:'a_execute',target:n.id});
      if(ready('a_venom')&&n) push({type:'cast',unit:hero.id,skill:'a_venom',target:n.id});
    }else if(hero.type==='guardian'){
      if(ready('g_taunt')&&near.filter(e=>dist(e,hero)<200).length>=3) push({type:'cast',unit:hero.id,skill:'g_taunt'});
      if(ready('g_slam')&&near.length){const n=nearest(near);if(dist(n,hero)<240)push({type:'cast',unit:hero.id,skill:'g_slam',x:n.x,y:n.y});}
      if(ready('g_stone')&&hero.hp<hero.maxHp*.6) push({type:'cast',unit:hero.id,skill:'g_stone'});
      const cl=clump(near.filter(e=>dist(e,hero)<400));
      if(ready('g_quake')&&cl&&cl.n>=3) push({type:'cast',unit:hero.id,skill:'g_quake',x:cl.x,y:cl.y});
    }else if(hero.type==='vanguard'){
      if(ready('v_shield')&&near.length>=2) push({type:'cast',unit:hero.id,skill:'v_shield',x:hero.x,y:hero.y});
      const low=army.filter(a=>a.hp<a.maxHp*.55);
      if(ready('v_heal')&&low.length) push({type:'cast',unit:hero.id,skill:'v_heal',target:low[0].id});
      const n=nearest(near);
      if(ready('v_charge')&&n&&dist(n,hero)<430) push({type:'cast',unit:hero.id,skill:'v_charge',x:n.x,y:n.y});
      const cl=clump(near.filter(e=>dist(e,hero)<300));
      if(ready('v_sanctuary')&&cl&&cl.n>=4) push({type:'cast',unit:hero.id,skill:'v_sanctuary',x:cl.x,y:cl.y});
    }else if(hero.type==='oracle'){
      const low=army.filter(a=>a.hp<a.maxHp*.55&&dist(a,hero)<400);
      if(ready('o_heal')&&low.length) push({type:'cast',unit:hero.id,skill:'o_heal',target:low[0].id});
      const cl=clump(army.filter(a=>a.hp<a.maxHp*.75),180);
      if(ready('o_renew')&&cl&&cl.n>=4) push({type:'cast',unit:hero.id,skill:'o_renew',x:cl.x,y:cl.y});
      if(ready('o_shield')&&near.length>=3) push({type:'cast',unit:hero.id,skill:'o_shield',x:hero.x,y:hero.y});
    }else if(hero.type==='ranger'){
      const cl=clump(near.filter(e=>dist(e,hero)<650),160);
      if(ready('r_rain')&&cl&&cl.n>=3) push({type:'cast',unit:hero.id,skill:'r_rain',x:cl.x,y:cl.y});
      if(ready('r_arrow')&&cl) push({type:'cast',unit:hero.id,skill:'r_arrow',x:cl.x,y:cl.y});
      if(ready('r_fan')&&near.filter(e=>dist(e,hero)<350).length>=2){const n=nearest(near);push({type:'cast',unit:hero.id,skill:'r_fan',x:n.x,y:n.y});}
    }else if(hero.type==='engineer'){
      if(ready('e_turret')&&mana>=65&&near.length) push({type:'cast',unit:hero.id,skill:'e_turret',x:hero.x+40,y:hero.y});
      const cl=clump(near,110);
      if(ready('e_bomb')&&cl&&cl.n>=2) push({type:'cast',unit:hero.id,skill:'e_bomb',x:cl.x,y:cl.y});
      if(ready('e_orbit')&&cl&&cl.n>=3) push({type:'cast',unit:hero.id,skill:'e_orbit',x:cl.x,y:cl.y});
    }
  }

  routePoints(side,base,foeTH){
    // Canonical corridor west->east: north of the ruins, south of the forests,
    // outside the central boss aggro ring and the NE creep camp ring.
    const eb=foeTH?{x:foeTH.x,y:foeTH.y}:{x:side==='west'?2870:330,y:1000};
    const M=(x,y=1000)=>(side==='west'?{x,y}:{x:3200-x,y:2000-y});
    if(this.opts.route==='direct') return [{x:eb.x,y:eb.y}];
    if(this.opts.route==='far') return [M(330,150),M(2900,150),M(2950,700),{x:eb.x,y:eb.y}];
    if(this.opts.route==='farsouth') return [M(330,1870),M(2900,1870),M(2950,1300),{x:eb.x,y:eb.y}];
    if(this.opts.route==='mid') return [M(950,800),M(1800,790),M(2350,880),{x:eb.x,y:eb.y}];
    return [
      M(700,1180),M(950,1190),M(1300,1300),M(1600,1350),M(1900,1300),
      M(1950,1200),M(2250,1150),M(2600,1060),{x:eb.x,y:eb.y}
    ];
  }
}
function avg(arr){if(!arr||!arr.length)return null;return {x:arr.reduce((s,u)=>s+u.x,0)/arr.length,y:arr.reduce((s,u)=>s+u.y,0)/arr.length};}
module.exports={Agent};

// ---------------- stdin wrapper ----------------
if(require.main===module){
  const readline=require('readline');
  const agent=new Agent(process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{});
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',line=>{
    line=line.trim(); if(!line)return;
    let out={commands:[]};
    try{
      const st=JSON.parse(line);
      out=agent.decide(st);
      if(!out||!Array.isArray(out.commands))out={commands:[]};
    }catch(e){ console.error('agent error',e&&e.stack||e); out={commands:[]}; }
    if(out.commands.length>20)out.commands=out.commands.slice(0,20);
    process.stdout.write(JSON.stringify(out)+'\n');
  });
}
