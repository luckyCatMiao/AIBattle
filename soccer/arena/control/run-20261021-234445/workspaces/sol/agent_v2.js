'use strict';
const sim = require('./simulation');
const readline = require('readline');
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const dirs = {N:[0,0],U:[0,-1],D:[0,1],L:[-1,0],R:[1,0],UL:[-Math.SQRT1_2,-Math.SQRT1_2],UR:[Math.SQRT1_2,-Math.SQRT1_2],DL:[-Math.SQRT1_2,Math.SQRT1_2],DR:[Math.SQRT1_2,Math.SQRT1_2]};
const angle=(x,y)=>(Math.atan2(y,x)*180/Math.PI+360)%360;
function local(u,t) {return {x:t?44-u.x:u.x,y:u.y};}
function forbidden(t,x,y,margin=0) {return t===0?x>=34-margin&&y>=6-margin&&y<=20+margin:x<=10+margin&&y>=6-margin&&y<=20+margin;}
function move(u,target,t,carrying,all) {
  const speed=.1575*(carrying?.58:1);
  let best='N', value=Infinity;
  for(const [name,[dx,dy]] of Object.entries(dirs)) {
    const x=u.x+dx*speed,y=u.y+dy*speed;
    if(forbidden(t,x,y,.23)||x<1.36||x>42.64||y<1.36||y>24.64) continue;
    let v=Math.hypot(x-target.x,y-target.y);
    for(const v2 of all) if(v2.id!==u.id&&v2.team===t) {
      const d=Math.hypot(x-v2.x,y-v2.y);
      if(d<.8) v+=(.8-d)*.20;
    }
    if(v<value) {value=v;best=name;}
  }
  return best;
}
function ballPath(g,frames=100) {
  let {x,y,vx,vy}=g.ball; const out=[];
  for(let f=0;f<frames;f++) {
    x+=vx*.05;y+=vy*.05;
    if(y<1.23){y=2.46-y;vy=-vy*.72;}if(y>24.77){y=49.54-y;vy=-vy*.72;}
    if(x<1.23||x>42.77) {
      if(y>=10.5&&y<=15.5) {out.push({x,y,t:(f+1)*.05});break;}
      if(x<1.23)x=2.46-x;else x=85.54-x;
      vx=-vx*.72;
    }
    vx*=.978;vy*=.978;out.push({x,y,t:(f+1)*.05});
  }return out;
}
function intercept(u,path,t) {
  for(const p of path) if(!forbidden(t,p.x,p.y,.3)&&dist(u,p)<3.15*p.t+(u.index===0&&((t===0&&p.x<=10)||(t===1&&p.x>=34))?1.18:.65)) return p;
  return path.filter(p=>!forbidden(t,p.x,p.y,.35)).slice(-1)[0]||{x:t===0?33.5:10.5,y:clamp(path[0].y,6,20),t:10};
}
function shot(u,team,enemies) {
  const p=local(u,team);let best=null;
  if(p.x<20)return null;
  for(let gy=10.65;gy<=15.36;gy+=.235) {
    const dx=43.08-p.x,dy=gy-p.y, len=Math.hypot(dx,dy);
    if(len>24.0)continue;
    const ax=dx/len,ay=dy/len; let x=p.x+ax*.59,y=p.y+ay*.59,v=11, clearance=8,elapsed=0;
    let reached=false;
    for(let f=0;f<160;f++) {
      x+=ax*v*.05;y+=ay*v*.05;v*=.978;elapsed+=.05;
      if(x>=43){reached=true;break;}
      for(const e of enemies) {
        if(e.controlLock>f+1)continue;
        const ep=local(e,team);
        const radius=e.index===0&&ep.x>=34&&ep.y>=6&&ep.y<=20&&x>=34&&v>=4.5?1.35:.82;
        // Opponents react within this one-second simultaneous window, not omnisciently.
        const reach=3.15*Math.max(0,elapsed-.40);
        const d=Math.hypot(x-ep.x,y-ep.y)-radius-reach;
        clearance=Math.min(clearance,d);
      }
    }
    if(!reached)continue;
    let score=clearance-.015*len;
    if(!best||score>best.score)best={score,clearance,aim:angle((team?-1:1)*ax,ay),len};
  }return best;
}
function policy(g,team,mode='main') {
  const own=g.units.filter(u=>u.team===team), enemy=g.units.filter(u=>u.team!==team), n=own.length;
  const b=g.ball, owner=g.units.find(u=>u.id===b.owner), friendly=owner&&owner.team===team;
  const lb=local(b,team), path=owner?null:ballPath(g,85);
  let field=own.filter(u=>n===1||u.index!==0);
  const targets=new Map();
  const estimates=field.map(u=>{
    const target=owner?{x:b.x,y:b.y,t:dist(u,b)/3.15}:intercept(u,path,team);
    return {u,target,cost:target.t+dist(u,target)*.015};
  }).sort((a,b)=>a.cost-b.cost);
  const chaser=estimates.length?estimates[0].u:null;
  for(const a of estimates)targets.set(a.u.id,a.target);
  const out=[];
  for(const u of own) {
    const p=local(u,team);let target={x:u.x,y:u.y}, aim=team?180:0,kick=false;
    const nearest=enemy.reduce((a,e)=>!a||dist(e,u)<dist(a,u)?e:a,null);
    const pressure=dist(u,nearest);
    const isOwner=b.owner===u.id;
    if(isOwner) {
      const s=shot(u,team,enemy);
      if(s&&(s.clearance>.05||(p.x>30.5&&pressure<3.0)||(p.x>32.5))) {aim=s.aim;kick=true;}
      let y=clamp(p.y,8,18);
      if(p.x>28) {
        // Work across the front of the box toward the side furthest from the keeper.
        const ek=local(enemy[0],team);
        y=ek.y>13?10.7:15.3;
      }
      let tx=Math.min(33.45,p.x+5);
      if(p.x>33.1)tx=33.45;
      target={x:team?44-tx:tx,y};
      if(!kick) {
        // Prefer a progressive pass when a teammate is open and ahead.
        let pass=null;
        for(const v of own) if(v.id!==u.id) {
          const vp=local(v,team),d=dist(v,u);
          if(vp.x<p.x+2.3||d<3||d>17)continue;
          let safe=Infinity;
          for(const e of enemy) {
            const vx=v.x-u.x,vy=v.y-u.y,ex=e.x-u.x,ey=e.y-u.y;
            const q=clamp((ex*vx+ey*vy)/(d*d),0,1);
            const travel=-Math.log(Math.max(.1,1-d*q/25))/.445;
            safe=Math.min(safe,Math.hypot(ex-q*vx,ey-q*vy)-.85-2.4*Math.max(0,travel-.35));
          }
          const val=(vp.x-p.x)*.35+safe;
          if(safe>.45&&(!pass||val>pass.val))pass={v,val};
        }
        if(pass&&(pressure<4||p.x<23)) {aim=angle(pass.v.x-u.x,pass.v.y-u.y);kick=true;}
        else if(pressure<1.8) {
          // Face away from the tackler while continuing to run forward.
          aim=angle(u.x-nearest.x,u.y-nearest.y);
          if(pressure<1.0&&p.x<29) {
            const ty=clamp(u.y+(u.y<nearest.y?-5:5),2,24);
            aim=angle((team?-1:1)*7,ty-u.y);kick=true;
          }
        } else aim=angle(target.x-u.x,target.y-u.y);
      }
    } else if(u.index===0&&n>1) {
      let gx=6.2,gy=13;
      if(lb.x<20) {gx=clamp(lb.x-4,2.0,8.2);gy=clamp(13+(lb.y-13)*(gx-1)/Math.max(1,lb.x-1),10.2,15.8);}
      target={x:team?44-gx:gx,y:gy};
      if(!owner) {
        const ip=intercept(u,path,team),lip=local(ip,team);
        if(lip.x<10&&ip.t<2.5)target=ip;
        else if(lb.x<10&&Math.hypot(b.vx,b.vy)<2)target={x:b.x,y:b.y};
      } else if(!friendly&&lb.x<10)target={x:b.x,y:b.y};
      aim=angle((team?-1:1)*35,13-u.y);kick=true;
    } else if(u===chaser&&!friendly) {
      target=targets.get(u.id);
      if(owner) {
        // Aim for the ball, not the opposing player's center.
        target={x:b.x,y:b.y};
      }
      const s=shot(u,team,enemy);if(s){aim=s.aim;kick=s.clearance>-.3||p.x>30;}
    } else {
      let rank=field.filter(v=>v.id!==owner?.id).findIndex(v=>v.id===u.id);
      if(friendly) {
        const op=local(owner,team);
        let tx=clamp(op.x+5,16,32.7);
        let ty=clamp(op.y+(rank%2===0?-1:1)*(4+Math.floor(rank/2)*2),3,23);
        if(n>=4&&rank===field.length-1) {tx=clamp(op.x-6,12,25);ty=13;}
        target={x:team?44-tx:tx,y:ty};
      } else if(n>=3&&u===estimates[1]?.u&&lb.x<29) {
        if(owner) {
          const op=local(owner,team);const tx=clamp(op.x-2,5,32);
          target={x:team?44-tx:tx,y:clamp(op.y,3,23)};
        }else target=targets.get(u.id);
      } else {
        const tx=clamp(lb.x-5-(rank%2)*3,9,28);
        const ty=clamp(lb.y+(rank%2===0?-4:4),5,21);
        target={x:team?44-tx:tx,y:ty};
      }
      const s=shot(u,team,enemy);if(s){aim=s.aim;kick=s.clearance>-.2||p.x>30.5;}
    }
    // Route around the forbidden rectangle rather than cutting its corner.
    let lt=local(target,team);
    if(lt.x>33.5&&lt.y>=5.7&&lt.y<=20.3)lt.x=33.5;
    if(p.x>33.5&&((p.y<6&&lt.y>5.6)||(p.y>20&&lt.y<20.4)))lt={x:33.4,y:p.y};
    target={x:team?44-lt.x:lt.x,y:lt.y};
    const dir=move(u,target,team,isOwner,g.units);
    out.push({dir,aim,kick});
  }
  return out;
}
function fromObservation(o) {
  const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:o.seed,teamSize:o.teamSize});
  g.frame=o.frame;g.tick=o.tick||o.frame;g.half=o.half;g.score=[...o.score];g.golden=o.golden;g.goldenEnd=o.frame+Math.round((o.goldenLeft||20)*20);g.freeze=Math.round((o.freeze||0)*20);
  g.ball={...o.ball};
  for(const e of (o.events||[])) {
    if(e.type==='goal')g.kickoffTeam=1-e.team;
    else if(e.type==='half')g.kickoffTeam=1-g.kickoffTeam;
  }
  for(const u of g.units) {
    const v=o.units.find(v=>v.id===u.id);Object.assign(u,v);
    u.kickCd=Math.round(v.kickCd*20);u.controlLock=Math.round(v.controlLock*20);u.stealLock=0;u.foulLock=0;
    for(const e of (o.events||[])) {
      const age=o.frame-e.frame;
      if(e.type==='foul'&&e.unit===u.id&&age<20)u.foulLock=Math.max(0,20-age);
      if(e.type==='foul'&&e.unit===u.id&&age<20)u.stealLock=Math.max(u.stealLock,20-age);
      if(e.type==='tackle'&&e.from===u.id&&age<4)u.stealLock=Math.max(u.stealLock,4-age);
    }
  }
  return g;
}
function decide(o) {
  const g=fromObservation(o),team=o.yourTeam,inputs=[];
  for(let f=0;f<20;f++) {
    const ours=policy(g,team),theirs=policy(g,1-team);
    inputs.push(ours);
    for(const u of g.units)u.held=(u.team===team?ours:theirs)[u.index];
    sim.step(g);
  }
  return {inputs};
}
if(require.main===module)readline.createInterface({input:process.stdin}).on('line',line=>{
  try {const o=JSON.parse(line);console.log(JSON.stringify(decide(o)));}
  catch(e){console.error(e.stack);process.exitCode=1;}
});
module.exports={decide,policy,fromObservation,shot};
