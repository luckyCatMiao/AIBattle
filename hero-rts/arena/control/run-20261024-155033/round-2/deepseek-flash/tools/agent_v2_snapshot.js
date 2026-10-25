'use strict';
// Ashen Throne agent, round 2. Pure decide(state) + stdin/stdout wrapper.
// Doctrine: necromancer + two-barracks footman timing push.
//   1. hero + starting footmen clear the near creep camp -> gold + hero level 3
//      (plague ultimate: armour-ignoring damage on buildings and clumps).
//   2. all other units rally at a staging point behind the base; the whole ball
//      departs together (round 1 fed units into the enemy one at a time).
//   3. far-north / far-south lane bypasses the central colossus and all camps.
//   4. assault: hit the town hall, plague/curse the defender clump, shield wall
//      on footmen, skeletons on cooldown. No chasing kiting heroes.
const RAD={townhall:58,altar:40,barracks:38,range:38,stable:38,arcane:38,workshop:38,aviary:38,forge:38,lumbermill:30,farm:25,tower:25};
const COST={barracks:[150,70],farm:[70,40],range:[150,85],arcane:[175,120],forge:[150,100],tower:[140,100],lumbermill:[100,60]};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const avg=arr=>{if(!arr||!arr.length)return null;let x=0,y=0;for(const u of arr){x+=u.x;y+=u.y;}return{x:x/arr.length,y:y/arr.length};};
function nearest(arr,p){let b=null,bd=1e9;for(const v of arr){const d=dist(v,p);if(d<bd){bd=d;b=v;}}return b;}

