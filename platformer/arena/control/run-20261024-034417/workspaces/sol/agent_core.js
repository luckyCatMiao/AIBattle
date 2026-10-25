'use strict';
const sim = require('./simulation');
const readline = require('readline');

function buildState(o) {
  const l = sim.generateLevel(o.seed * 131 + o.round * 977);
  const g = {
    id: o.id, seed: o.seed, status: 'playing', phase: 'race', frame: o.frame,
    time: o.time || 0, round: o.round, roundLeft: o.roundLeft, freezeLeft: 0,
    w: o.level.width, h: o.level.height, tiles: o.level.tiles,
    goalX: o.level.goalX, startX: o.level.startX,
    platforms: l.platforms, plants: l.plants, saws: l.saws,
    platformRects: o.platforms.map(p => ({...p, top:p.y+p.h})),
    plantStates: o.plants.map(p => ({height:p.height})), sawStates:o.saws,
    crumbleTimers: new Map(o.crumbling.map(c => [c.y*o.level.width+c.x, .55-c.left])),
    gone: new Map(o.gone.map(c => [c.y*o.level.width+c.x,c.left])),
    runners: o.runners.map(p => ({...p, prevX:p.x, held:{move:0,jump:false}})),
    monsters: o.monsters.map(m => ({...m, alive:true})), monsterTimer:999,
    events:[], eventId:0, wins:[...o.wins], players:o.players.map(p=>({...p})), rng:()=>.5,
  };
  return g;
}
function clone(g) {
  return {...g, runners:g.runners.map(p=>({...p})), monsters:g.monsters.map(m=>({...m})),
    crumbleTimers:new Map(g.crumbleTimers), gone:new Map(g.gone), events:[],
    wins:[...g.wins], players:g.players.map(p=>({...p}))};
}
function enemyInput(g, me, mode) {
  const p=g.runners[1-me];
  if(mode==='still') return {move:0,jump:false};
  const foot=p.y;
  const wall=sim.solidWorld(g,p.x+.85,foot+.4);
  const gap=!sim.solidWorld(g,p.x+1.15,foot-.25);
  const danger=g.monsters.some(m=>Math.abs(m.x-p.x)<2.3) || g.sawStates.some(s=>Math.abs(s.x-p.x)<2.5);
  return {move:1,jump:p.onGround&&(wall||gap||danger)};
}
function rank(g, me, startX) {
  const p=g.runners[me];
  let s=p.x-startX + .065*p.vx + .13*Math.min(2.5,p.y-3);
  if(p.y<2.6) s-= (2.6-p.y)*3;
  // Prefer stable landings; do not sacrifice distance simply to stay airborne.
  if(p.onGround) s+=.12;
  if(p.vy<0 && p.y<3.3 && !sim.solidWorld(g,p.x+.35,2.7)) s-=.7;
  return s;
}
function clearance(g, me) {
  const p=g.runners[me], pad=.035;
  for(let x=Math.floor(p.x-.32-pad);x<=Math.floor(p.x+.32+pad);x++) {
    for(let y=Math.floor(p.y+.02-pad);y<=Math.floor(p.y+1.27);y++) {
      if(g.tiles[(g.h-1-y)*g.w+x]===3) return false;
    }
  }
  for(let i=0;i<g.plants.length;i++) {
    const h=g.plantStates[i].height, pl=g.plants[i];
    if(h>=.25 && Math.abs(p.x-pl.x)<.71+pad && p.y<pl.y+h+pad && p.y+1.35>pl.y) return false;
  }
  for(const m of g.monsters) {
    if(Math.abs(p.x-m.x)<.72+pad && p.y<m.y+.62+pad && p.y+1.35>m.y) return false;
  }
  for(const s of g.sawStates) {
    const dx=Math.max(0,Math.abs(s.x-p.x)-.36),dy=Math.max(0,p.y-s.y,s.y-p.y-1.35);
    if(Math.hypot(dx,dy)<.53+pad) return false;
  }
  return true;
}
function imminentSpike(g, me) {
  const p=g.runners[me];
  if(!p.onGround || p.vy!==0) return false;
  const lo=Math.floor(p.x+.2), hi=Math.floor(p.x+4.8);
  for(let x=lo;x<=hi;x++) {
    for(let wy=Math.max(0,Math.floor(p.y-.15));wy<=Math.floor(p.y+.35);wy++) {
      const ty=g.h-1-wy;
      if(x>=0 && x<g.w && ty>=0 && ty<g.h && g.tiles[ty*g.w+x]===3) return true;
    }
  }
  return false;
}
function emergencyActions(g, me) {
  if(!imminentSpike(g, me)) return null;
  // A spike is non-solid, so the ordinary collision search can prefer
  // braking beside it.  Commit to one jump before reconsidering the route.
  return [{move:1,jump:true},{move:1,jump:false},{move:1,jump:false},
    {move:1,jump:false},{move:1,jump:false}];
}
function robustWindow(root, me, path) {
  for(const mode of ['still','jump','run','brakeJump','reverse']) {
    const g=clone(root), deaths=g.runners[me].deaths;
    for(let k=0;k<10;k++) {
      g.runners[me].held=ACTIONS[path[k]===undefined?0:path[k]];
      g.runners[1-me].held=mode==='jump'?{move:1,jump:true}:
        mode==='brakeJump'?{move:k<2?0:1,jump:k>=2}:
        mode==='reverse'?{move:-1,jump:false}:enemyInput(g,me,mode);
      sim.step(g);
      if(g.runners[me].deaths!==deaths || !clearance(g,me)) return false;
      if(g.round!==root.round || g.status!=='playing') break;
    }
  }
  return true;
}
const ACTIONS=[{move:1,jump:false},{move:1,jump:true},{move:0,jump:false},
  {move:0,jump:true},{move:-1,jump:false},{move:-1,jump:true}];
