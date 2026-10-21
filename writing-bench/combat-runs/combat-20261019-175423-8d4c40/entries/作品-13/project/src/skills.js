// Four independent techniques share the real damage/limb pipeline, never synthetic counters.
const skillDefs = [
  {name:'掠雨一线',key:'1',cd:3,color:'#a2f9ed',role:'贯穿 · 断臂',duration:.46},
  {name:'回澜锁月',key:'2',cd:5,color:'#a9bcff',role:'聚敌 · 浮空',duration:.66},
  {name:'双弧归燕',key:'3',cd:4,color:'#b8f494',role:'飞刃 · 往返',duration:.34},
  {name:'天钉落庭',key:'4',cd:7,color:'#ffd18c',role:'定点 · 重落',duration:.43}
];
let skillObjects=[], skillFX=[];
function skillAttack(damage,cut,knock,freeze,color,dir,extra={}){
  return {damage,cut,knock,stop:freeze,color,dir,kind:'technique',...extra};
}
function skillHit(e,a,x,y){
  if(e.dead||e.spawn>0)return;
  hitEnemy(e,{...a,impactY:y});
  if(e.dead)return;
  if(a.pull!==undefined){e.vx=clamp((a.pull-e.x)*7,-410,410);e.stun=Math.max(e.stun,.42);}
  if(a.lift!==undefined){e.vy=a.lift;e.stun=Math.max(e.stun,.65);e.landing=true;}
}
function skillArea(x,y,rx,ry,a,hit=new Set()){
  for(const e of enemies){
    if(e.dead||e.spawn>0||hit.has(e.id))continue;
    if(Math.abs(e.x-x)<rx+18&&Math.abs(e.y-40-y)<ry){
      hit.add(e.id);skillHit(e,{...a,dir:a.radial?sign(e.x-x):a.dir},x,y);
    }
  }
  return hit;
}
function eraseShots(x,y,rx,ry){
  for(const s of shots)if(!s.dead&&Math.abs(s.x-x)<rx&&Math.abs(s.y-y)<ry){s.dead=true;sparks(s.x,s.y,5,C.teal,.6);}
}
function techniqueFX(kind,x,y,color,life,extra={}){skillFX.push({kind,x,y,color,life,max:life,...extra});}
function trySkill(){
  const p=player;if(p.hp<=0||p.hurt>0||p.dash>0)return;
  for(let i=0;i<4;i++){
    if(!queued('Digit'+(i+1))&&!queued('Numpad'+(i+1)))continue;
    if(p.skillCD[i]>0){use('Digit'+(i+1));use('Numpad'+(i+1));p.skillFlash[i]=.18;continue;}
    if(p.skill&&p.skill.t<skillDefs[p.skill.index].duration-.1)return;
    if(p.action&&p.action.t<p.action.wind)return;
    use('Digit'+(i+1));use('Numpad'+(i+1));
    const d=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
    if(d)p.dir=d;
    const def=skillDefs[i];p.skillCD[i]=def.cd;p.skillFlash[i]=.5;
    p.skill={index:i,t:0,dir:p.dir,x:p.x,y:p.y,hit:new Set(),pulse:0,released:false,trail:0};
    p.action=null;p.charging=false;p.charge=0;p.vx*=.2;p.vy*=.3;
    texts.push({x:p.x,y:p.y-120,text:def.name,color:def.color,life:.8,max:.8,size:19});
    if(i===0){tone(180,750,.13,.09,'triangle');hiss(.13,.11,2100);}
    if(i===1){tone(180,470,.2,.1,'sine');tone(235,620,.24,.045,'triangle');}
    if(i===2){tone(740,1100,.11,.08,'triangle');hiss(.12,.13,2800);}
    if(i===3){tone(220,90,.25,.16,'triangle');tone(500,900,.28,.05);}
    return;
  }
}
function updateSkillPose(dt){
  const p=player,s=p.skill,def=skillDefs[s.index];s.t+=dt;p.vx*=Math.exp(-dt*13);
  if(s.index===0){
    if(s.t>=.12&&s.t<.34){
      p.invul=Math.max(p.invul,.07);p.vy=0;
      const old=p.x;p.x=clamp(p.x+s.dir*1500*dt,42,WORLD-42);
      skillArea((old+p.x)/2,p.y-42,Math.abs(p.x-old)/2+62,82,skillAttack(52,78,240,.085,def.color,s.dir),s.hit);
      eraseShots((old+p.x)/2,p.y-42,Math.abs(p.x-old)/2+72,80);
      s.trail-=dt;if(s.trail<=0){s.trail=.025;ghosts.push({x:p.x,y:p.y,dir:s.dir,pose:posePlayer(),life:.27,max:.27});}
      if(!s.released){s.released=true;hiss(.25,.3,1300);tone(330,65,.23,.14,'triangle');}
      techniqueFX('thread',old,p.y-44,def.color,.22,{end:p.x+s.dir*70,dir:s.dir});
    }
    if(s.t>=.34&&!s.finished){s.finished=true;ring(p.x,p.y-43,70,def.color,.25);p.vx=s.dir*140;}
  }
  if(s.index===1){
    if(s.t<.48){p.invul=Math.max(p.invul,.035);p.vy=Math.min(p.vy,45);}
    const times=[.13,.31,.51];
    while(s.pulse<3&&s.t>=times[s.pulse]){
      const n=s.pulse++,fin=n===2,r=fin?198:220;
      const a=skillAttack(fin?34:13,fin?46:8,fin?140:0,fin?.09:.032,def.color,s.dir,{radial:true,...(fin?{lift:-570}:{pull:p.x,lift:-95})});
      skillArea(p.x,p.y-40,r,150,a);eraseShots(p.x,p.y-40,r,140);
      arcs.push({x:p.x,y:p.y-45,dir:n%2? -1:1,r:fin?192:160,life:.27,max:.27,color:def.color,kind:'orbit',a:-2.8,b:3.4,width:fin?19:10});
      techniqueFX('orbit',p.x,p.y-40,def.color,.32,{radius:r,phase:n});
      hiss(.16,.18,1000+n*650);tone(260+n*180,fin?70:380,.15,.09,'triangle');
      if(fin){p.vy=-290;p.onGround=false;}
    }
  }
  if(s.index===2&&s.t>=.1&&!s.released){
    s.released=true;skillObjects.push({kind:'swallow',x:p.x+s.dir*36,y:p.y-45,origin:p.x,t:0,dir:s.dir,returning:false,hitOut:new Set(),hitBack:new Set(),trail:0,color:def.color});
    createArc(p,{kind:'light',range:90,color:def.color,name:'light2'});hiss(.19,.23,2500);tone(950,350,.22,.1,'triangle');
  }
  if(s.index===3&&s.t>=.18&&!s.released){
    s.released=true;
    const targets=enemies.filter(e=>!e.dead&&e.spawn<=0&&(e.x-p.x)*s.dir>-55&&(e.x-p.x)*s.dir<440).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x));
    const x=clamp(targets.length?targets[0].x:p.x+s.dir*210,70,WORLD-70);
    skillObjects.push({kind:'nail',x,y:FLOOR,t:0,phase:0,dir:s.dir,color:def.color});
    p.invul=Math.max(p.invul,.12);techniqueFX('call',p.x,p.y-45,def.color,.35,{end:x});
    tone(700,1300,.23,.07,'sine');
  }
  if(s.t>=def.duration){p.skill=null;return;}
  if(s.t>=def.duration-.11){
    if(queued('KeyI')&&p.riseCD<=0){p.skill=null;use('KeyI');beginAttack('rise');}
    else if(queued('KeyK')){p.skill=null;use('KeyK');beginAttack(p.onGround?'heavy':'dive');}
    else if(queued('KeyJ')||keys.has('KeyJ')){p.skill=null;requestLight();}
  }
}
function updateSkillObjects(dt){
  if(player.hp<=0){skillObjects=[];return;}
  for(const o of skillObjects){
    o.t+=dt;
    if(o.kind==='swallow'){
      const old=o.x,oldY=o.y;
      if(!o.returning){o.x+=o.dir*810*dt;if(Math.abs(o.x-o.origin)>=430||o.x<35||o.x>WORLD-35){o.returning=true;techniqueFX('orbit',o.x,o.y,o.color,.27,{radius:52,phase:0});tone(950,550,.13,.06);}}
      else{const dx=player.x-o.x,dy=player.y-43-o.y,dist=Math.hypot(dx,dy),step=1000*dt;if(dist<step+18){o.dead=true;ring(player.x,player.y-40,36,o.color,.2);tone(880,1250,.1,.05);continue;}o.x+=dx/dist*step;o.y+=dy/dist*step;}
      const back=o.returning;
      skillArea((old+o.x)/2,(oldY+o.y)/2,Math.abs(o.x-old)/2+43,65,skillAttack(back?34:26,back?48:24,back?90:120,back?.065:.045,o.color,sign(o.x-old),{lift:back?-150:-80}),back?o.hitBack:o.hitOut);
      eraseShots(o.x,o.y,53,67);o.trail-=dt;
      if(o.trail<=0){o.trail=.035;techniqueFX('feather',o.x,o.y,o.color,.22,{angle:o.t*22});}
      if(o.t>2.5)o.dead=true;
    }
    if(o.kind==='nail'){
      if(o.t>=.18&&o.phase===0){o.phase=1;skillArea(o.x,FLOOR-65,140,190,skillAttack(16,12,0,.045,o.color,o.dir,{pull:o.x,lift:-185}));ring(o.x,FLOOR-4,145,o.color,.35);tone(340,680,.16,.08);}
      if(o.t>=.59&&o.phase===1){
        o.phase=2;skillArea(o.x,FLOOR-115,158,255,skillAttack(76,115,450,.14,o.color,o.dir,{radial:true,limb:'leg',lift:-470}));eraseShots(o.x,FLOOR-130,170,260);
        techniqueFX('impact',o.x,FLOOR,o.color,.55);ring(o.x,FLOOR-4,195,o.color,.5);dust(o.x,FLOOR,24,o.color);sparks(o.x,FLOOR-18,32,o.color,1.6);
        // The falling blade makes sound even on stone, but only enemy contact can freeze time.
        tone(72,26,.34,.25,'triangle');hiss(.28,.25,750);tone(680,120,.2,.08,'sawtooth');
      }
      if(o.t>1.12)o.dead=true;
    }
  }
  skillObjects=skillObjects.filter(o=>!o.dead);
}
function updateSkillFX(dt){for(const f of skillFX)f.life-=dt;skillFX=skillFX.filter(f=>f.life>0);}
function skillPose(pose){
  const s=player.skill;if(!s)return pose;const t=s.t;
  if(s.index===0){pose.lean=t<.12?-11:24;pose.headX=pose.lean;pose.headY=-57;pose.hipY=-25;pose.hand=t<.12?[-15,-40]:[42,-43];pose.elbow=[12,-46];pose.sword=t<.12?-3.1:0;pose.frontKnee=[20,-15];pose.frontFoot=[33,0];pose.backKnee=[-21,-13];pose.backFoot=[-36,-1];}
  if(s.index===1){const a=-2.6+t*15;pose.lean=Math.sin(a)*10;pose.hand=[Math.cos(a)*34,-48+Math.sin(a)*20];pose.elbow=[Math.cos(a)*16,-48];pose.sword=a;pose.frontFoot=[26,-5];pose.backFoot=[-24,-2];pose.backHand=[-pose.hand[0]*.7,-45];}
  if(s.index===2){pose.lean=9;pose.hand=[t<.1?-20:39,-50];pose.elbow=[19,-55];pose.sword=-.12;pose.backHand=[-22,-41];pose.frontFoot=[24,0];}
  if(s.index===3){pose.lean=t<.18?-6:8;pose.hand=t<.18?[5,-83]:[24,-23];pose.elbow=t<.18?[-5,-67]:[25,-48];pose.sword=t<.18?-1.5:1.3;pose.frontKnee=[22,-13];pose.frontFoot=[29,0];pose.hipY=-25;pose.headY=-65;}
  return pose;
}
function drawSkillObjects(){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const o of skillObjects){
    if(o.kind==='swallow'){
      ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.t*22);ctx.globalAlpha=.9;
      for(let i=0;i<2;i++){ctx.rotate(Math.PI);poly([[-44,-5],[-18,-14],[31,-9],[49,2],[12,7],[-20,5]],'#a0e87926',o.color,2);line(-25,-8,38,-3,C.pale,2);}ctx.restore();
    }else{
      const q=clamp(o.t/.59,0,1);ctx.save();ctx.translate(o.x,FLOOR-6);ctx.globalAlpha=o.phase<2?.45+q*.4:Math.max(0,(1.12-o.t)*1.4);
      ctx.strokeStyle=o.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,145,18,0,0,TAU);ctx.stroke();ctx.beginPath();ctx.ellipse(0,0,105,12,0,0,TAU);ctx.stroke();
      for(let i=0;i<8;i++){const a=i*TAU/8+o.t;line(Math.cos(a)*111,Math.sin(a)*13,Math.cos(a)*139,Math.sin(a)*17,o.color,2);}
      if(o.phase<2){const y=-330+ease(clamp((o.t-.4)/.19,0,1))*315;line(0,-330,0,-4,o.color,.7);poly([[-12,y-140],[12,y-140],[16,y-42],[0,y],[-16,y-42]],'#ffd18c33',o.color,2);line(0,y-132,0,y-12,C.pale,3);line(-28,y-105,28,y-105,o.color,3);}
      ctx.restore();
    }
  }
  for(const f of skillFX){
    const q=1-f.life/f.max;ctx.save();ctx.globalAlpha=(1-q)*.85;
    if(f.kind==='thread'){line(f.x,f.y,f.end,f.y,f.color,2);poly([[f.x,f.y-9],[f.end,f.y],[f.x,f.y+5]],'#a2f9ed22');line(f.x,f.y+12,f.end-f.dir*30,f.y+12,f.color,.7);}
    if(f.kind==='orbit'){ctx.translate(f.x,f.y);ctx.scale(1,.52);ctx.rotate(q*2+f.phase);ctx.strokeStyle=f.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,f.radius*(.8+q*.2),-.2,4.7);ctx.stroke();ctx.beginPath();ctx.arc(0,0,f.radius*.7,1.8,5.9);ctx.stroke();}
    if(f.kind==='feather'){ctx.translate(f.x,f.y);ctx.rotate(f.angle);line(-32,0,32,0,f.color,2);}
    if(f.kind==='call'){line(f.x,f.y-35,lerp(f.x,f.end,ease(q)),lerp(f.y-35,FLOOR-100,q),f.color,1);}
    if(f.kind==='impact'){ctx.translate(f.x,f.y);poly([[-12*(1-q),0],[-7,-260*(1-q)],[8,-310*(1-q)],[18*(1-q),0]],'#ffd18c55');line(0,0,0,-310*(1-q),C.pale,3);for(let i=0;i<7;i++){const dx=(i-3)*35;line(dx*.3,0,dx*(1+q),-Math.sin((i+1)*.4)*75*(1-q),f.color,2);}}
    ctx.restore();
  }
  ctx.restore();
}
function drawSkillHUD(){
  const width=204,gap=12,start=(W-(width*4+gap*3))/2,y=H-124;
  for(let i=0;i<4;i++){
    const d=skillDefs[i],cd=player.skillCD[i],x=start+i*(width+gap),ready=cd<=0;
    rounded(x,y,width,49,4,'#0d202ced');ctx.strokeStyle=player.skillFlash[i]>0?d.color:ready?'#4b777b':'#283c49';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,width-1,48);
    rounded(x+9,y+10,26,27,3,ready?'#29434b':'#1a2b35');label(d.key,x+22,y+30,17,ready?d.color:'#657c87','center','monospace');
    label(d.name,x+44,y+20,14,ready?'#e0eae3':'#80979f');label(d.role,x+44,y+38,10,'#90a8ae');label(ready?'就绪':cd.toFixed(1)+'s',x+width-10,y+22,11,ready?d.color:'#b0b7bb','right');
    ctx.fillStyle=d.color;ctx.globalAlpha=ready?.75:.35;ctx.fillRect(x+2,y+46,(width-4)*(1-cd/d.cd),2);ctx.globalAlpha=1;
  }
}