class Agent{
  constructor(opts={}){
    this.opts=Object.assign({
      workers:7,
      spearmen:0,          // how many spearmen to mix in (net roots kiting heroes)
      camp:true,
      campUntil:25,
      barracks3At:-1,
      departAt:36,
      departFootmen:11,
      stageOff:[40,-330],
      route:'far',            // 'far' lane | 'near' lane | 'swing' via mine | 'wide' around the map edge
      guard:true,
      homeTowerAt:-1,
      reissue:2.0,
    },opts);
    this.mem={phase:'camp',wp:0,at:{},sites:[],rallySet:{},moveTarget:null,atkTarget:null};
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
    const workers=mine.filter(u=>u.type==='worker');
    const army=mine.filter(u=>u.type!=='worker');
    const hero=army.find(u=>u.hero);
    const footmen=army.filter(u=>u.type==='footman');
    const base={x:th.x,y:th.y};
    const side=th.x<1600?'west':'east';
    // offsets are canonical west, rotated 180 degrees about map centre for east
    const T=(ox,oy)=>side==='west'?{x:base.x+ox,y:base.y+oy}:{x:base.x-ox,y:base.y-oy};
    const M=(x,y)=>side==='west'?{x,y}:{x:3200-x,y:2000-y};
    const cmds=[];
    const push=c=>{if(cmds.length<20)cmds.push(c);};
    const reissue=(key,at)=>t>=(this.mem.at[key]===undefined?-1e9:this.mem.at[key])+at;
    const stage=T(this.opts.stageOff[0],this.opts.stageOff[1]);

    // ---------------- placement ----------------
    const canPlace=(type,x,y)=>{
      const R=RAD[type];if(!R)return false;const r=R+12;
      if(x<r+8||y<r+8||x>3200-r-8||y>2000-r-8)return false;
      if(st.map.obstacles.some(o=>x>o.x-r&&x<o.x+o.w+r&&y>o.y-r&&y<o.y+o.h+r))return false;
      if(st.buildings.some(b=>b.hp>0&&dist(b,{x,y})<b.r+r+4))return false;
      if(st.resources.some(q=>q.amount>0&&dist(q,{x,y})<q.r+R+20))return false;
      if(st.nodes.some(n=>dist(n,{x,y})<n.r+R))return false;
      if(foes.some(u=>dist(u,{x,y})<u.r+R))return false;
      if(this.mem.sites.some(s=>dist(s,{x,y})<(RAD[s.type]||20)+(R||20)+6))return false;
      return true;
    };
    const spotNear=(type,ox,oy)=>{
      const c=T(ox,oy);
      if(canPlace(type,c.x,c.y))return c;
      for(let ring=1;ring<=12;ring++)for(let k=0;k<16;k++){
        const a=k*Math.PI/8,pt={x:c.x+Math.cos(a)*ring*30,y:c.y+Math.sin(a)*ring*30};
        if(canPlace(type,pt.x,pt.y))return pt;
      }
      return null;
    };
    this.mem.sites=this.mem.sites.filter(s=>!st.buildings.some(b=>dist(b,s)<45));
    const idleWorkers=workers.filter(w=>!w.order||w.order.type==='hold');
    const busySite=ty=>blds.some(b=>b.type===ty&&!b.complete);
    // workers not already committed this frame
    const crewPool=workers.filter(w=>!w.order||w.order.type==='hold'||(w.order.type==='gather'&&!w.returning));
    const buildOnce=(type,ox,oy,crew,resG,resW)=>{
      if(busySite(type))return false;
      const c=COST[type];if(!c)return false;
      if(p.gold<c[0]+(resG||0)||p.wood<c[1]+(resW||0))return false;
      if(!crewPool.length)return false;
      const s=spotNear(type,ox,oy);if(!s)return false;
      const ids=[];
      for(let i=0;i<crew&&crewPool.length;i++)ids.push(crewPool.shift().id);
      if(!ids.length)return false;
      this.mem.sites.push({type,x:s.x,y:s.y});
      push({type:'build',building:type,units:ids,x:Math.round(s.x),y:Math.round(s.y)});
      return true;
    };

    // ---------------- build order ----------------
    const nb=blds.filter(b=>b.type==='barracks').length;
    if(nb<2) buildOnce('barracks',130,-140,3);
    else if(this.opts.barracks3At>=0&&t>=this.opts.barracks3At&&nb<3) buildOnce('barracks',165,95,1,90,10);
    if(this.opts.homeTowerAt>=0&&t>=this.opts.homeTowerAt&&blds.filter(b=>b.type==='tower').length<1) buildOnce('tower',-190,-30,3);
    const farms=blds.filter(b=>b.type==='farm').length;
    const headroom=p.popCap-p.population;
    if(headroom<=10&&farms<10) buildOnce('farm',-215,110+((farms%4)*95),1);

    // ---------------- economy ----------------
    let goldW=workers.filter(w=>w.order&&w.order.type==='gather'&&w.gatherKind==='gold').length;
    for(const w of idleWorkers){
      if(cmds.length>=19)break;
      const kind=goldW<Math.max(3,Math.round(workers.length*0.6))?'gold':'wood';
      const res=st.resources.filter(r=>r.amount>0&&r.kind===kind).sort((a,b)=>dist(w,a)-dist(w,b))[0];
      if(res){push({type:'gather',units:[w.id],target:res.id});if(kind==='gold')goldW++;}
    }

    // ---------------- production ----------------
    if(workers.length<this.opts.workers&&t<52&&th.queue.length<2&&p.gold>=60) push({type:'train',unit:'worker',building:th.id});
    const barracks=blds.filter(b=>b.type==='barracks'&&b.complete);
    const reserveFarm=(headroom<=14&&farms<10)?70:0;
    const spearWant=(this.opts.spearmen||0)>army.filter(u=>u.type==='spearman').length;
    for(const b of barracks){
      if(b.queue.length>=2)continue;
      const unit=spearWant&&b.queue.length===0?'spearman':'footman';
      const woodNeed=unit==='spearman'?20:10;
      if(p.gold>=90+reserveFarm&&p.wood>=woodNeed&&p.population+2<=p.popCap) push({type:'train',unit,building:b.id});
    }

    // ---------------- phase ----------------
    const enemyNearArmy=army.length?foes.some(e=>dist(e,avg(army))<540):false;
    const campTarget=M(750,480);
    // rotated near camp: camp0 for the west seat, camp1 for the east seat
    const camp=(st.camps||[]).find(c=>dist(c,campTarget)<160);
    const campGone=!camp||camp.cleared;
    if(this.mem.phase==='camp'&&(campGone||t>=this.opts.campUntil||(hero&&hero.hp<hero.maxHp*0.4))) this.mem.phase='stage';
    if(this.mem.phase==='stage'){
      const ready=footmen.length>=this.opts.departFootmen||t>=this.opts.departAt;
      const gathered=army.length>0&&army.filter(u=>dist(u,stage)<420).length>=Math.ceil(army.length*0.75);
      if(ready&&footmen.length>=6&&(gathered||t>=this.opts.departAt+8)) this.mem.phase='march';
    }
    // forward rendezvous 1350 from the enemy hall: the whole first wave waits
    // here so the final approach is one mass instead of a conveyor belt
    const laneY=base.x<1600?150:1850;
    const rallyFwd=foeTH?{x:foeTH.x+(base.x>1600?1050:-1050),y:laneY}:stage;
    if(this.mem.phase==='march'&&foeTH){
      this.mem.marchStart=this.mem.marchStart===undefined?t:this.mem.marchStart;
      const lead=army.slice().sort((a,b)=>dist(a,foeTH)-dist(b,foeTH))[0];
      if(lead&&dist(lead,foeTH)<1500) this.mem.phase='gather';
    }
    if(this.mem.phase==='gather'){
      this.mem.gatherStart=this.mem.gatherStart===undefined?t:this.mem.gatherStart;
      const near=army.filter(u=>dist(u,rallyFwd)<330).length;
      const foeNear=foes.some(e=>avg(army)&&dist(e,avg(army))<420);
      if(near>=Math.max(9,Math.floor(army.length*0.6))||t>=(this.mem.gatherStart)+16||foeNear) this.mem.phase='assault';
    }
    if((this.mem.phase==='assault'||this.mem.phase==='gather')&&army.length<=2){
      const homeThreat=foes.filter(e=>dist(e,base)<650);
      if(homeThreat.length>=3)this.mem.phase='defend';
    }
    if(this.mem.phase==='defend'&&foes.every(e=>dist(e,base)>800))this.mem.phase='assault';

    let route;
    if(this.opts.route==='near') route=[M(330,1860),M(2870,1860),M(2900,1320)];
    else if(this.opts.route==='swing'&&foeTH){
      const dir=foeTH.x>1600?1:-1;
      route=[M(330,150),M(2870,150),M(2900,700),
        {x:foeTH.x+dir*250,y:foeTH.y-190},{x:foeTH.x+dir*250,y:foeTH.y+60}];
    }
    else if(this.opts.route==='wide'&&foeTH){
      // stay on the outer lane to the map edge, then descend onto the side of
      // the enemy hall that faces away from its towers and shrine-side army
      const edge=foeTH.x>1600?3120:80;
      const lane=foeTH.x>1600?150:1850;
      route=[{x:Math.round(T(0,-850).x),y:lane},{x:edge,y:lane},{x:edge,y:foeTH.y}];
    }
    else route=[M(330,150),M(2870,150),M(2900,700)];

    // ---------------- camp squad ----------------
    if(this.mem.phase==='camp'){
      if(hero&&!hero.casting){
        const near=foes.filter(e=>dist(e,hero)<470);
        if(near.length&&this.skillReady(hero,'n_drain',st)) push({type:'cast',unit:hero.id,skill:'n_drain',target:nearest(near,hero).id});
        else if(this.skillReady(hero,'n_raise',st)&&dist(hero,campTarget)<=260) push({type:'cast',unit:hero.id,skill:'n_raise',x:Math.round(campTarget.x),y:Math.round(campTarget.y)});
      }
      if(army.length&&reissue('campGo',1.6)){
        push({type:'attackMove',units:army.map(u=>u.id),x:Math.round(campTarget.x),y:Math.round(campTarget.y)});
        this.mem.at.campGo=t;
      }
    }

    // ---------------- movement ----------------
    const moveGroup=(target,type)=>{
      if(!army.length)return;
      const same=this.mem.moveTarget&&dist(target,this.mem.moveTarget)<40&&this.mem.moveType===type;
      if(!same&&reissue('mv',this.opts.reissue)||!same&&!this.mem.moveTarget){
        push({type,units:army.map(u=>u.id),x:Math.round(target.x),y:Math.round(target.y)});
        this.mem.at.mv=t;this.mem.moveTarget={x:target.x,y:target.y};this.mem.moveType=type;
      }
    };
    if(this.mem.phase==='stage'){
      if(enemyNearArmy)moveGroup(avg(foes.filter(e=>dist(e,avg(army))<540))||stage,'attackMove');
      else moveGroup(stage,'move');
    }else if(this.mem.phase==='march'){
      // per-unit waypoint progress: the leading half must never wait for the
      // tail (round 1's other failure mode was the whole ball stalling)
      const groups=new Map();
      for(const u of army){
        let idx=this.mem.unitWp&&this.mem.unitWp[u.id]||0;
        while(idx<route.length&&dist(u,route[idx])<260)idx++;
        if(!this.mem.unitWp)this.mem.unitWp={};
        this.mem.unitWp[u.id]=idx;
        if(!groups.has(idx))groups.set(idx,[]);
        groups.get(idx).push(u.id);
      }
      for(const [idx,ids] of groups){
        let target=idx<route.length?route[idx]:(foeTH?{x:foeTH.x,y:foeTH.y}:route[route.length-1]);
        const members=army.filter(u=>ids.includes(u.id));
        // detect enemies from the group's LEADING edge, never from a centroid
        // smeared back to the base (that made the front run backwards)
        const sorted=members.slice().sort((a,b)=>dist(a,target)-dist(b,target));
        const lead=avg(sorted.slice(0,Math.min(5,sorted.length)))||avg(members);
        let type='move';
        const near=lead?foes.filter(e=>dist(e,lead)<520):[];
        if(near.length){target=nearest(near,lead);type='attackMove';}
        const key='g'+idx;
        if(reissue(key,1.6)||!this.mem.grpTarget||dist(target,this.mem.grpTarget[key]||{x:1e9,y:1e9})>70||this.mem.grpType[key]!==type){
          push({type,units:ids,x:Math.round(target.x),y:Math.round(target.y)});
          this.mem.at[key]=t;
          if(!this.mem.grpTarget)this.mem.grpTarget={};
          if(!this.mem.grpType)this.mem.grpType={};
          this.mem.grpTarget[key]={x:target.x,y:target.y};this.mem.grpType[key]=type;
        }
      }
    }else if(this.mem.phase==='gather'){
      if(enemyNearArmy)moveGroup(avg(foes.filter(e=>dist(e,avg(army))<560))||rallyFwd,'attackMove');
      else moveGroup(rallyFwd,'move');
    }else if(this.mem.phase==='defend'){
      moveGroup(avg(foes.filter(e=>dist(e,base)<850))||{x:base.x,y:base.y},'attackMove');
    }else if(this.mem.phase==='assault'){
      this.assault(st,{t,hero,army,foes,foeTH,base,push,reissue});
    }

    // ---------------- hero skills ----------------
    if(hero&&this.mem.phase!=='camp'&&hero.hp>0) this.heroSkills(st,hero,foes,army,push,this.mem.phase,foeTH);

    // ---------------- footman shield wall ----------------
    if(this.opts.guard&&(this.mem.phase==='assault'||this.mem.phase==='defend'||enemyNearArmy)){
      let n=0;
      for(const u of footmen){
        if(n>=2||cmds.length>=19)break;
        if((u.cooldowns&&u.cooldowns.u_guard||0)<=t&&!u.casting){
          push({type:'cast',unit:u.id,skill:'u_guard'});n++;
        }
      }
    }

    // ---------------- barracks rally ----------------
    for(const b of blds){
      if(b.type==='barracks'&&b.complete&&!this.mem.rallySet[b.id]){
        push({type:'rally',building:b.id,x:Math.round(stage.x),y:Math.round(stage.y)});
        this.mem.rallySet[b.id]=true;
      }
    }
    return {commands:cmds.slice(0,20),note:this.mem.phase};
  }