const memories = new Map();
function stalledFor(o) {
  const key=[o.id,o.seed,o.round,o.yourPlayer].join(':');
  const p=o.runners[o.yourPlayer];
  let m=memories.get(key);
  if(!m || o.frame<m.frame) m={best:p.maxX,progress:o.time||0,frame:o.frame};
  if(p.maxX>m.best+.25) {m.best=p.maxX;m.progress=o.time||0;}
  m.frame=o.frame;memories.set(key,m);
  if(memories.size>100) memories.delete(memories.keys().next().value);
  return (o.time||0)-m.progress;
}
// A late record attempt is useful only when safe waiting would lose on maxX.
// Death does not erase the record, but an early death still wastes a full run.
function recordPlan(root, me, seconds) {
  const start=root.runners[me], depth=Math.min(50,Math.max(1,Math.floor(seconds*20)));
  root=clone(root);root.roundLeft=999;
  let beam=[{g:root,path:[],score:-Infinity}], best=null;
  for(let d=0;d<depth;d++) {
    const next=[];
    for(const n of beam) for(let a=0;a<ACTIONS.length;a++) {
      if(!n.g.runners[me].onGround && ACTIONS[a].jump) continue;
      const g=clone(n.g),path=n.path.concat(a);
      g.runners[me].held=ACTIONS[a];
      g.runners[1-me].held=enemyInput(g,me,'run');sim.step(g);
      const p=g.runners[me], dead=p.deaths!==start.deaths;
      const record=p.maxX-start.maxX;
      const score=record*100 + (dead?-1:0) + (dead?0:.01*(p.x-start.x)) - .0001*d;
      const node={g,path,score};
      if(!best || score>best.score) best=node;
      if(!dead && g.round===root.round && g.status==='playing') next.push(node);
    }
    if(!next.length) break;
    next.sort((a,b)=>b.score-a.score);
    const seen=new Set();beam=[];
    for(const n of next) {
      const p=n.g.runners[me];
      const key=[Math.round(p.x*10),Math.round(p.y*10),Math.round(p.vx),Math.round(p.vy/2),Math.round(p.maxX*10)].join(',');
      if(seen.has(key)) continue;seen.add(key);beam.push(n);
      if(beam.length>=150) break;
    }
  }
  if(!best || best.g.runners[me].maxX<start.maxX+.3) return null;
  const out=best.path.slice(0,5).map(i=>ACTIONS[i]);
  while(out.length<5) out.push({move:0,jump:false});
  return out;
}
function plan(o, opts={}) {
  if(o.phase!=='race') return Array.from({length:5},()=>({move:1,jump:false}));
  const me=o.yourPlayer, root=opts.state?clone(opts.state):buildState(o), start=root.runners[me];
  const stall=stalledFor(o), other=root.runners[1-me];
  // Once the historical record already leads by the adjudication margin,
  // keep the normal planner in charge rather than repeatedly attacking a
  // hazard while protecting a time-out result.
  const emergency=(!opts.noRecord && start.maxX<=other.maxX+.5) ? emergencyActions(root,me) : null;
  if(emergency) return emergency;
  if(!opts.noRecord && start.maxX<other.maxX+.5 &&
     (o.roundLeft<6 || (stall>8 && o.roundLeft<start.x/6.8+12))) {
    const attempt=recordPlan(root,me,o.roundLeft);
    if(attempt) return attempt;
  }
  const width=opts.width||150, depth=opts.depth||(stall>3?60:45);
  // Planning must not confuse an imminent timeout with a physical collision.
  root.roundLeft=999;
  let beam=[{g:root,path:[],score:0}], chosen=beam[0];
  for(let d=0;d<depth;d++) {
    let next=[];
    for(const n of beam) {
      const p=n.g.runners[me];
      for(let a=0;a<ACTIONS.length;a++) {
        if(!p.onGround && ACTIONS[a].jump) continue;
        const g=clone(n.g), path=n.path.slice();
        let safe=true;
        for(let k=0;k<1;k++) {
          g.runners[me].held=ACTIONS[a];
          g.runners[1-me].held=enemyInput(g,me,opts.enemy||'run');
          sim.step(g); path.push(a);
          if(g.runners[me].deaths!==start.deaths || g.round!==o.round || g.status!=='playing') {
            if(g.runners[me].finished || (g.wins[me]>o.wins[me])) {
              return path.slice(0,5).map(i=>ACTIONS[i]).concat(Array(5).fill(ACTIONS[0])).slice(0,5);
            }
            safe=false; break;
          }
          if(g.runners[me].y<.6 || !clearance(g,me)) {safe=false;break;}
        }
        if(!safe) continue;
        const score=rank(g,me,start.x) - path.reduce((s,i)=>s+(ACTIONS[i].move<0?.001:0),0);
        next.push({g,path,score});
      }
    }
    if(!next.length) break;
    next.sort((a,b)=>b.score-a.score);
    const seen=new Set(); beam=[];
    for(const n of next) {
      const p=n.g.runners[me];
      const key=[Math.round(p.x*5),Math.round(p.y*5),Math.round(p.vx/2),Math.round(p.vy/3),p.onGround?1:0].join(',');
      if(seen.has(key)) continue;
      seen.add(key); beam.push(n);
      if(beam.length>=width) break;
    }
    chosen=beam[0];
  }
  if(beam.length && Math.abs(root.runners[0].x-root.runners[1].x)<4) {
    chosen=beam.find(n=>robustWindow(root,me,n.path))||chosen;
  }
  const out=chosen.path.slice(0,5).map(i=>ACTIONS[i]);
  while(out.length<5) out.push({move:0,jump:true});
  return out;
}
module.exports={plan,buildState,clone};
if(require.main===module) {
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',line=> {
    try { const o=JSON.parse(line); console.log(JSON.stringify({inputs:plan(o).map(a=>[a])})); }
    catch(e) { console.error(e.stack); console.log(JSON.stringify({inputs:Array(5).fill([{move:0,jump:true}])})); }
  });
}
