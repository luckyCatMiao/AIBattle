'use strict';
// Replay opponent: replays sol's recorded command stream from a public replay
// against a live agent, remapping recorded unit IDs onto live units.
const R=require('../rules.js');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function buildGhost(replay, solSeat){
  // index decisions by tick
  const byTick=new Map();
  for(const d of replay.decisions) byTick.set(d.tick,d);
  const other=1-solSeat;
  return function(obs){
    // obs is a snapshot with yourPlayer = other? We need sol's POV state: find live sol units.
    const tick=obs.tick;
    const rec=byTick.get(tick);
    if(!rec) return [];
    const cmdsRec=rec.commands[solSeat]||[];
    if(!cmdsRec.length) return [];
    // live units
    const liveSol=obs.units.filter(u=>u.owner===solSeat&&u.hp>0);
    const liveFoe=obs.units.filter(u=>u.owner!==solSeat&&u.hp>0);
    const liveBase=obs.bases.find(b=>b.owner===solSeat);
    const liveEbase=obs.bases.find(b=>b.owner!==solSeat);
    // recorded frame at this tick to know sol's recorded roster
    const rf=replay.frames.find(f=>f.tick===tick);
    if(!rf) return [];
    const recSol=rf.units.filter(u=>u.owner===solSeat&&u.hp>0);
    const recFoe=rf.units.filter(u=>u.owner!==solSeat&&u.hp>0);
    // map recorded sol unit id -> live unit, per type, k-th in sorted order
    const map={};
    const byType=(arr)=>arr.slice().sort((a,b)=>a.id<b.id?-1:1);
    for(const ty of ['worker','rifle','tank','raider']){
      const a=byType(recSol.filter(u=>u.type===ty));
      const b=byType(liveSol.filter(u=>u.type===ty));
      for(let i=0;i<Math.min(a.length,b.length);i++)map[a[i].id]=b[i];
    }
    const mapTarget=(recTarget, recActorId)=>{
      if(recTarget===rf.bases[solSeat]?.id) return liveBase?liveBase.id:null;
      if(recTarget===rf.bases[other]?.id) return liveEbase?liveEbase.id:null;
      const rt=recFoe.find(u=>u.id===recTarget);
      const actor=map[recActorId];
      if(!rt) return null;
      // nearest live foe of same type to the actor (fallback nearest any)
      const pool=liveFoe.filter(u=>u.type===rt.type);
      const cand=(pool.length?pool:liveFoe).slice().sort((a,b)=>{
        if(!actor)return 0;
        return dist(a,{x:rt.x,y:rt.y})+(a.type===rt.type?0:1e6)-(dist(b,{x:rt.x,y:rt.y})+(b.type===rt.type?0:1e6));
      });
      if(!cand.length) return null;
      return cand[0].id;
    };
    const out=[];
    for(const c of cmdsRec){
      if(c.type==='train'||c.type==='upgrade'||c.type==='repair'){out.push({type:c.type,unit:c.unit});continue;}
      if(c.type==='rally'){out.push({type:'rally',x:c.x,y:c.y});continue;}
      if(!c.units) continue;
      const ids=c.units.map(id=>map[id]).filter(Boolean).map(u=>u.id);
      if(!ids.length) continue;
      if(c.type==='attack'){
        const tid=mapTarget(c.target, c.units[0]);
        if(tid)out.push({type:'attack',units:ids,target:tid});
        continue;
      }
      if(c.type==='gather'){
        // map target mine by id
        const tm=obs.mines.find(m=>m.id===c.target&&m.ore>0)||obs.mines.find(m=>m.ore>0);
        if(tm)out.push({type:'gather',units:ids,target:tm.id});
        continue;
      }
      if(c.type==='move'||c.type==='attackMove'){out.push({type:c.type,units:ids,x:c.x,y:c.y});continue;}
      if(c.type==='stop'){out.push({type:'stop',units:ids});continue;}
    }
    return out;
  };
}

function runVsGhost(policy, replay, agentSeat, opts={}){
  const R=require('../rules.js');
  const solSeat=1-agentSeat;
  const m=R.createMatch({id:'ghost',players:[{name:'a'},{name:'b'}],seed:1});
  R.command(m,0,{type:'start'});
  const ghost=buildGhost(replay,solSeat);
  const maxT=opts.maxT||600;
  const log=[];
  while(m.status==='playing'&&m.now<maxT){
    const snaps=opts.order==='rev'?[R.snapshot(m,0),R.snapshot(m,1)]:[R.snapshot(m,0),R.snapshot(m,1)];
    const mine=policy(snaps[agentSeat])||[];
    const g=ghost({...R.snapshot(m,solSeat),tick:m.tick,units:m.units,bases:m.bases,mines:m.mines})||[];
    const cmds=agentSeat===0?[mine,g]:[g,mine];
    for(let p=0;p<2;p++)for(const c of cmds[p].slice(0,10)){try{R.command(m,p,c);}catch(e){}}
    for(let k=0;k<20;k++)R.step(m);
    log.push({t:m.now,bases:m.bases.map(b=>b.hp),cr:m.players.map(p=>p.credits),units:m.units.map(u=>({o:u.owner,ty:u.type,hp:u.hp}))});
    if(!m.units.some(u=>u.hp>0)&&m.status==='playing'){/*keep*/}
  }
  return {winner:m.winner,reason:m.reason,duration:m.now,scores:m.players.map(p=>R.score(m,p)),log};
}
module.exports={buildGhost,runVsGhost};