  skillReady(u,id,st){
    const cd=(u.cooldowns&&u.cooldowns[id])||0;
    if(cd>st.now)return false;
    const sk=st.catalog&&st.catalog.skills&&st.catalog.skills[id];
    if(sk){if((u.mana||0)<(sk.mana||0))return false;if(u.level<(sk.requiredLevel||1))return false;}
    return true;
  }

  heroSkills(st,hero,foes,army,push,phase,foeTH){
    if(hero.type!=='necromancer'||hero.casting)return;
    const ready=id=>this.skillReady(hero,id,st);
    const near=foes.filter(e=>dist(e,hero)<560);
    const clump=(arr,r)=>{let b=null,bc=0;for(const a of arr){const s=arr.filter(v=>dist(a,v)<r);if(s.length>bc){bc=s.length;b=avg(s);}}return b?{x:b.x,y:b.y,n:bc}:null;};
    const cl=clump(near.filter(e=>dist(e,hero)<490),160);
    const toward=enemy=>{
      const len=Math.max(1,dist(hero,enemy));
      return {x:hero.x+(enemy.x-hero.x)/len*220,y:hero.y+(enemy.y-hero.y)/len*220};
    };
    // ---- skeletons: the front-line sponges. Spawn them at the fight, not at
    // the hero's feet, but respect the 280 cast range.
    if(ready('n_raise')){
      let a=null;
      if(cl&&dist(hero,cl)<=265)a=cl;
      else if(phase==='assault'&&foeTH)a=toward(foeTH);
      else{const n=nearest(near,hero);if(n&&dist(hero,n)<=265)a=toward(n);}
      if(a&&dist(hero,a)<=275){push({type:'cast',unit:hero.id,skill:'n_raise',x:Math.round(a.x),y:Math.round(a.y)});return;}
    }
    // ---- plague: clump first, then the hall itself (armour-ignoring)
    if(ready('n_plague')){
      if(cl&&cl.n>=3&&dist(hero,cl)<=550){push({type:'cast',unit:hero.id,skill:'n_plague',x:Math.round(cl.x),y:Math.round(cl.y)});return;}
      if(phase==='assault'&&foeTH){const d=dist(hero,foeTH);if(d<=550&&d>=90){push({type:'cast',unit:hero.id,skill:'n_plague',x:Math.round(foeTH.x),y:Math.round(foeTH.y)});return;}}
    }
    // ---- curse: -30% damage on the defender clump
    if(ready('n_curse')&&cl&&cl.n>=3&&dist(hero,cl)<=550){push({type:'cast',unit:hero.id,skill:'n_curse',x:Math.round(cl.x),y:Math.round(cl.y)});return;}
    // ---- drain for damage + self sustain
    if(ready('n_drain')&&near.length){
      const n=nearest(near,hero);if(dist(hero,n)<=550)push({type:'cast',unit:hero.id,skill:'n_drain',target:n.id});
    }
  }

