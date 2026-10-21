const skillKeys = { KeyQ: 'vortex', KeyE: 'pierce', KeyU: 'orbit', KeyO: 'verdict' };
const skillDefs = {
  vortex: { name: '缚星磁涡', key: 'Q', cd: 4.8, dur: .48, cancel: .32, color: '#8ce8e4', hint: '环形聚敌 · 接连斩' },
  pierce: { name: '裂轨一闪', key: 'E', cd: 3.8, dur: .56, cancel: .40, color: '#c8f6dd', hint: '无敌穿阵 · 延迟断臂' },
  orbit: { name: '双月回轮', key: 'U', cd: 5.5, dur: .42, cancel: .27, color: '#f3c788', hint: '双刃往返 · 自由追击' },
  verdict: { name: '天炉裁决', key: 'O', cd: 7.5, dur: .87, cancel: .68, color: '#ffa66d', hint: '跃升重铸 · 广域断腿' }
};
let skillFX = [], skillObjects = [], skillBannerTime = 0;
const skillDamage = {
  vortex: { damage: 24, force: 40, limb: 9, launch: -200, stop: .06, power: .8, color: '#98eeeb', shake: 2.4 },
  pierce: { damage: 19, force: 70, limb: 7, launch: -160, stop: .032, power: .65, color: '#d6ffe8', shake: 1.8 },
  rupture: { damage: 48, force: 400, limb: 60, launch: -245, stop: .105, power: 1.25, color: '#d4ffdf', shake: 5 },
  moon: { damage: 13, force: 70, limb: 8, stop: .025, power: .55, color: '#ffda98', shake: 1.1 },
  verdict: { damage: 76, force: 480, limb: 85, part: 'leg', stop: .13, power: 1.5, color: '#ffc48b', shake: 7 }
};
function resetSkills() {
  skillFX = []; skillObjects = []; skillBannerTime = 0;
  $('skillBanner').classList.remove('show');
}
function skillEffect(kind, x, y, life, extra = {}) {
  skillFX.push({ kind, x, y, life, max: life, ...extra });
}
function beginSkill(name) {
  const p = player, def = skillDefs[name];
  if (p.skillCD[name] > 0) { toast(def.name + ' · 冷却 ' + p.skillCD[name].toFixed(1) + ' 秒'); return false; }
  if (p.dead || p.hurtT > .12) return false;
  const move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (move) p.dir = move;
  else if (name === 'pierce') { const e = nearestFront(520); if (e) p.dir = sign(e.x-p.x,p.dir); }
  p.skill = { name, t: 0, phase: 0, fired: false, originX: p.x, originY: p.y, dir: p.dir, hit: new Set() };
  p.skillCD[name] = def.cd; p.skillUses[name]++; p.action = 'skill'; p.attack = null; p.charge = 0; p.chargeReady = false;
  p.vx *= .15; p.vy = 0; input.attack = null;
  if (name === 'pierce') p.invuln = Math.max(p.invuln,.39);
  if (name === 'verdict') p.invuln = Math.max(p.invuln,.66);
  if (name === 'vortex') p.invuln = Math.max(p.invuln,.25);
  $('skillBannerName').textContent = def.name; $('skillBannerHint').textContent = def.hint;
  $('skillBanner').style.setProperty('--skill-color',def.color); $('skillBanner').classList.add('show'); skillBannerTime = 1.15;
  audio.play(name + 'Cast');
  return true;
}
function skillHit(e, type, dir) {
  damageEnemy(e,skillDamage[type],1,{dir});
}
function fireVortex(s) {
  const p = player, x = p.x, y = p.y-52;
  skillObjects.push({ kind: 'vortex', x, y, t: 0, dur: .65, hit: new Set() });
  skillEffect('vortex',x,y,.72,{dir:s.dir}); audio.play('vortexHit');
}
function fireMoons(s) {
  const p = player;
  for (const side of [-1,1]) skillObjects.push({kind:'moon',x:p.x,y:p.y-57,originX:p.x,originY:p.y-57,dir:side,t:0,dur:1.08,phase:0,hit:new Set()});
  audio.play('orbitHit');
}
function fireVerdict(s) {
  const p = player;
  p.y=FLOOR;p.vy=0;p.onGround=true;p.landT=.2;p.vx=0;
  const x=p.x+p.dir*36;
  skillEffect('verdict',x,FLOOR,.75,{dir:p.dir});
  skillEffect('ring',x,FLOOR-4,.6,{radius:300,color:'#ffc18a'});
  puff(x,FLOOR,35,'#c0b58e',340); audio.play('verdictHit');
  // The hammer's footprint is an actual combat area, not a screen-wide damage event.
  for(const e of enemies) if(!e.dead&&e.state!=='spawn'&&Math.abs(e.x-x)<295&&e.y>FLOOR-310) skillHit(e,'verdict',sign(e.x-x,p.dir));
}
function updateSkillAction(dt) {
  const p=player,s=p.skill;if(!s){p.action='idle';return;}
  const previous=s.t;s.t+=dt;p.t=s.t;p.vx=0;
  if(s.name==='vortex') {
    p.vy=0;
    if(s.t>=.13&&!s.fired){s.fired=true;fireVortex(s);}
  } else if(s.name==='pierce') {
    p.vy=0;
    if(s.t>=.105&&s.t<.31) {
      const old=p.x;p.x=clamp(p.x+s.dir*2060*dt,55,WORLD-55);
      if(Math.floor(previous/.028)!==Math.floor(s.t/.028)) ghosts.push({x:p.x,y:p.y,dir:s.dir,pose:skillPose(s),life:.3,max:.3});
      if(!s.fired){s.fired=true;skillEffect('rail',s.originX,p.y-55,.52,{endX:clamp(s.originX+s.dir*420,55,WORLD-55),dir:s.dir});audio.play('pierceHit');}
      for(const e of enemies) if(!e.dead&&e.state!=='spawn'&&!s.hit.has(e.id)&&e.x>Math.min(old,p.x)-58&&e.x<Math.max(old,p.x)+58&&Math.abs(e.y-p.y)<145) {
        s.hit.add(e.id);skillHit(e,'pierce',s.dir);
        skillObjects.push({kind:'rupture',enemy:e,dir:s.dir,t:0,dur:.23});
        skillEffect('mark',e.x,e.y-56,.28,{enemy:e,dir:s.dir});
      }
    }
  } else if(s.name==='orbit') {
    p.vy=0;
    if(s.t>=.12&&!s.fired){s.fired=true;fireMoons(s);}
  } else if(s.name==='verdict') {
    const peak=clamp(s.originY-195,240,345);
    if(s.t<.16){p.y=s.originY;p.vy=0;}
    else if(s.t<.43){p.y=lerp(s.originY,peak,ease((s.t-.16)/.27));p.vy=0;p.onGround=false;}
    else if(s.t<.59){p.y=lerp(peak,FLOOR,Math.pow((s.t-.43)/.16,2));p.vy=0;}
    else if(!s.fired){s.fired=true;fireVerdict(s);}
  }
  if(s.t>=skillDefs[s.name].dur){p.action='idle';p.skill=null;}
}
function updateSkillWorld(dt) {
  for(const name in player.skillCD) player.skillCD[name]=Math.max(0,player.skillCD[name]-dt);
  if(skillBannerTime>0){skillBannerTime-=dt;if(skillBannerTime<=0)$('skillBanner').classList.remove('show');}
  for(const fx of skillFX) fx.life-=dt;
  skillFX=skillFX.filter(f=>f.life>0);
  if(player.dead) return;
  for(const o of skillObjects) {
    o.t+=dt;
    if(o.kind==='vortex') {
      for(const e of enemies) if(!e.dead&&e.state!=='spawn'&&Math.abs(e.x-o.x)<365&&Math.abs(e.y-55-o.y)<200) {
        if(!o.hit.has(e.id)){o.hit.add(e.id);skillHit(e,'vortex',sign(o.x-e.x));}
        const target=o.x+sign(e.x-o.x)*62;
        e.x=lerp(e.x,target,1-Math.exp(-dt*7.5));e.vx=0;e.stun=Math.max(e.stun,.18);e.state='stun';
        if(e.y>o.y+70)e.vy=Math.min(e.vy,-100);
      }
    } else if(o.kind==='rupture') {
      if(o.t>=o.dur&&!o.fired){o.fired=true;const e=o.enemy;if(!e.dead){skillHit(e,'rupture',o.dir);skillEffect('split',e.x,e.y-58,.3,{dir:o.dir});audio.play('pierceBreak');}}
    } else if(o.kind==='moon') {
      const t=clamp(o.t/o.dur,0,1),travel=Math.sin(Math.PI*t);
      const endX=lerp(o.originX,player.x,clamp((t-.5)*2,0,1));
      o.x=clamp(endX+o.dir*385*travel,35,WORLD-35);o.y=lerp(o.originY,player.y-60,t)+Math.sin(t*TAU)*18;
      const phase=t<.5?0:1;if(phase!==o.phase){o.phase=phase;o.hit.clear();}
      for(const e of enemies) if(!e.dead&&e.state!=='spawn'&&!o.hit.has(e.id)&&Math.abs(e.x-o.x)<65&&Math.abs(e.y-53-o.y)<100){o.hit.add(e.id);skillHit(e,'moon',o.dir*(phase?-1:1));}
    }
  }
  skillObjects=skillObjects.filter(o=>o.t<o.dur);
}
function updateSkillHUD() {
  for(const name in skillDefs) {
    const def=skillDefs[name],cd=player.skillCD[name],node=$('skill-'+name);
    node.classList.toggle('cooling',cd>0);node.classList.toggle('casting',player.action==='skill'&&player.skill?.name===name);
    node.style.setProperty('--cooldown',(cd/def.cd*100)+'%');
    node.querySelector('.skill-status').textContent=cd>0?cd.toFixed(1)+'s':'READY';
  }
}
function skillPose(s) {
  const q=basePose(),t=s.t;
  if(s.name==='vortex') {
    const wind=t<.13,z=ease((t-.13)/.14);
    const a={...q,tilt:-.28,low:12,uf:2.1,lf:-1.6,ub:1.2,lb:-1.2,sword:-2.4,tf:1.1,tb:2};
    const b={...q,tilt:.22,low:8,uf:-.55,lf:-.4,ub:3.2,lb:3.0,sword:-.2,tf:1.1,tb:2};
    return wind?blendPose(q,a,ease(t/.13)):blendPose(a,b,z);
  }
  if(s.name==='pierce') {
    if(t<.105)return {...q,tilt:-.4,low:17,uf:2.5,lf:2.8,ub:2,lb:2.5,sword:3.05,tf:.9,tb:2.3};
    if(t<.32)return {...q,tilt:1.1,low:23,uf:-.1,lf:0,ub:2.9,lb:2.8,sword:0,tf:.65,sf:1.8,tb:2.8,sb:2.5,scarf:1};
    return {...q,tilt:.35,low:14,uf:2.3,lf:2.8,ub:1.8,lb:.5,sword:3,tf:1,tb:2.3};
  }
  if(s.name==='orbit') {
    const a=t<.12?ease(t/.12):1;
    return {...q,tilt:.2,low:5,uf:lerp(1.1,-.55,a),lf:lerp(.3,-.2,a),ub:lerp(1.9,3.4,a),lb:3.1,sword:-.5,tf:1.2,tb:2.0};
  }
  if(t<.16)return {...q,low:22,tilt:-.25,uf:-2.2,lf:-1.4,ub:-2,lb:-1.1,sword:-2.2,tf:.8,sf:1.7,tb:2.2};
  if(t<.43)return {...q,low:0,tilt:-.25,uf:-1.7,lf:-1.5,ub:-1.9,lb:-1.1,sword:-1.5,tf:.55,sf:2.1,tb:2.5,sb:2};
  return {...q,low:21,tilt:.9,uf:.7,lf:.85,ub:.8,lb:.4,sword:1,tf:.8,sf:1.45,tb:2.5,sb:1.8};
}
