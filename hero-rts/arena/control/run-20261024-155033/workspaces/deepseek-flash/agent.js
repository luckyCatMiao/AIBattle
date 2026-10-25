// Ashen Throne agent, round 3. Pure decide(state) + stdin/stdout wrapper.
//
// Necromancer + three-barracks shieldman timing push.
//
//   Opening: a second barracks at once with a three-worker crew, a third at
//   t=20, worker target 9.  The four starting shieldmen and the hero clear the
//   near creep camp (gold + hero XP; level 3 unlocks the armour-ignoring
//   plague ultimate).  One recruit is detached to the safe shrine next to our
//   base: +3 gold and +1 wood per second for the rest of the game.  (The two
//   central shrines sit inside the central colossus's 300 aggro radius and are
//   not worth a shieldman -- measured, they die before capturing.)
//
//   Main force: every unit gathers at a staging point, then the WHOLE ball
//   departs at once (14 shieldmen or t=58).  Round 2 left at 11 and fed the
//   enemy hero ball one unit at a time; that was the round-2 loss.  The march
//   uses plain `move` along the outer lane, so nothing is peeled off by
//   kiting heroes or the central colossus.
//
//   Assault: the town hall is the win condition, so the ball focuses it.
//   For the first 8 seconds a dense enemy worker cluster is cleared instead
//   (the frozen opponent's plan is an 18-worker economy).  Rooted units are
//   focused; nothing else is chased.  Plague/curse/skeletons and shield wall
//   are kept on cooldown.  The hero stands 430 behind the ball, on our side,
//   never behind the enemy hall.
//
//   If the hall stops losing hp the punch is spent: the survivors regroup at
//   the far-lane corner (route[1], ~900 from the enemy hall, far from its
//   army), wait for 10+ shieldmen, and hit again as a second ball.
const RAD={townhall:58,altar:40,barracks:38,range:38,stable:38,arcane:38,workshop:38,aviary:38,forge:38,lumbermill:30,farm:25,tower:25};
const COST={barracks:[150,70],farm:[70,40],range:[150,85],arcane:[175,120],forge:[150,100],tower:[140,100],lumbermill:[100,60]};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const numId=id=>{const m=String(id).match(/(\d+)/);return m?+m[1]:0;};
const avg=arr=>{if(!arr||!arr.length)return null;let x=0,y=0;for(const u of arr){x+=u.x;y+=u.y;}return{x:x/arr.length,y:y/arr.length};};
function nearest(arr,p){let b=null,bd=1e9;for(const v of arr){const d=dist(v,p);if(d<bd){bd=d;b=v;}}return b;}