  assault(st,ctx){
    const {t,hero,army,foes,foeTH,base,push,reissue}=ctx;
    if(!foeTH)return;
    // Every fighter gets an explicit attack order on the hall. An explicit
    // target suppresses auto-acquire, so the ball walks straight through the
    // kiting heroes instead of being peeled off one by one.
    const fighters=army.filter(u=>u!==hero);
    // Split the pressure: units already at the wall keep hitting it; the
    // reinforcement stream must not arrive one at a time. It collects at a
    // forward rally and only advances in packs of four or more.
    const dxr=base.x-foeTH.x,dyr=base.y-foeTH.y,dlr=Math.hypot(dxr,dyr)||1;
    const rally={x:foeTH.x+dxr/dlr*880,y:foeTH.y+dyr/dlr*880};
    // spearman nets: root the most dangerous hero so the ball can actually
    // reach a kiter; melee near a rooted hero switches onto it
    const spear=fighters.filter(u=>u.type==='spearman');
    const heroes=foes.filter(e=>e.hero);
    const rootedHeroes=new Set();
    for(const sp of spear){
      if((sp.cooldowns&&sp.cooldowns.u_net||0)>t||sp.casting)continue;
      const h=heroes.filter(e=>dist(e,sp)<=340).sort((a,b)=>{
        const pr=x=>x.type==='frost'?0:x.type==='druid'?1:x.type==='pyromancer'?2:3;return pr(a)-pr(b)||dist(a,sp)-dist(b,sp);})[0];
      if(h){push({type:'cast',unit:sp.id,skill:'u_net',target:h.id});rootedHeroes.add(h.id);}
    }
    const rooted=foes.filter(e=>rootedHeroes.has(e.id)||((e.statuses&&e.statuses.root||0)>t));
    const atWall=fighters.filter(u=>dist(u,foeTH)<1400);
    const rear=fighters.filter(u=>dist(u,foeTH)>=1400);
    // hamstring the enemy economy: anyone standing next to the worker line
    // finishes it before turning on the hall. Dead workers = no reinforcements.
    // anything already shooting us from inside our own weapon range gets hit
    // first; otherwise the column walks past it and bleeds out for free
    const workers=foes.filter(e=>e.type==='worker');
    const busy=new Set();
    const inFace=foes.filter(e=>e.type!=='worker');
    for(const u of fighters){
      if(busy.has(u.id))continue;
      const e=inFace.filter(x=>dist(x,u)<120).sort((a,b)=>dist(a,u)-dist(b,u))[0];
      if(e){push({type:'attack',units:[u.id],target:e.id});busy.add(u.id);}
    }
    if(rooted.length){
      for(const u of fighters){
        const h=rooted.filter(e=>dist(e,u)<300).sort((a,b)=>dist(a,u)-dist(b,u))[0];
        if(h){push({type:'attack',units:[u.id],target:h.id});busy.add(u.id);}
      }
    }
    if(workers.length){
      for(const u of fighters){
        if(busy.has(u.id))continue;
        const w=workers.filter(e=>dist(e,u)<300).sort((a,b)=>dist(a,u)-dist(b,u))[0];
        if(w){push({type:'attack',units:[u.id],target:w.id});busy.add(u.id);}
      }
    }
    const wall=atWall.filter(u=>!busy.has(u.id));
    if(wall.length&&(reissue('atk',2.6)||this.mem.atkTarget!==foeTH.id)){
      push({type:'attack',units:wall.map(u=>u.id),target:foeTH.id});
      this.mem.at.atk=t;this.mem.atkTarget=foeTH.id;
    }
    if(rear.length){
      const gathered=rear.filter(u=>dist(u,rally)<320);
      const pack=gathered.length>=4;
      const ids=(pack?gathered:rear).map(u=>u.id);
      const key=pack?'pack':'rear';
      if(reissue(key,pack?0.9:2.2)){
        if(pack)push({type:'attack',units:ids,target:foeTH.id});
        else push({type:'move',units:ids,x:Math.round(rally.x),y:Math.round(rally.y)});
        this.mem.at[key]=t;
      }
    }
    // Keep the necromancer out of the town hall / tower envelope: it only needs
    // to be within spell range, and every extra second alive is another plague
    // cycle and skeleton pack. Round 1 fed the hero into melee and lost it.
    if(hero&&hero.hp>0){
      // stand on the side of the hall opposite the enemy field army: the hall
      // blocks their path and their towers/shrine are on the other side
      const enemyArmy=foes.filter(e=>e.type!=='worker'&&dist(e,foeTH)<900);
      const ec=avg(enemyArmy);
      let dx,dy;
      if(ec&&dist(ec,foeTH)>40){dx=foeTH.x-ec.x;dy=foeTH.y-ec.y;}
      else{dx=base.x-foeTH.x;dy=base.y-foeTH.y;}
      const dl=Math.hypot(dx,dy)||1;
      const back=hero.hp<hero.maxHp*0.45?620:430;
      const want={x:Math.min(3140,Math.max(60,foeTH.x+dx/dl*back)),y:Math.min(1940,Math.max(60,foeTH.y+dy/dl*back))};
      if(reissue('heroPos',1.8)||dist(hero,want)>150){
        push({type:'move',units:[hero.id],x:Math.round(want.x),y:Math.round(want.y)});
        this.mem.at.heroPos=t;
      }
    }
  }
}
module.exports={Agent};

// ---------------- stdin wrapper ----------------
if(require.main===module){
  const readline=require('readline');
  const agent=new Agent(process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{});
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',line=>{
    line=line.trim();if(!line)return;
    let out={commands:[]};
    try{
      const st=JSON.parse(line);
      out=agent.decide(st);
      if(!out||!Array.isArray(out.commands))out={commands:[]};
    }catch(e){console.error('agent error',e&&e.stack||e);out={commands:[]};}
    if(out.commands.length>20)out.commands=out.commands.slice(0,20);
    process.stdout.write(JSON.stringify(out)+'\n');
  });
}
