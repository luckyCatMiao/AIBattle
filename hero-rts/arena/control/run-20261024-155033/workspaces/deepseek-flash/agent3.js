'use strict';
// Ashen Throne agent, round 3. Pure decide(state) + stdin/stdout wrapper.
//
// Doctrine: necromancer + three-barracks footman timing push.
//   - the four starting shieldmen and the hero clear the near creep camp
//     (gold + hero level 3 -> armour-ignoring plague ultimate);
//   - two early recruits peel off to capture the two central gold shrines
//     (+9 gold/s for the rest of the game, Sol never contests them);
//   - the whole army gathers at a forward staging point and departs as ONE
//     ball.  Round 2 left the staging area at 11 shieldmen and fed the enemy
//     hero ball one unit at a time; the fix is to wait for mass;
//   - the assault is a pure town-hall race (the hall is the win condition),
//     with plague/curse/skeletons and shield wall.  Defenders inside weapon
//     range are focused only when they are about to die anyway.
const RAD={townhall:58,altar:40,barracks:38,range:38,stable:38,arcane:38,workshop:38,aviary:38,forge:38,lumbermill:30,farm:25,tower:25};
const COST={barracks:[150,70],farm:[70,40],range:[150,85],arcane:[175,120],forge:[150,100],tower:[140,100],lumbermill:[100,60]};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const avg=a=>{if(!a||!a.length)return null;let x=0,y=0;for(const u of a){x+=u.x;y+=u.y;}return{x:x/a.length,y:y/a.length};};
function nearest(a,p){let b=null,bd=1e9;for(const v of a){const d=dist(v,p);if(d<bd){bd=d;b=v;}}return b;}