class Agent{
  constructor(opts={}){
    this.opts=Object.assign({
      workers:9,
      camp:true,
      campUntil:26,
      barracks3At:20,
      departAt:58,
      departFootmen:14,
      stageOff:[40,-330],
      route:'far',            // 'far' outer lane | 'near' opposite lane
      guard:true,
      raidTime:0,             // seconds spent wrecking the worker line on arrival
      spearmen:0,
      homeTowerAt:-1,
      focusR:0,              // 0 = pure town-hall race
      clearFirst:false,       // fight the field army before the hall
      marchFight:false,       // stop to fight while marching (usually a trap)
      reissue:2.0,
      regroupAt:10,           // second-wave size before marching again
      commitFrac:0.45,        // share of the ball near the hall before committing
      commitDist:900,         // or the ball centre this close to the hall
      commitMin:5,
      nodeCapture:1,          // safe shrine next to our base (+3 gold/+1 wood per s)
      earlyRaid:false,
      raidUntil:62,
      regroupForward:true,
      regroupWait:40,
      workerRaid:8,          // seconds spent on the enemy worker line on arrival
      intercept:false,       // turn on an enemy army that is heading for our base
    },opts);
    this.mem={phase:'camp',wp:0,at:{},sites:[],rallySet:{},grpTarget:{},grpType:{},unitWp:{},assaultStart:0,nodeJobs:{},regroupAt0:0,raidIds:new Set(),raidInit:false,lastTHHP:1e9,thStill:0};
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
    if(this.opts.earlyRaid&&!this.mem.raidInit){this.mem.raidInit=true;for(const u of mine)if(u.type!=='worker'&&!u.summoned)this.mem.raidIds.add(u.id);}
    if(this.mem.raidIds.size&&t>this.opts.raidUntil)this.mem.raidIds.clear();
    const base={x:th.x,y:th.y};
    const side=th.x<1600?'west':'east';
    // offsets are canonical west and rotated 180 degrees about the map centre
    const T=(ox,oy)=>side==='west'?{x:base.x+ox,y:base.y+oy}:{x:base.x-ox,y:base.y-oy};
    const M=(x,y)=>side==='west'?{x,y}:{x:3200-x,y:2000-y};
    const cmds=[];
    const push=c=>{if(cmds.length<20)cmds.push(c);};
    const reissue=(key,at)=>t>=(this.mem.at[key]===undefined?-1e9:this.mem.at[key])+at;
    const stage=T(this.opts.stageOff[0],this.opts.stageOff[1]);
    const route=this.opts.route==='near'
      ?[M(330,1875),M(2870,1875),M(2900,1320)]
      :[M(330,125),M(2870,125),M(2900,700)];
    this.mem.route=route;
    const gatherPoint=this.opts.regroupForward?route[1]:stage;

    // ---------------- shrine capture ----------------
    // The two central shrines and the shrine next to our base are never
    // contested by the frozen opponent's opening.  Each held shrine is +3
    // gold and +1 wood per second for the rest of the game, worth far more
    // than the single shieldman sent to take it.  Jobs are assigned before
    // `army` is computed so a capturer is never also ordered to the camp.
    if(this.opts.nodeCapture&&!this.mem.startIds)this.mem.startIds=new Set(mine.map(u=>u.id));
    if(this.opts.nodeCapture){
      // the two central shrines sit inside the central colossus's 300 aggro
      // radius; only the shrine next to our base is safely capturable.
      const pts=[M(900,1000)];
      const used=new Set(Object.values(this.mem.nodeJobs).map(j=>j.key));
      let want=this.opts.nodeCapture-Object.keys(this.mem.nodeJobs).length-st.nodes.filter(n=>n.owner===me).length;
      const cands=this.mem.startIds?mine.filter(f=>f.type==='footman'&&!f.summoned&&!this.mem.startIds.has(f.id)&&!this.mem.nodeJobs[f.id]&&!this.mem.raidIds.has(f.id)&&dist(f,base)<700)
        .sort((a,b)=>numId(a.id)-numId(b.id)):[];
      for(const u of cands){
        if(want<=0)break;
        let pick=null;
        for(const pt of pts){const key=Math.round(pt.x)+','+Math.round(pt.y);if(!used.has(key)){pick={x:pt.x,y:pt.y,key};break;}}
        if(!pick)break;
        used.add(pick.key);want--;
        this.mem.nodeJobs[u.id]={key:pick.key,nx:pick.x,ny:pick.y};
        push({type:'move',units:[u.id],x:Math.round(pick.x),y:Math.round(pick.y)});this.mem.at['nd'+u.id]=t;
      }
      const rel=[];
      for(const [id,job] of Object.entries(this.mem.nodeJobs)){
        const u=mine.find(x=>x.id===id);
        if(!u){delete this.mem.nodeJobs[id];continue;}
        const node=st.nodes.find(n=>Math.round(n.x)+','+Math.round(n.y)===job.key);
        if((node&&node.owner===me)||t>100){rel.push(id);continue;}
        if(reissue('nd'+id,2.0)){push({type:'move',units:[id],x:Math.round(job.nx),y:Math.round(job.ny)});this.mem.at['nd'+id]=t;}
      }
      for(const id of rel)delete this.mem.nodeJobs[id];
    }
    const army=mine.filter(u=>u.type!=='worker'&&!u.summoned&&!this.mem.nodeJobs[u.id]&&!this.mem.raidIds.has(u.id));
    const hero=army.find(u=>u.hero);
    const footmen=army.filter(u=>u.type==='footman');

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
    if(workers.length<this.opts.workers&&t<55&&th.queue.length<2&&p.gold>=60) push({type:'train',unit:'worker',building:th.id});
    const barracks=blds.filter(b=>b.type==='barracks'&&b.complete);
    const reserveFarm=(headroom<=14&&farms<10)?70:0;
    const spearWant=(this.opts.spearmen||0)>army.filter(u=>u.type==='spearman').length;
    for(const b of barracks){
      if(b.queue.length>=2)continue;
      const unit=spearWant&&b.queue.length===0?'spearman':'footman';
      const woodNeed=unit==='spearman'?20:10;
      if(p.gold>=90+reserveFarm&&p.wood>=woodNeed&&p.population+2<=p.popCap) push({type:'train',unit,building:b.id});
    }

    // ---------------- phases ----------------
    const enemyNearArmy=army.length?foes.some(e=>dist(e,avg(army))<540):false;
    const campTarget=M(750,480);
    const camp=(st.camps||[]).find(c=>dist(c,campTarget)<160);
    const campGone=!camp||camp.cleared;
    if(this.mem.phase==='camp'&&(campGone||!this.opts.camp||t>=this.opts.campUntil||(hero&&hero.hp<hero.maxHp*0.4))) this.mem.phase='stage';
    if(this.mem.phase==='stage'){
      const ready=footmen.length>=this.opts.departFootmen||t>=this.opts.departAt;
      const gathered=army.length>0&&army.filter(u=>dist(u,stage)<420).length>=Math.ceil(army.length*0.75);
      if(ready&&footmen.length>=6&&(gathered||t>=this.opts.departAt+8)) this.mem.phase='march';
    }
    if(this.mem.phase==='march'&&foeTH){
      const front=army.filter(u=>dist(u,foeTH)<800).length;
      const c=avg(army);
      // commit only when the bulk of the ball is there, otherwise the leading
      // few walk into the defender ball alone (round-2's losing pattern)
      if(front>=Math.max(this.opts.commitMin,Math.ceil(army.length*this.opts.commitFrac))||(c&&dist(c,foeTH)<this.opts.commitDist)) this.mem.phase='assault';
    }
    if(this.mem.phase==='assault'){
      if(!this.mem.assaultStart)this.mem.assaultStart=t;
      const homeThreat=foes.filter(e=>dist(e,base)<650);
      if(army.length<=2&&homeThreat.length>=3)this.mem.phase='defend';
      else if(foeTH){
        // stall detector: if the hall stops losing hp, the punch has been
        // spent and stragglers are just feeding the defender ball
        if(foeTH.hp<this.mem.lastTHHP-40){this.mem.lastTHHP=foeTH.hp;this.mem.thStill=t;}
        const stalled=t-this.mem.thStill>11&&foeTH.hp>800&&t<430;
        if(army.filter(u=>!u.hero).length<=4&&foeTH.hp>900){this.mem.phase='regroup';this.mem.regroupAt0=t;}
        else if(stalled&&this.mem.assaultStart&&t-this.mem.assaultStart>20){this.mem.phase='regroup';this.mem.regroupAt0=t;}
      }
    }
    if(this.mem.phase==='regroup'){
      const movers=army;
      const gathered=movers.length>0&&movers.filter(u=>dist(u,gatherPoint)<520).length>=Math.ceil(movers.length*0.75);
      if(footmen.length>=this.opts.regroupAt||(t>=this.mem.regroupAt0+25&&footmen.length>=6)){
        if(gathered||t>=this.mem.regroupAt0+(this.opts.regroupWait||40)){this.mem.phase='march';this.mem.regroupAt0=0;this.mem.atkTarget=null;this.mem.assaultStart=0;this.mem.lastTHHP=1e9;this.mem.thStill=t;}
      }
    }
    if(this.mem.phase==='defend'&&foes.every(e=>dist(e,base)>800))this.mem.phase='assault';

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

    // ---------------- early worker raid ----------------
    // The frozen opponent sends its whole army to a distant creep camp at
    // t=25..38 while its economy is unguarded.  The starting squad can reach
    // its wood line at t~30, killing most of its workers and forcing its
    // army back before our real ball arrives.
    const raidSquad=mine.filter(u=>this.mem.raidIds.has(u.id)&&u.type!=='worker'&&!u.summoned);
    if(this.opts.earlyRaid&&raidSquad.length){
      const wood=M(2805,760);
      const c=avg(raidSquad)||wood;
      let target=wood,type='move';
      if(dist(c,wood)<650){target=foeTH?{x:foeTH.x,y:foeTH.y}:wood;type='attackMove';}
      const nw=nearest(foes.filter(e=>e.type==='worker'&&dist(e,c)<420),c);
      if(nw){target=nw;type='attack';}
      if(reissue('raid',1.4)){
        const cmd={type,units:raidSquad.map(u=>u.id)};
        if(type==='attack')cmd.target=target.id;else{cmd.x=Math.round(target.x);cmd.y=Math.round(target.y);}
        push(cmd);this.mem.at.raid=t;
      }
    }

    // ---------------- movement ----------------
    const moveGroup=(target,type)=>{
      if(!army.length)return;
      const same=this.mem.moveTarget&&dist(target,this.mem.moveTarget)<40&&this.mem.moveType===type;
      if((!same&&reissue('mv',this.opts.reissue||2))||(!same&&!this.mem.moveTarget)){
        push({type,units:army.map(u=>u.id),x:Math.round(target.x),y:Math.round(target.y)});
        this.mem.at.mv=t;this.mem.moveTarget={x:target.x,y:target.y};this.mem.moveType=type;
      }
    };
    if(this.mem.phase==='stage'){
      if(enemyNearArmy)moveGroup(avg(foes.filter(e=>dist(e,avg(army))<540))||stage,'attackMove');
      else moveGroup(stage,'move');
    }else if(this.mem.phase==='march'){
      this.marchUnits(army,t,route,foeTH,foes,push,reissue);
    }else if(this.mem.phase==='defend'){
      moveGroup(avg(foes.filter(e=>dist(e,base)<850))||{x:base.x,y:base.y},'attackMove');
    }else if(this.mem.phase==='regroup'){
      if(!this.mem.regroupAt0)this.mem.regroupAt0=t;
      moveGroup(gatherPoint,'move');
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
        if(((u.cooldowns&&u.cooldowns.u_guard)||0)<=t&&!u.casting){push({type:'cast',unit:u.id,skill:'u_guard'});n++;}
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

  // per-unit waypoint movement along the outer lane; used by the march and by
  // reinforcements that are still far from the fight (they must never path
  // straight across the map through the central colossus)
  marchUnits(units,t,route,foeTH,foes,push,reissue){
    if(!units.length)return;
    const groups=new Map();
    for(const u of units){
      let idx=this.mem.unitWp[u.id]||0;
      while(idx<route.length&&dist(u,route[idx])<260)idx++;
      this.mem.unitWp[u.id]=idx;
      if(!groups.has(idx))groups.set(idx,[]);
      groups.get(idx).push(u.id);
    }
    for(const [idx,ids] of groups){
      let target=idx<route.length?route[idx]:(foeTH?{x:foeTH.x,y:foeTH.y}:route[route.length-1]);
      const members=units.filter(u=>ids.includes(u.id));
      const sorted=members.slice().sort((a,b)=>dist(a,target)-dist(b,target));
      const lead=avg(sorted.slice(0,Math.min(5,sorted.length)))||avg(members);
      const near=(this.opts.marchFight&&lead)?foes.filter(e=>dist(e,lead)<480):[];
      let type='move';
      if(near.length){target=nearest(near,lead);type='attackMove';}
      const key='g'+idx;
      if(reissue(key,1.8)||dist(target,this.mem.grpTarget[key]||{x:1e9,y:1e9})>70||this.mem.grpType[key]!==type){
        push({type,units:ids,x:Math.round(target.x),y:Math.round(target.y)});
        this.mem.at[key]=t;this.mem.grpTarget[key]={x:target.x,y:target.y};this.mem.grpType[key]=type;
      }
    }
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
    const toward=enemy=>{const len=Math.max(1,dist(hero,enemy));return {x:hero.x+(enemy.x-hero.x)/len*220,y:hero.y+(enemy.y-hero.y)/len*220};};
    if(ready('n_raise')){
      let a=null;
      const cl=clump(near.filter(e=>dist(e,hero)<300),150);
      if(cl&&dist(hero,cl)<=265)a=cl;
      else if(phase==='assault'&&foeTH)a=toward(foeTH);
      else{const n=nearest(near,hero);if(n&&dist(hero,n)<=265)a=toward(n);}
      if(a&&dist(hero,a)<=275){push({type:'cast',unit:hero.id,skill:'n_raise',x:Math.round(a.x),y:Math.round(a.y)});return;}
    }
    const cl=clump(near.filter(e=>dist(e,hero)<420),160);
    if(ready('n_plague')){
      if(cl&&cl.n>=3&&dist(hero,cl)<=550){push({type:'cast',unit:hero.id,skill:'n_plague',x:Math.round(cl.x),y:Math.round(cl.y)});return;}
      if(phase==='assault'&&foeTH){const d=dist(hero,foeTH);if(d<=550&&d>=90){push({type:'cast',unit:hero.id,skill:'n_plague',x:Math.round(foeTH.x),y:Math.round(foeTH.y)});return;}}
    }
    if(ready('n_curse')&&cl&&cl.n>=3&&dist(hero,cl)<=550){push({type:'cast',unit:hero.id,skill:'n_curse',x:Math.round(cl.x),y:Math.round(cl.y)});return;}
    if(ready('n_drain')&&near.length){
      const n=nearest(near,hero);if(dist(hero,n)<=550)push({type:'cast',unit:hero.id,skill:'n_drain',target:n.id});
    }
  }

  assault(st,ctx){
    const {t,hero,army,foes,foeTH,base,push,reissue}=ctx;
    if(!foeTH)return;
    const allFighters=army.filter(u=>u!==hero);
    // reinforcements more than 1250 from the hall keep using the safe lane
    const farLimit=1250;
    const fighters=allFighters.filter(u=>dist(u,foeTH)<farLimit);
    const far=allFighters.filter(u=>dist(u,foeTH)>=farLimit);
    if(far.length)this.marchUnits(far,t,this.mem.route||[],foeTH,foes,push,reissue);
    const raid=this.mem.assaultStart&&t<this.mem.assaultStart+(this.opts.raidTime||0);
    if(this.opts.clearFirst&&fighters.length){
      const c=avg(fighters);
      const field=foes.filter(e=>e.type!=='worker'&&e.type!=='treant'&&c&&dist(e,c)<720);
      if(field.length>=2){
        const fc=avg(field);
        if(reissue('clear',1.4)){
          push({type:'attackMove',units:fighters.map(u=>u.id),x:Math.round(fc.x),y:Math.round(fc.y)});
          this.mem.at.clear=t;
        }
        return;
      }
    }
    const workers=foes.filter(e=>e.type==='worker');
    const rooted=foes.filter(e=>(e.statuses&&e.statuses.root||0)>t);
    const busy=new Set();
    // 1a. rooted heroes in reach -- they cannot kite, so this is a free kill
    for(const u of fighters){
      const h=rooted.filter(e=>dist(e,u)<340).sort((a,b)=>dist(a,u)-dist(b,u))[0];
      if(h){push({type:'attack',units:[u.id],target:h.id});busy.add(u.id);}
    }
    // 1b. a hero that has stepped into our own weapon range is worth killing;
    // beyond that we never chase (kiting would drag the ball off the hall)
    const heroFoes=foes.filter(e=>e.hero);
    if(heroFoes.length)for(const u of fighters){
      if(busy.has(u.id))continue;
      const fr=this.opts.focusR>0?this.opts.focusR:0;if(!fr)continue;
      const h=heroFoes.filter(e=>dist(e,u)<fr).sort((a,b)=>dist(a,u)-dist(b,u))[0];
      if(h){push({type:'attack',units:[u.id],target:h.id});busy.add(u.id);}
    }
    // 2. the worker line during the raid window (their economy is the whole plan)
    let groupTarget=foeTH;
    const ball=avg(fighters);
    if(this.opts.intercept&&ball){
      const fieldArmy=foes.filter(e=>e.type!=='worker'&&dist(e,ball)<750);
      const heading=fieldArmy.filter(e=>dist(e,base)<dist(e,foeTH));
      if(fieldArmy.length>=5&&heading.length>=3){
        const c2=avg(heading);
        groupTarget=nearest(fieldArmy,c2)||foeTH;
      }
    }
    if(workers.length&&ball&&this.mem.assaultStart){
      const inRaidWindow=t<this.mem.assaultStart+(this.opts.workerRaid||0);
      const nearW=workers.filter(e=>dist(e,ball)<700);
      if(inRaidWindow&&nearW.length>=3){
        let best=null,bc=0;
        for(const w of nearW){const n=nearW.filter(x=>dist(x,w)<170).length;if(n>bc){bc=n;best=w;}}
        if(best)groupTarget=best;
      }
    }
    // 3. everything else on the current target; an explicit target stops the
    //    ball from being peeled off by kiting heroes
    const wall=fighters.filter(u=>!busy.has(u.id));
    if(wall.length&&(reissue('atk',2.0)||this.mem.atkTarget!==groupTarget.id||busy.size>0)){
      push({type:'attack',units:wall.map(u=>u.id),target:groupTarget.id});
      this.mem.at.atk=t;this.mem.atkTarget=groupTarget.id;
    }
    if(hero&&hero.hp>0){
      const ec=avg(foes.filter(e=>e.type!=='worker'&&dist(e,foeTH)<900));
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
