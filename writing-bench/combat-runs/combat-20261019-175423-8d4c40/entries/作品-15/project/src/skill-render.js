function skillArc(x,y,r,ry,a,b,color,width=2) {
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.ellipse(x,y,r,ry,0,a,b);ctx.stroke();
}
function drawSkillUnderlay() {
  for(const fx of skillFX) {
    if(fx.kind==='vortex') {
      const t=1-fx.life/fx.max,r=lerp(355,74,ease(t));
      ctx.save();ctx.globalAlpha=Math.min(1,fx.life/.16);
      for(let k=0;k<3;k++)skillArc(fx.x,FLOOR-3,r+k*11,19+k*7,0,TAU,k===0?'#a0ede0a6':'#6cbcc75e',k===0?2.2:1);
      for(let i=0;i<12;i++) {
        const a=i*TAU/12+worldTime*3.5,xx=fx.x+Math.cos(a)*r,yy=FLOOR-3+Math.sin(a)*23;
        line(xx,yy,lerp(xx,fx.x,.13),yy-7,'#bcfff0',1.5);
      }ctx.restore();
    } else if(fx.kind==='ring') {
      const t=1-fx.life/fx.max;ctx.save();ctx.globalAlpha=fx.life/fx.max;
      skillArc(fx.x,fx.y,fx.radius*ease(t),22*ease(t),0,TAU,fx.color,2);
      skillArc(fx.x,fx.y,fx.radius*ease(t)*.85,15*ease(t),0,TAU,'#e9d99c66',1);ctx.restore();
    } else if(fx.kind==='verdict') {
      const t=1-fx.life/fx.max;ctx.save();ctx.globalAlpha=(1-t)*.6;
      for(const side of [-1,1]) {
        const end=side*280*ease(t);
        poly([[fx.x,FLOOR],[fx.x+end,FLOOR],[fx.x+end*.85,FLOOR-8],[fx.x+side*32,FLOOR-20]],'#ffb97977');
        line(fx.x,FLOOR-1,fx.x+end,FLOOR-1,'#ffe8b3',2);
      }ctx.restore();
    }
  }
  const s=player.skill;
  if(player.action==='skill'&&s?.name==='verdict'&&s.t<.59) {
    const x=player.x+player.dir*36,z=clamp(s.t/.43,0,1);
    ctx.save();ctx.globalAlpha=.25+z*.35;
    skillArc(x,FLOOR-3,70+z*180,16,0,TAU,'#f6b478',1.5);
    for(let i=-3;i<=3;i++){const xx=x+i*45;line(xx,FLOOR-4,xx,FLOOR-10-Math.abs(i)*2,'#f6ba83',2);}ctx.restore();
  }
}
function drawMoon(o) {
  const spin=o.t*23*o.dir;
  ctx.save();ctx.translate(o.x,o.y);
  for(let j=3;j>=0;j--) {
    ctx.save();ctx.rotate(spin-j*.25);ctx.globalAlpha=j?(.17-j*.035):1;
    for(const side of [-1,1]) {
      ctx.save();ctx.scale(side,side);
      poly([[0,-43],[24,-31],[37,-9],[35,14],[24,33],[12,36],[23,12],[19,-6],[6,-24]],j?'#ffcc85':'#f5dda6',j?null:'#fdf3ce',1.2);
      line(0,-43,20,-30,'#fff8de',2);ctx.restore();
    }ctx.restore();
  }
  circle(0,0,9,'#384c47');circle(0,0,4,'#ffe7a7');skillArc(0,0,48,48,spin,spin+Math.PI*1.3,'#e9bc7188',1.4);
  ctx.restore();
}
function drawSkillForeground() {
  ctx.save();
  for(const o of skillObjects)if(o.kind==='moon')drawMoon(o);
  for(const fx of skillFX) {
    const t=1-fx.life/fx.max;
    ctx.save();ctx.globalAlpha=Math.min(1,fx.life/.16);
    if(fx.kind==='vortex') {
      const r=lerp(350,70,ease(t));
      for(let i=0;i<5;i++) {
        const a=i*TAU/5+worldTime*5;
        skillArc(fx.x,fx.y,r*.9,r*.36,a,a+.9,'#9ceddf77',3);
        skillArc(fx.x,fx.y,r*.88,r*.35,a+.1,a+.7,'#edffddaa',1);
        const ex=fx.x+Math.cos(a)*r*.9,ey=fx.y+Math.sin(a)*r*.36;
        line(ex,ey,lerp(ex,fx.x,.3),lerp(ey,fx.y,.3),'#8fe2de77',1);
      }
      circle(fx.x,fx.y,4+Math.sin(t*Math.PI)*7,'#b3ffdd77');
    } else if(fx.kind==='rail') {
      const min=Math.min(fx.x,fx.endX),max=Math.max(fx.x,fx.endX),w=5+Math.sin(t*Math.PI)*8;
      poly([[min,fx.y-w],[max-24,fx.y-w*.4],[max+15,fx.y],[max-24,fx.y+w*.5],[min,fx.y+w]],'#b5f4da66');
      line(min,fx.y,max,fx.y,'#eeffdf',2);line(min+30,fx.y-21,max-10,fx.y-21,'#c9f8db55',1);
      for(let x=min+20;x<max;x+=72)line(x,fx.y-12,x+40,fx.y+12,'#c7ffdf77',1);
    } else if(fx.kind==='mark') {
      const x=fx.enemy.x,y=fx.enemy.y-57;
      line(x-24,y+25,x+22,y-26,'#caffdf',1.5);line(x-21,y-21,x+21,y+21,'#caffdf77',1);
      skillArc(x,y,30,30,-t*TAU,-t*TAU+Math.PI*1.5,'#b1ffd280',1);
    } else if(fx.kind==='split') {
      ctx.translate(fx.x,fx.y);ctx.rotate(-.7*fx.dir);
      const l=85*ease(t);
      poly([[-l,-2],[-8,-6],[0,-48],[6,-5],[l,1],[8,5],[0,48],[-6,4]],'#eaffd8');
      line(-l*1.3,0,l*1.3,0,'#b3f7cd',1.5);
    } else if(fx.kind==='verdict') {
      const width=28*(1-t)+3,height=300*(1-t);
      ctx.translate(fx.x,fx.y);
      poly([[-width,0],[-width*1.5,-height*.65],[-width*.65,-height],[width*.65,-height],[width*1.5,-height*.65],[width,0]],'#ffc58844');
      line(0,0,0,-height,'#ffe2a399',2);
      for(let i=0;i<7;i++) {
        const x=(i-3)*45,h=(1-t)*randStable(i)*110;
        poly([[x-5,0],[x-3,-h],[x+4,-h-10],[x+8,0]],'#edb37955');
      }
    }
    ctx.restore();
  }
  const p=player,s=p.skill;
  if(p.action==='skill'&&s?.name==='verdict'&&s.t>.16&&s.t<.65) {
    const dropping=s.t>=.43,z=dropping?clamp((s.t-.43)/.16,0,1):0;
    const x=p.x+p.dir*36,y=dropping?lerp(clamp(s.originY-195,240,345)-22,FLOOR,z*z):p.y-22;
    ctx.save();ctx.translate(x,y);ctx.scale(p.dir,1);ctx.globalAlpha=.65;
    const glow=ctx.createRadialGradient(0,-100,10,0,-100,145);glow.addColorStop(0,'#ffd29122');glow.addColorStop(1,'#ffd29100');ctx.fillStyle=glow;ctx.fillRect(-160,-260,320,320);
    poly([[0,0],[-31,-48],[-25,-181],[-43,-199],[-43,-213],[-10,-213],[-8,-250],[8,-250],[10,-213],[43,-213],[43,-199],[25,-181],[31,-48]],'#e8c28b66','#ffe0a5',2);
    line(0,-8,0,-207,'#fff1bc',3);line(-20,-175,20,-175,'#e4bb7c',2);
    for(let k=0;k<4;k++)poly([[-7,-64-k*25],[0,-73-k*25],[7,-64-k*25],[0,-55-k*25]],'#ffe6a9');
    ctx.restore();
  }
  ctx.restore();
}
function randStable(i){return .55+seeded(i+78)*.7;}