class Agent{
  constructor(opts={}){
    this.opts=Object.assign({
      workers:11,
      workerUntil:60,
      camp:true,
      campUntil:26,
      nodeCapture:true,
      barracks3At:20,
      departFootmen:14,
      departAt:58,
      gatherFrac:0.8,
      stageOff:[1570,-780],   // canonical west offset from own hall
      laneY:200,
      focusR:0,               // 0 = pure hall race
      raidTime:0,
      guard:true,
      homeTowerAt:-1,
      spearRatio:0,           // fraction of barracks output that is spearman
      retreatHp:0.22,
      reissue:2.0,
    },opts);
    this.mem={phase:'camp',sites:[],at:{},unitWp:{},grpTarget:{},grpType:{},rallySet:{},atkTarget:null,nodeJobs:{},push2:false,assaultStart:0};
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
    const army=mine.filter(u=>u.type!=='worker'&&!u.summoned);
    const hero=army.find(u=>u.hero);
    const footmen=army.filter(u=>u.type==='footman');
    const base={x:th.x,y:th.y};
    const side=th.x<1600?'west':'east';
    // canonical coordinates are written for the WEST seat; T mirrors offsets,
    // M mirrors absolute map points (180-degree symmetry about the centre).
    const T=(ox,oy)=>side==='west'?{x:base.x+ox,y:base.y+oy}:{x:base.x-ox,y:base.y-oy};
    const M=(x,y)=>side==='west'?{x,y}:{x:3200-x,y:2000-y};
    const cmds=[];const push=c=>{if(cmds.length<20)cmds.push(c);};
    const reissue=(k,dt)=>t-(this.mem.at[k]===undefined?-1e9:this.mem.at[k])>=dt;
    const stage=T(this.opts.stageOff[0],this.opts.stageOff[1]);
    const route=[M(330,200),M(1450,200),M(2550,200),M(2800,650)];
    this.mem.route=route;

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
    const crewPool=()=>workers.filter(w=>!w.order||w.order.type==='hold'||(w.order.type==='gather'&&!w.returning));
    const buildOnce=(type,ox,oy,crew,resG,resW)=>{
      if(busySite(type))return false;
      const c=COST[type];if(!c)return false;
      if(p.gold<c[0]+(resG||0)||p.wood<c[1]+(resW||0))return false;
      const pool=crewPool();if(!pool.length)return false;
      const s=spotNear(type,ox,oy);if(!s)return false;
      const ids=pool.slice(0,crew).map(w=>w.id);
      this.mem.sites.push({type,x:s.x,y:s.y});
      push({type:'build',building:type,units:ids,x:Math.round(s.x),y:Math.round(s.y)});
      return true;
    };

    // ---------------- build order ----------------
    const nb=blds.filter(b=>b.type==='barracks').length;
    if(nb<2) buildOnce('barracks',130,-140,3);
    else if(t>=this.opts.barracks3At&&nb<3) buildOnce('barracks',165,95,1,90,10);
    if(this.opts.homeTowerAt>=0&&t>=this.opts.homeTowerAt&&blds.filter(b=>b.type==='tower').length<1) buildOnce('tower',-190,-30,3);
    const farms=blds.filter(b=>b.type==='farm').length;
    const headroom=p.popCap-p.population;
    if(headroom<=10&&farms<10) buildOnce('farm',-215,110+((farms%4)*95),1);

    // ---------------- economy ----------------
    let goldW=workers.filter(w=>w.order&&w.order.type==='gather'&&w.gatherKind==='gold').length;
    for(const w of idleWorkers){
      if(cmds.length>=19)break;
      const kind=goldW<Math.max(3,Math.round(workers.length*0.65))?'gold':'wood';
      const res=st.resources.filter(r=>r.amount>0&&r.kind===kind).sort((a,b)=>dist(w,a)-dist(w,b))[0];
      if(res){push({type:'gather',units:[w.id],target:res.id});if(kind==='gold')goldW++;}
    }

    // ---------------- production ----------------
    if(workers.length<this.opts.workers&&t<this.opts.workerUntil&&th.queue.length<2&&p.gold>=60) push({type:'train',unit:'worker',building:th.id});
    // hero revive
    const deadHero=p.heroes.find(h=>h.dead&&!h.queued&&t>=h.respawnAt);
    if(deadHero&&p.gold>=150+deadHero.level*40) push({type:'revive',hero:deadHero.type});
    const barracks=blds.filter(b=>b.type==='barracks'&&b.complete);
    const reserveFarm=(headroom<=14&&farms<10)?70:0;
    let spearNeed=0;
    if(this.opts.spearRatio>0) spearNeed=Math.floor(army.length*this.opts.spearRatio)-army.filter(u=>u.type==='spearman').length;
    for(const b of barracks){
      if(b.queue.length>=2)continue;
      const unit=spearNeed>0?'spearman':'footman';
      const woodNeed=unit==='spearman'?20:10;
      if(p.gold>=90+reserveFarm&&p.wood>=woodNeed&&p.population+2<=p.popCap){push({type:'train',unit,building:b.id});if(unit==='spearman')spearNeed--;}
    }

    // ---------------- shrine capture ----------------
    // Two recruits are detached to the two unclaimed central shrines.  Each
    // stays until the capture completes (+3 gold and +1 wood per second for
    // the rest of the game), then rejoins the army.
    if(this.opts.nodeCapture){
      if(!this.mem.startIds)this.mem.startIds=new Set(mine.map(u=>u.id));
      const targets=[M(1600,760),M(1600,1240),M(900,1000)];
      const claimed=st.nodes.filter(n=>n.owner===me).length;
      const wanted=Math.min(3,Math.max(0,3-claimed));
      const usedKeys=new Set(Object.values(this.mem.nodeJobs).map(j=>j.key));
      const available=footmen.filter(f=>!this.mem.startIds.has(f.id)&&!this.mem.nodeJobs[f.id]).slice(0,wanted);
      for(const u of available){
        let pick=null;
        for(const x of targets){const key=Math.round(x.x)+','+Math.round(x.y);if(!usedKeys.has(key)){pick={x:x.x,y:x.y,key};break;}}
        if(!pick)break;
        usedKeys.add(pick.key);
        this.mem.nodeJobs[u.id]={key:pick.key,nx:pick.x,ny:pick.y};
      }
      const toRelease=[];
      for(const [id,job] of Object.entries(this.mem.nodeJobs)){
        const u=mine.find(u=>u.id===id);
        if(!u){delete this.mem.nodeJobs[id];continue;}
        const node=st.nodes.find(n=>Math.round(n.x)+','+Math.round(n.y)===job.key);
        if(node&&node.owner===me){toRelease.push(id);continue;}
        if(t>120){toRelease.push(id);continue;}     // give up late, join the ball
        if(reissue('node'+id,2.0)){
          push({type:'move',units:[id],x:Math.round(job.nx),y:Math.round(job.ny)});
          this.mem.at['node'+id]=t;
        }
      }
      for(const id of toRelease)delete this.mem.nodeJobs[id];
    }

    // ---------------- phases ----------------
    const campTarget=M(750,480);
    const camp=(st.camps||[]).find(c=>dist(c,campTarget)<160);
    const campGone=!camp||camp.cleared;
    if(this.mem.phase==='camp'&&(campGone||!this.opts.camp||t>=this.opts.campUntil||(hero&&hero.hp<hero.maxHp*0.35))) this.mem.phase='stage';
    if(this.mem.phase==='stage'){
      const ready=footmen.length>=this.opts.departFootmen||t>=this.opts.departAt;
      const movers=army.filter(u=>!this.mem.nodeJobs[u.id]);
      const gathered=movers.length>0&&movers.filter(u=>dist(u,stage)<520).length>=Math.ceil(movers.length*this.opts.gatherFrac);
      if(ready&&footmen.length>=6&&(gathered||t>=this.opts.departAt+10)) this.mem.phase='march';
    }
    if(this.mem.phase==='march'&&foeTH){
      const front=army.filter(u=>dist(u,foeTH)<800).length;
      const c=avg(army);
      if(front>=Math.max(6,Math.ceil(army.length*0.7))||(c&&dist(c,foeTH)<650)) this.mem.phase='assault';
    }
    if(this.mem.phase==='assault'&&!this.mem.assaultStart)this.mem.assaultStart=t;
    if(this.mem.phase==='assault'&&foeTH){
      const armyAvg=avg(army);
      const enemyHome=foes.filter(e=>dist(e,base)<700);
      if(army.length<=4&&enemyHome.length>=2)this.mem.phase='defend';
    }
    if(this.mem.phase==='defend'){
      const enemyHome=foes.filter(e=>dist(e,base)<900);
      if(!enemyHome.length&&footmen.length>=10)this.mem.phase='stage';
    }

    // ---------------- movement ----------------
    const groupMove=(units,target,type,key)=>{
      if(!units.length)return;
      const last=this.mem.grpTarget[key];
      if(last&&dist(last,target)<45&&this.mem.grpType[key]===type)return;
      if(!reissue(key,this.opts.reissue)&&last)return;
      push({type,units:units.map(u=>u.id),x:Math.round(target.x),y:Math.round(target.y)});
      this.mem.at[key]=t;this.mem.grpTarget[key]={x:target.x,y:target.y};this.mem.grpType[key]=type;
    };
    const campSquad=army.filter(u=>!this.mem.nodeJobs[u.id]);
    if(this.mem.phase==='camp'){
      if(hero&&!hero.casting){
        const near=foes.filter(e=>dist(e,hero)<470);
        if(near.length&&this.skillReady(hero,'n_drain',st)) push({type:'cast',unit:hero.id,skill:'n_drain',target:nearest(near,hero).id});
        else if(this.skillReady(hero,'n_raise',st)&&dist(hero,campTarget)<=260) push({type:'cast',unit:hero.id,skill:'n_raise',x:Math.round(campTarget.x),y:Math.round(campTarget.y)});
      }
      if(campSquad.length)groupMove(campSquad,campTarget,'attackMove','camp');
    }else if(this.mem.phase==='stage'){
      groupMove(campSquad,stage,'move','stage');
    }else if(this.mem.phase==='march'){
      this.marchUnits(campSquad,t,route,foeTH,push,reissue);
    }else if(this.mem.phase==='assault'){
      this.assault(st,{t,hero,army,foes,foeTH,base,push,reissue});
    }else if(this.mem.phase==='defend'){
      const threat=avg(foes.filter(e=>dist(e,base)<900))||base;
      groupMove(army,threat,'attackMove','def');
    }

    // ---------------- hero skills ----------------
    if(hero&&hero.hp>0) this.heroSkills(st,hero,foes,army,push,this.mem.phase,foeTH,base,side,T);

    // ---------------- shield wall ----------------
    if(this.opts.guard&&(this.mem.phase==='assault'||this.mem.phase==='defend')){
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

  marchUnits(units,t,route,foeTH,push,reissue){
    if(!units.length)return;
    const groups=new Map();
    for(const u of units){
      let idx=this.mem.unitWp[u.id];
      if(idx===undefined){
        let bi=0,bd=1e18;
        for(let i=0;i<route.length;i++){const d=dist(u,route[i]);if(d<bd){bd=d;bi=i;}}
        idx=bi;
      }
      // advance past waypoints already reached; never fall back to an earlier one
      while(idx<route.length&&dist(u,route[idx])<600)idx++;
      this.mem.unitWp[u.id]=idx;
      if(!groups.has(idx))groups.set(idx,[]);
      groups.get(idx).push(u);
    }
    for(const [idx,members] of groups){
      let target=idx<route.length?route[idx]:(foeTH?{x:foeTH.x,y:foeTH.y}:route[route.length-1]);
      const sorted=members.slice().sort((a,b)=>dist(a,target)-dist(b,target));
      const lead=avg(sorted.slice(0,Math.min(6,sorted.length)))||avg(members);
      const key='g'+idx;
      const last=this.mem.grpTarget[key];
      if(last&&dist(last,target)<55&&this.mem.grpType[key]==='move')continue;
      if(!reissue(key,2.0)&&last)continue;
      push({type:'move',units:members.map(u=>u.id),x:Math.round(target.x),y:Math.round(target.y)});
      this.mem.at[key]=t;this.mem.grpTarget[key]={x:target.x,y:target.y};this.mem.grpType[key]='move';
    }
  }

  skillReady(u,id,st){
    const cd=(u.cooldowns&&u.cooldowns[id])||0;
    if(cd>st.now)return false;
    const sk=st.catalog&&st.catalog.skills&&st.catalog.skills[id];
    if(sk){if((u.mana||0)<(sk.mana||0))return false;if(u.level<(sk.requiredLevel||1))return false;}
    return true;
  }

  heroSkills(st,hero,foes,army,push,phase,foeTH,base,side,T){
    if(hero.type!=='necromancer'||hero.casting)return;
    const ready=id=>this.skillReady(hero,id,st);
    const near=foes.filter(e=>dist(e,hero)<560);
    const clump=(arr,r)=>{let b=null,bc=0;for(const a of arr){const s=arr.filter(v=>dist(a,v)<r);if(s.length>bc){bc=s.length;b=avg(s);}}return b?{x:b.x,y:b.y,n:bc}:null;};
    const toward=(from,to,d)=>{const L=Math.max(1,dist(from,to));return{x:from.x+(to.x-from.x)/L*d,y:from.y+(to.y-from.y)/L*d};};
    if(ready('n_raise')){
      let a=null;
      if(phase==='assault'&&foeTH)a=toward(hero,foeTH,200);
      else{const n=nearest(near,hero);if(n&&dist(hero,n)<=265)a=toward(hero,n,180);}
      if(a&&dist(hero,a)<=275){push({type:'cast',unit:hero.id,skill:'n_raise',x:Math.round(a.x),y:Math.round(a.y)});return;}
    }
    if(ready('n_plague')){
      if(phase==='assault'&&foeTH){const d=dist(hero,foeTH);if(d<=550&&d>=80){push({type:'cast',unit:hero.id,skill:'n_plague',x:Math.round(foeTH.x),y:Math.round(foeTH.y)});return;}}
      const cl=clump(near.filter(e=>dist(e,hero)<420),150);
      if(cl&&cl.n>=3&&dist(hero,cl)<=550){push({type:'cast',unit:hero.id,skill:'n_plague',x:Math.round(cl.x),y:Math.round(cl.y)});return;}
    }
    const cl2=clump(near.filter(e=>dist(e,hero)<420),160);
    if(ready('n_curse')&&cl2&&cl2.n>=2&&dist(hero,cl2)<=550){push({type:'cast',unit:hero.id,skill:'n_curse',x:Math.round(cl2.x),y:Math.round(cl2.y)});return;}
    if(ready('n_drain')&&near.length){
      const n=nearest(near,hero);if(dist(hero,n)<=550)push({type:'cast',unit:hero.id,skill:'n_drain',target:n.id});
    }
  }

  assault(st,ctx){
    const {t,hero,army,foes,foeTH,base,push,reissue}=ctx;
    if(!foeTH)return;
    const fighters=army.filter(u=>!u.hero);
    const far=fighters.filter(u=>dist(u,foeTH)>1250);
    const near=fighters.filter(u=>dist(u,foeTH)<=1250);
    if(far.length)this.marchUnits(far,t,this.mem.route||[] ,foeTH,push,reissue);
    if(!near.length)return;
    const c=avg(near);
    // target choice: pure hall race unless focusR>0
    let target=foeTH;
    if(this.opts.focusR>0){
      const cands=foes.filter(e=>e.hero&&dist(e,c)<=this.opts.focusR).sort((a,b)=>dist(a,c)-dist(b,c));
      if(cands.length)target=cands[0];
    }
    if(this.opts.raidTime>0&&this.mem.assaultStart&&t<this.mem.assaultStart+this.opts.raidTime){
      const w=nearest(foes.filter(e=>e.type==='worker'&&dist(e,c)<420),c);
      if(w)target=w;
    }
    const tid=target.id;
    const need=near.filter(u=>!(u.order&&u.order.type==='attack'&&u.order.target===tid&&u.attack));
    if(need.length&&(reissue('atk',2.0)||this.mem.atkTarget!==tid)){
      push({type:'attack',units:need.map(u=>u.id),target:tid});
      this.mem.at['atk']=t;this.mem.atkTarget=tid;
    }
    // hero: stay behind the ball on our side of the hall
    if(hero&&hero.hp>0){
      const back=hero.hp<hero.maxHp*0.5?620:400;
      const dir={x:base.x-foeTH.x,y:base.y-foeTH.y};const L=Math.hypot(dir.x,dir.y)||1;
      const want={x:Math.max(60,Math.min(3140,foeTH.x+dir.x/L*back)),y:Math.max(60,Math.min(1940,foeTH.y+dir.y/L*back))};
      if((!this.mem.heroPos||dist(this.mem.heroPos,want)>140||reissue('heroPos',2.5))&&dist(hero,want)>90){
        push({type:'move',units:[hero.id],x:Math.round(want.x),y:Math.round(want.y)});
        this.mem.at['heroPos']=t;this.mem.heroPos=want;
      }
    }
  }
}
module.exports={Agent};

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
