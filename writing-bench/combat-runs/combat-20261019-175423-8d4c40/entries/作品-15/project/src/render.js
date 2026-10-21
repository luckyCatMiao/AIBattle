function poly(points, fill, stroke = null, width = 1) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
function circle(x, y, r, color) { ellipse(x, y, r, r, color); }
function seeded(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
function gradient(x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0,y0,x1,y1); for (const s of stops) g.addColorStop(s[0],s[1]); return g; }
function joint(p, angle, length) { return [p[0] + Math.cos(angle) * length, p[1] + Math.sin(angle) * length]; }
const basePose = () => ({ tilt: .04, low: 0, uf: 1.12, lf: .28, ub: 1.9, lb: 1.2, tf: 1.22, sf: 1.77, tb: 1.85, sb: 1.35, sword: -.37, scarf: 0 });
function blendPose(a, b, t) { const p = {}; for (const k in a) p[k] = lerp(a[k], b[k] ?? a[k], t); return p; }
function playerPose() {
  const p = player, q = basePose(), phase = worldTime * 14;
  if (p.dead) return { ...q, low: 29, tilt: -.9, uf: -1.5, lf: -2, ub: 2.4, lb: 2.9, tf: .4, sf: .3, tb: 2.4, sb: 2.7, sword: -2 };
  if (p.action === 'hurt') return { ...q, tilt: -.6, low: 4, uf: -1.9, lf: -1.2, ub: 2.5, lb: 1.8, sword: -1.4, tf: 1.1, tb: 2.1 };
  if (p.action === 'skill' && p.skill) return skillPose(p.skill);
  if (p.action === 'dash') return { ...q, tilt: .95, low: 24, uf: 2.9, lf: 2.8, ub: 3.2, lb: 2.8, tf: .55, sf: 1.65, tb: 2.7, sb: 2.3, sword: 3.05, scarf: 1 };
  if (p.action === 'charge') {
    const z = clamp(p.charge / .48, 0, 1);
    return { ...q, tilt: -.33, low: 9 + z * 2, uf: -2.5, lf: -1.5, ub: -2.15, lb: -.85, tf: 1.05, sf: 1.65, tb: 2.1, sb: 1.15, sword: -2.6, scarf: .4 };
  }
  if (p.action === 'attack' && p.attack) {
    const at = p.attack, a = at.a, t = p.t, wind = t < a.wind;
    const z = ease((t - a.wind) / Math.max(.06, a.end - a.wind)), r = ease((t - a.end) / (a.dur - a.end));
    let prep, swing;
    if (a.pose === 'cut1') {
      prep = { ...q, tilt: -.2, low: 5, uf: 2.75, lf: -2.3, ub: 1.6, lb: .7, sword: -2.5, tf: 1.0, tb: 1.95 };
      swing = { ...q, tilt: .65, low: 8, uf: -.1, lf: .15, ub: 2.9, lb: 2.1, sword: .5, tf: 1.0, sf: 1.4, tb: 2.45, sb: 1.6 };
    } else if (a.pose === 'cut2') {
      prep = { ...q, tilt: .25, low: 6, uf: .45, lf: .8, ub: 2.3, lb: 1, sword: 1.3, tf: 1.1, tb: 2 };
      swing = { ...q, tilt: -.12, low: 2, uf: -.65, lf: -.8, ub: 1.5, lb: .5, sword: -.95, tf: 1.3, tb: 1.95 };
    } else if (a.pose === 'cut3' || a.pose === 'heavy') {
      prep = { ...q, tilt: -.48, low: 10, uf: -2.1, lf: -1.2, ub: -1.9, lb: -.9, sword: -2.5, tf: 1.0, sf: 1.4, tb: 2.1, sb: 1.35 };
      swing = { ...q, tilt: .83, low: 17, uf: .35, lf: .43, ub: .75, lb: -.15, sword: .45, tf: .8, sf: 1.5, tb: 2.65, sb: 1.7 };
    } else if (a.pose === 'lift') {
      prep = { ...q, tilt: .4, low: 22, uf: 1.3, lf: .55, ub: 2.3, lb: 1, sword: 1.1, tf: .8, sf: 1.6, tb: 2.3 };
      swing = { ...q, tilt: -.4, low: -4, uf: -1.25, lf: -1.18, ub: 2.1, lb: 2.6, sword: -1.35, tf: 1.3, sf: 2.1, tb: 2.15, sb: 1.45 };
    } else {
      prep = { ...q, tilt: -.2, low: 4, uf: -1.8, lf: -1.1, ub: -2, lb: -.7, sword: -1.9, tf: .6, sf: 2, tb: 2.1, sb: 2.2 };
      swing = { ...q, tilt: .75, low: 19, uf: .65, lf: .75, ub: .8, lb: .6, sword: .95, tf: .6, sf: 1.4, tb: 2.4, sb: 1.6 };
    }
    if (wind) return blendPose(q, prep, ease(t / a.wind));
    const pose = blendPose(prep, swing, z);
    return blendPose(pose, q, r * .82);
  }
  if (!p.onGround) {
    q.tilt = .16; q.uf = -.25; q.lf = -.8; q.ub = 2.5; q.lb = 1.9; q.sword = -.7;
    q.tf = .5; q.sf = 1.8; q.tb = 2.05; q.sb = 2.1;
    if (p.vy > 0) { q.tf = 1.15; q.sf = 1.9; q.tb = 2.0; q.sb = 1.7; }
    return q;
  }
  if (Math.abs(p.vx) > 30) {
    const z = Math.sin(phase), zz = Math.sin(phase + Math.PI);
    q.tilt = .45; q.low = Math.abs(Math.cos(phase)) * -4 + 3;
    q.tf = 1.55 + z * .78; q.sf = 1.48 + Math.max(0, -z) * .95;
    q.tb = 1.55 + zz * .78; q.sb = 1.48 + Math.max(0, -zz) * .95;
    q.uf = 2.2; q.lf = 1.3; q.ub = 1.4 + z * .5; q.lb = .8; q.sword = -.6; q.scarf = .6;
  } else { q.low = Math.sin(worldTime * 2.6) * 1.3; q.uf += Math.sin(worldTime * 2.6) * .04; }
  if (p.landT > 0) q.low += Math.sin(p.landT / .16 * Math.PI) * 8;
  return q;
}
function enemyPose(e) {
  const q = basePose(), lancer = e.type === 'lancer';
  q.low = e.leg ? 0 : 24; q.tilt = lancer ? .13 : .28;
  q.uf = lancer ? 1.0 : .6; q.lf = lancer ? -.1 : -.4; q.sword = lancer ? -.13 : -.8;
  q.ub = 1.8; q.lb = .8; q.tf = 1.2; q.sf = 1.65; q.tb = 1.95; q.sb = 1.35;
  if (e.state === 'stun') { q.tilt = -.45; q.uf = -1.3; q.lf = -.7; q.ub = 2.4; q.lb = 2.2; q.sword = -1; q.tf = 1.0; q.tb = 2.0; q.low += 4; }
  else if (e.state === 'windup') {
    const z = ease(e.t / (lancer ? .72 : .58)); q.tilt = -.35 * z; q.low += 8 * z;
    q.uf = lerp(q.uf, lancer ? 2.4 : -2.1, z); q.lf = lerp(q.lf, lancer ? -.2 : -1.4, z); q.sword = lancer ? -.12 : -2.2; q.tb = 2.05;
  } else if (e.state === 'strike') {
    q.tilt = .8; q.low += 12; q.uf = -.05; q.lf = -.12; q.sword = lancer ? -.06 : .6;
    q.ub = 2.7; q.lb = 2.4; q.tf = .85; q.sf = 1.45; q.tb = 2.5; q.sb = 1.7;
  } else if (e.state === 'recover') { q.tilt = .55; q.low += 12; q.uf = .6; q.lf = .2; q.sword = .65; }
  else if (Math.abs(e.vx) > 20 && e.y >= FLOOR - 1) {
    const t = worldTime * (e.leg ? 10 : 5) + e.seed;
    q.tf = 1.55 + Math.sin(t) * .55; q.sf = 1.45 + Math.max(0, -Math.sin(t)) * .7;
    q.tb = 1.55 - Math.sin(t) * .55; q.sb = 1.45 + Math.max(0, Math.sin(t)) * .7; q.low += Math.cos(t * 2) * 2;
  }
  if (e.dead) { q.tilt = -.8; q.uf = -1.9; q.lf = -2.4; q.ub = 2.7; q.lb = 2.3; q.tf = .6; q.sf = 1.2; q.tb = 2.6; q.sb = 2.5; q.sword = -1.9; }
  return q;
}
function skeleton(q, entity, isPlayer) {
  const s = isPlayer ? 1 : entity.type === 'lancer' ? 1.1 : 1.03;
  const hip = [q.tilt * 7, (-39 + q.low) * s], shoulder = [q.tilt * 23, (-78 + q.low) * s];
  const neck = [q.tilt * 26, (-89 + q.low) * s], head = [q.tilt * 29, (-101 + q.low) * s];
  const elbowF = joint(shoulder, q.uf, 22 * s), handF = joint(elbowF, q.lf, 23 * s);
  const elbowB = joint([shoulder[0] - 5, shoulder[1] + 1], q.ub, 22 * s), handB = joint(elbowB, q.lb, 22 * s);
  const kneeF = joint(hip, q.tf, 22 * s), footF = joint(kneeF, q.sf, 22 * s);
  const kneeB = joint([hip[0] - 4, hip[1]], q.tb, 22 * s), footB = joint(kneeB, q.sb, 22 * s);
  return { hip, shoulder, neck, head, elbowF, handF, elbowB, handB, kneeF, kneeB, footF, footB };
}
function segment(a, b, width, color, edge = '#101e22', plate = true) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  poly([[a[0]+nx*width*.42,a[1]+ny*width*.42],[b[0]+nx*width*.34,b[1]+ny*width*.34],[b[0]-nx*width*.34,b[1]-ny*width*.34],[a[0]-nx*width*.42,a[1]-ny*width*.42]], color, edge, 1.5);
  if (plate) line(a[0]+nx*width*.23,a[1]+ny*width*.23,b[0]+nx*width*.16,b[1]+ny*width*.16,'#d4d5bb3f',1);
}
function sword(hand, angle, kind = 'player') {
  ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(angle);
  if (kind === 'lancer') {
    poly([[-37,-3],[93,-3],[116,0],[93,4],[-37,3]], '#667e81','#12272e',1);
    poly([[65,-5],[105,-5],[126,0],[105,5],[65,5],[71,0]],'#c1bda4');
    line(68,-4,115,-1,'#e0c99a',1.2); line(-22,-5,-22,5,'#d7a56e',3);
  } else if (kind === 'reaver') {
    poly([[-10,-3],[26,-3],[30,-15],[68,-23],[75,-12],[65,12],[29,12],[25,3],[-10,3]],'#b39b78','#15252a',2);
    poly([[35,-14],[65,-20],[68,-12],[58,4],[34,7]],'#d6b996'); line(30,11,65,12,'#f4d6b3',2);
  } else {
    poly([[-13,-3],[3,-3],[4,-6],[12,-5],[14,-3],[73,-4],[91,-1],[78,6],[13,6],[7,3],[-13,3]],'#cbd9c8','#263b3d',1);
    poly([[13,-3],[76,-3],[91,-1],[77,1],[13,1]],'#f1efda');
    line(17,4,73,4,'#6aabaa',1.2); line(5,-9,5,10,'#c7ac78',3); line(-9,-2,-9,2,'#e3b580',2);
  }
  ctx.restore();
}
function drawPlayer(pose = playerPose(), ghost = false) {
  const p = player, j = skeleton(pose, p, true);
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.dir, 1);
  if (p.dead) { ctx.translate(0,-25); ctx.rotate(-.8); }
  const coat = ghost ? '#a1d9d3' : p.hitFlash > 0 ? '#fff0d2' : '#d6d9bf';
  const armor = ghost ? '#75c8cb' : '#30484a';
  // Scarf and split coat follow the direction of travel rather than the sword.
  const wind = Math.sin(worldTime * 9) * 5, pull = Math.abs(p.vx) * .055 + pose.scarf * 12;
  poly([[j.neck[0]-6,j.neck[1]+2],[j.neck[0]-27-pull,j.neck[1]-1+wind],[j.neck[0]-49-pull,j.neck[1]+9-wind*.4],[j.neck[0]-26-pull*.5,j.neck[1]+6],[j.neck[0]-6,j.neck[1]+8]],ghost?'#a1eeee':'#bc5b43');
  segment(j.hip,j.kneeB,12,armor); segment(j.kneeB,j.footB,10,'#233b3f');
  poly([[j.footB[0]-6,j.footB[1]-4],[j.footB[0]+10,j.footB[1]-2],[j.footB[0]+12,j.footB[1]+3],[j.footB[0]-7,j.footB[1]+3]],'#1c3035');
  segment(j.shoulder,j.elbowB,11,'#899c93'); segment(j.elbowB,j.handB,10,armor); circle(...j.handB,4,'#d2c9a8');
  poly([[j.shoulder[0]-13,j.shoulder[1]+7],[j.hip[0]-12,j.hip[1]+6],[j.hip[0]-21-pull*.35,j.hip[1]+31],[j.hip[0]+2,j.hip[1]+21],[j.hip[0]+11,j.hip[1]+32],[j.hip[0]+19,j.hip[1]+19],[j.hip[0]+13,j.hip[1]-5],[j.shoulder[0]+12,j.shoulder[1]+8]],coat,'#21373a',1.5);
  line(j.hip[0]-8,j.hip[1]+8,j.hip[0]-13-pull*.3,j.hip[1]+24,'#91a299',1.2);
  segment(j.hip,j.kneeF,13,armor); segment(j.kneeF,j.footF,11,'#364d4c');
  poly([[j.footF[0]-6,j.footF[1]-5],[j.footF[0]+9,j.footF[1]-2],[j.footF[0]+13,j.footF[1]+3],[j.footF[0]-7,j.footF[1]+3]],'#142c31','#b9bd9e',.8);
  poly([[j.shoulder[0]-13,j.shoulder[1]-1],[j.shoulder[0]+10,j.shoulder[1]-3],[j.hip[0]+12,j.hip[1]-2],[j.hip[0]-10,j.hip[1]+2]],coat,'#1c3437',1.5);
  poly([[j.shoulder[0]-9,j.shoulder[1]+4],[j.shoulder[0]-1,j.shoulder[1]+7],[j.hip[0]-1,j.hip[1]-4],[j.hip[0]-7,j.hip[1]-5]],'#7a938c');
  line(j.hip[0]-11,j.hip[1]-3,j.hip[0]+12,j.hip[1]-3,'#293d3c',5); circle(j.hip[0]+6,j.hip[1]-3,2.5,'#d5ac72');
  segment(j.neck,j.head,11,'#273f41');
  // Angular porcelain mask, with one unbroken illuminated visor.
  poly([[j.head[0]-10,j.head[1]-9],[j.head[0]+6,j.head[1]-12],[j.head[0]+13,j.head[1]-5],[j.head[0]+12,j.head[1]+6],[j.head[0]+5,j.head[1]+13],[j.head[0]-8,j.head[1]+7]],coat,'#20373a',1.5);
  poly([[j.head[0]-7,j.head[1]-2],[j.head[0]+12,j.head[1]-3],[j.head[0]+12,j.head[1]+2],[j.head[0]-5,j.head[1]+3]],'#1b383f');
  line(j.head[0]+1,j.head[1]-1,j.head[0]+12,j.head[1]-2,'#b5eeea',2);
  poly([[j.neck[0]-9,j.neck[1]-1],[j.neck[0]+11,j.neck[1]-1],[j.neck[0]+10,j.neck[1]+6],[j.neck[0]-8,j.neck[1]+7]],'#bc674a');
  segment(j.shoulder,j.elbowF,13,coat); circle(...j.elbowF,4.5,'#344c4c'); segment(j.elbowF,j.handF,11,armor); circle(...j.handF,4.8,'#d1ccb0');
  sword(j.handF,pose.sword);
  if (p.action === 'charge' && !ghost) {
    const v = clamp(p.charge / .48,0,1);
    ctx.strokeStyle = p.chargeReady ? '#b8eeee' : '#f1c08a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(j.handF[0],j.handF[1],21+Math.sin(worldTime*20)*2,-Math.PI/2,-Math.PI/2+TAU*v); ctx.stroke();
    if (p.chargeReady) { ctx.globalAlpha *= .5+.5*Math.sin(worldTime*25); circle(j.handF[0],j.handF[1],5,'#d6ffed'); }
  }
  ctx.restore();
}
function drawEnemy(e) {
  const q = enemyPose(e), j = skeleton(q,e,false), lancer = e.type === 'lancer';
  ctx.save(); ctx.translate(e.x,e.y); ctx.scale(e.dir,1);
  if (e.dead) { ctx.globalAlpha = clamp(1 - (e.deathT-.6)/1.2,0,1); ctx.translate(0,-32); ctx.rotate(-Math.min(1.6,e.rag)); }
  if (e.state === 'spawn') { ctx.globalAlpha = clamp(e.t/.58,0,1); ctx.translate(0,(1-clamp(e.t/.58,0,1))*-25); }
  const metal = e.flash>0 ? '#fff0ca' : lancer?'#829da0':'#a36b51';
  const dark = e.flash>0 ? '#f4d9ba' : lancer?'#3e6269':'#6c493e';
  const rim = '#192b30';
  segment(j.shoulder,j.elbowB,12,dark); segment(j.elbowB,j.handB,11,'#344548'); circle(...j.elbowB,4,'#b6a387');
  segment(j.hip,j.kneeB,15,dark); segment(j.kneeB,j.footB,14,'#33494b');
  poly([[j.footB[0]-8,j.footB[1]-5],[j.footB[0]+12,j.footB[1]-4],[j.footB[0]+14,j.footB[1]+3],[j.footB[0]-9,j.footB[1]+3]],dark,rim,1);
  if (e.leg) {
    segment(j.hip,j.kneeF,18,metal); circle(...j.kneeF,6,'#223b40'); circle(...j.kneeF,2.5,'#baa276'); segment(j.kneeF,j.footF,16,metal);
    poly([[j.footF[0]-9,j.footF[1]-6],[j.footF[0]+14,j.footF[1]-4],[j.footF[0]+16,j.footF[1]+3],[j.footF[0]-10,j.footF[1]+3]],metal,rim,1.5);
  } else {
    const stub = joint(j.hip,q.tf,10); segment(j.hip,stub,16,dark); circle(...stub,4,'#f4a166');
    line(stub[0]-2,stub[1],stub[0]+5,stub[1]+9+Math.sin(worldTime*17)*3,'#e6a96f',1.3);
  }
  poly([[j.shoulder[0]-16,j.shoulder[1]-3],[j.shoulder[0]+15,j.shoulder[1]-6],[j.shoulder[0]+22,j.shoulder[1]+13],[j.hip[0]+12,j.hip[1]-1],[j.hip[0]-13,j.hip[1]+1],[j.shoulder[0]-18,j.shoulder[1]+14]],dark,rim,2);
  poly([[j.shoulder[0]-12,j.shoulder[1]-3],[j.shoulder[0]+14,j.shoulder[1]-5],[j.shoulder[0]+14,j.shoulder[1]+13],[j.shoulder[0]+2,j.shoulder[1]+23],[j.shoulder[0]-11,j.shoulder[1]+15]],metal,rim,1);
  line(j.shoulder[0]-9,j.shoulder[1]+4,j.shoulder[0]+9,j.shoulder[1]+1,'#d3c1a56b',1.2);
  circle(j.shoulder[0]+1,j.shoulder[1]+15,6,'#233a3e'); circle(j.shoulder[0]+1,j.shoulder[1]+15,3.5,e.dead?'#74513c':'#ee9956');
  segment(j.neck,j.head,12,'#364d50');
  if (lancer) {
    poly([[j.head[0]-11,j.head[1]-12],[j.head[0]+7,j.head[1]-15],[j.head[0]+16,j.head[1]-6],[j.head[0]+10,j.head[1]+11],[j.head[0]-8,j.head[1]+8]],metal,rim,2);
    poly([[j.head[0]-7,j.head[1]-3],[j.head[0]+14,j.head[1]-5],[j.head[0]+12,j.head[1]+1],[j.head[0]-5,j.head[1]+3]],'#213c43');
    line(j.head[0]+4,j.head[1]-1,j.head[0]+13,j.head[1]-2,e.state==='windup'?'#ffb585':'#df9a65',2.2);
    poly([[j.head[0]-10,j.head[1]-10],[j.head[0]-23,j.head[1]-25],[j.head[0]-4,j.head[1]-15]],'#5f7d80',rim,1);
  } else {
    poly([[j.head[0]-12,j.head[1]-9],[j.head[0]+9,j.head[1]-10],[j.head[0]+15,j.head[1]-1],[j.head[0]+10,j.head[1]+11],[j.head[0]-10,j.head[1]+9]],metal,rim,2);
    poly([[j.head[0]-6,j.head[1]-3],[j.head[0]+15,j.head[1]-2],[j.head[0]+13,j.head[1]+4],[j.head[0]-5,j.head[1]+4]],'#293c3c');
    line(j.head[0]+2,j.head[1]+1,j.head[0]+13,j.head[1]+1,e.state==='windup'?'#ffd1ac':'#f5ab70',2.5);
    line(j.head[0]-6,j.head[1]-13,j.head[0]+4,j.head[1]-13,'#c6a07b',3);
  }
  if (e.arm) {
    circle(...j.shoulder,10,metal); circle(...j.shoulder,5,dark);
    segment(j.shoulder,j.elbowF,17,metal); circle(...j.elbowF,6,'#273b3d'); circle(...j.elbowF,2.4,'#c3a179');
    segment(j.elbowF,j.handF,lancer?13:18,metal); circle(...j.handF,5.5,dark); sword(j.handF,q.sword,e.type);
  } else {
    const stub = joint(j.shoulder,q.uf,11); segment(j.shoulder,stub,15,dark); circle(...stub,5,'#ffa978');
    line(stub[0],stub[1],stub[0]+Math.sin(worldTime*21)*7,stub[1]+12,'#e6b37d',1.2);
  }
  ctx.restore();
  if (!e.dead && e.state !== 'spawn') {
    const hy = e.y - (e.leg ? 143 : 115);
    ctx.globalAlpha = .8; ctx.fillStyle = '#0b1d22'; ctx.fillRect(e.x-26,hy,52,3);
    ctx.fillStyle = e.type==='lancer'?'#b5c7bc':'#d9a17b'; ctx.fillRect(e.x-26,hy,52*Math.max(0,e.hp/e.maxHp),3); ctx.globalAlpha = 1;
    if (e.mark > 0 || !e.arm || !e.leg) {
      ctx.font = '8px FoundryCJK, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#d5bb8f';
      ctx.fillText(!e.arm && !e.leg ? '残 机' : !e.arm ? '武 装 解 除' : !e.leg ? '机 动 受 损' : '',e.x,hy-7);
    }
  }
}
function drawTelegraph(e) {
  if (e.dead || e.state !== 'windup') return;
  const duration = e.type==='lancer'&&e.arm?.72:e.arm?.58:.48;
  const t = clamp(e.t/duration,0,1), reach = e.type==='lancer'&&e.arm?245:e.arm?145:110;
  ctx.save(); ctx.translate(e.x,e.y); ctx.scale(e.attackDir,1);
  const g = gradient(0,0,reach,0,[[0,'#f2644333'],[.65,'#ff7f5526'],[1,'#ff7f5500']]);
  poly([[-5,0],[reach,0],[reach-30,-13],[10,-13]],g);
  line(0,1,reach*t,1,'#ef916f',1.3);
  for(let i=35;i<reach;i+=36) { ctx.globalAlpha=.18+t*.25; poly([[i,-8],[i+7,-4],[i,0]],'#f7a17c'); }
  ctx.globalAlpha=1;
  const y = e.leg?-123:-98;
  ctx.strokeStyle = '#fa956d'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.arc(0,y,13,-Math.PI/2,-Math.PI/2+TAU*t); ctx.stroke();
  ctx.fillStyle = t>.75?'#ffd2a0':'#e88e69'; ctx.font='bold 17px sans-serif'; ctx.textAlign='center'; ctx.fillText('!',0,y+6);
  if(t>.82) { line(-19,y, -14,y,'#ffcbaa',1); line(14,y,19,y,'#ffcbaa',1); }
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = gradient(0,0,0,H,[[0,'#172b34'],[.45,'#385255'],[.8,'#65776b'],[1,'#283b3b']]); ctx.fillRect(0,0,W,H);
  const sunX = 950 - camera.x*.12;
  const glow = ctx.createRadialGradient(sunX,183,15,sunX,183,380); glow.addColorStop(0,'#d6bc793d'); glow.addColorStop(.4,'#b9b27e16'); glow.addColorStop(1,'#789b8b00'); ctx.fillStyle=glow; ctx.fillRect(0,0,W,570);
  circle(sunX,181,46,'#c8bc8d38'); circle(sunX,181,40,'#c0b68d12');
  // Distant foundry silhouettes, deliberately low contrast.
  ctx.save(); ctx.translate(-camera.x*.16,0);
  for(let i=-2;i<16;i++) {
    const x=i*170, h=120+seeded(i+40)*180, y=440-h;
    ctx.fillStyle='#273e45'; ctx.fillRect(x,y,100+seeded(i)*70,h);
    poly([[x-8,y],[x+25,y-20],[x+85,y-20],[x+114,y]],'#2a4147');
    ctx.fillStyle='#2a4147'; ctx.fillRect(x+30,y-60,15,60); ctx.fillRect(x+36,y-63,29,7);
    line(x+12,y+15,x+12,436,'#59706a22',1);
    for(let k=0;k<3;k++) { ctx.fillStyle='#aaad7b16'; ctx.fillRect(x+25+k*24,y+40,6,13); }
  }
  line(-300,365,3400,365,'#223d44',12); line(-300,348,3400,348,'#45615e',2);
  for(let i=0;i<30;i++) line(i*100,349,i*100,366,'#29434a',3);
  ctx.restore();
  ctx.save(); ctx.translate(-camera.x*.43,0);
  // Broken industrial nave and the sealed rotary furnace.
  const ringX=1420;
  ctx.save(); ctx.translate(ringX,322);
  circle(0,0,195,'#243c4088');
  for(const [r,c,w] of [[194,'#6b7a681f',16],[170,'#a7a28225',3],[153,'#1b343b88',18],[140,'#89968030',2],[112,'#687e7430',1]]) {ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();}
  for(let i=0;i<24;i++) { const a=i*TAU/24; line(Math.cos(a)*159,Math.sin(a)*159,Math.cos(a)*178,Math.sin(a)*178,'#a3a08030',i%3===0?7:2); }
  poly([[-32,-80],[32,-80],[54,20],[0,72],[-54,20]],'#223b4099','#b3ad7629',2);
  line(-62,0,62,0,'#d8b67532',1); line(0,-100,0,95,'#d8b67528',1);
  ctx.font='13px FoundryCJK, serif';ctx.textAlign='center';ctx.fillStyle='#c0b47b40';ctx.fillText('余 烬',0,116);ctx.restore();
  for(let i=-1;i<9;i++) {
    const x=i*375+60;
    ctx.fillStyle='#20373d'; ctx.fillRect(x,0,28,512); ctx.fillRect(x-13,479,54,38);
    poly([[x-9,0],[x+38,0],[x+30,74],[x+11,105],[x-1,74]],'#223a41');
    line(x+29,110,x+150,0,'#1c333a',15); line(x+3,110,x-110,0,'#1c333a',15);
    line(x+5,0,x+5,475,'#76867a30',2); line(x+28,0,x+28,475,'#102b34',4);
    ctx.fillStyle='#58716b'; ctx.fillRect(x+5,188,18,5); ctx.fillRect(x+5,194,18,3);
    for(let j=0;j<4;j++) line(x+5,210+j*16,x+20,210+j*16,'#82907a25',1);
  }
  ctx.strokeStyle='#1a3038';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-100,76);ctx.bezierCurveTo(500,177,850,132,1320,70);ctx.bezierCurveTo(1840,168,2360,70,3000,120);ctx.stroke();
  for(const x of [420,1120,1900,2500]) {
    line(x,0,x,215,'#122e36',2); ctx.fillStyle='#263d41';ctx.fillRect(x-14,211,28,8);poly([[x-15,219],[x+15,219],[x+9,233],[x-9,233]],'#bca67588');
    const lg=ctx.createRadialGradient(x,230,2,x,230,90);lg.addColorStop(0,'#e9c58020');lg.addColorStop(1,'#d2b88000');ctx.fillStyle=lg;ctx.fillRect(x-90,140,180,180);
  }
  ctx.restore();
  // Air shafts are confined to the background, never obscuring combat.
  ctx.save();ctx.globalCompositeOperation='screen';
  poly([[W*.6-150,0],[W*.6-60,0],[W*.6+110,500],[W*.6-140,500]],'#b7c39506');
  poly([[W*.27,0],[W*.27+40,0],[W*.27-160,490],[W*.27-290,490]],'#dfce9405');ctx.restore();
  ctx.save();ctx.translate(-camera.x*.72,0);
  for(let i=-1;i<12;i++) {
    const x=i*290+90;
    ctx.fillStyle='#2d4444';ctx.fillRect(x,444,165,64);ctx.fillStyle='#344b49';ctx.fillRect(x-4,440,174,7);
    for(let k=0;k<6;k++){ctx.fillStyle='#172f36';ctx.fillRect(x+12+k*25,455,12,40);line(x+13+k*25,456,x+13+k*25,494,'#52675b55',1);}
    line(x+25,424,x+25,442,'#263e43',3);line(x+135,424,x+135,442,'#263e43',3);line(x+20,424,x+140,424,'#344c4b',4);
  }
  ctx.restore();
  const fog=gradient(0,395,0,555,[[0,'#82977a00'],[1,'#b5b48a15']]);ctx.fillStyle=fog;ctx.fillRect(0,395,W,160);
}
function drawArena() {
  ctx.save();ctx.translate(-camera.x,0);
  // Ground surface and bolted, sloping metal fascia.
  ctx.fillStyle='#1a3036';ctx.fillRect(-100,FLOOR,WORLD+200,190);
  poly([[-100,FLOOR-8],[WORLD+100,FLOOR-8],[WORLD+100,FLOOR+9],[-100,FLOOR+9]],'#697669');
  line(-100,FLOOR-8,WORLD+100,FLOOR-8,'#b9ba9388',2);line(-100,FLOOR+6,WORLD+100,FLOOR+6,'#142c32',4);
  ctx.fillStyle=gradient(0,FLOOR+8,0,720,[[0,'#263d40'],[.6,'#142a32'],[1,'#0e2029']]);ctx.fillRect(-100,FLOOR+8,WORLD+200,200);
  for(let i=-1;i<27;i++) {
    const x=i*120;
    line(x,FLOOR-7,x-12,FLOOR+3,'#283d3f',2);
    poly([[x+3,FLOOR+17],[x+107,FLOOR+17],[x+100,FLOOR+88],[x-4,FLOOR+88]],'#223b3f','#49605644',1);
    line(x+9,FLOOR+21,x+100,FLOOR+21,'#5b6e5d55',1);
    circle(x+10,FLOOR+27,2,'#7d826a');circle(x+96,FLOOR+27,2,'#7d826a');circle(x+1,FLOOR+77,2,'#112930');circle(x+89,FLOOR+77,2,'#112930');
    for(let k=0;k<5;k++) line(x+23+k*13,FLOOR+40,x+18+k*13,FLOOR+65,'#102a32',4);
    if(i%4===1) {
      ctx.save();ctx.globalAlpha=.38;for(let k=0;k<4;k++)poly([[x+28+k*12,FLOOR-6],[x+35+k*12,FLOOR-6],[x+30+k*12,FLOOR+1],[x+23+k*12,FLOOR+1]],'#d0ac6f');ctx.restore();
    }
  }
  // Rail-end pylons anchor the navigable arena.
  for(const x of [34,WORLD-34]) {
    ctx.fillStyle='#263e42';ctx.fillRect(x-20,FLOOR-111,40,111);poly([[x-25,FLOOR-114],[x+25,FLOOR-114],[x+17,FLOOR-101],[x-17,FLOOR-101]],'#8d8b6b');
    ctx.fillStyle='#142e35';ctx.fillRect(x-11,FLOOR-90,22,70);line(x-5,FLOOR-80,x-5,FLOOR-35,'#da9d62',3);
  }
  ctx.textAlign='left';ctx.font='10px monospace';ctx.fillStyle='#a2a08755';ctx.fillText('F O U N D R Y   /   S E C T O R   0 7',1140,FLOOR+120);
  // World markings make displacement and knockback immediately legible.
  for(let i=0;i<10;i++){const x=190+i*285;ctx.fillStyle='#a5a77f33';ctx.font='8px monospace';ctx.fillText(String(i+1).padStart(2,'0')+' //',x,FLOOR-14);}
  ctx.restore();
}
function drawDebris(d) {
  ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.r);ctx.globalAlpha=Math.min(1,d.life/1.5);
  const [a,b,c]=d.points;segment(a,b,d.type==='arm'?17:18,d.color);circle(...b,5,'#2b4243');segment(b,c,15,d.color);circle(...a,4,'#d29160');
  if(d.weapon) sword(c,-.1,'lancer'); else if(d.type==='arm') sword(c,.7,'reaver');
  else poly([[c[0]-7,c[1]-5],[c[0]+13,c[1]-3],[c[0]+15,c[1]+4],[c[0]-8,c[1]+4]],d.color,'#1e343a',1);
  ctx.restore();
}
function drawSlash(s) {
  const t=1-s.life/s.max;ctx.save();ctx.translate(s.x,s.y);ctx.scale(s.dir,1);ctx.globalAlpha=Math.pow(1-t,.7);
  if(s.kind==='impact') {
    ctx.rotate(s.angle);poly([[-s.size*.8,-1],[-5,-4],[0,-s.size*.4],[4,-4],[s.size,0],[5,3],[0,s.size*.3],[-4,3]],'#ffe7b4');
    line(-s.size*1.3,0,s.size*1.4,0,'#fff8da',1.2);
  } else if(s.kind==='ground') {
    ctx.strokeStyle='#c6e6d1';ctx.lineWidth=2*(1-t);ctx.beginPath();ctx.ellipse(0,0,s.size*t,12*t,0,Math.PI,TAU);ctx.stroke();
    for(let i=0;i<7;i++) {const x=(i-3)*27*t;line(x,0,x*1.2,-(1-t)*22*(1-Math.abs(i-3)/5),'#e6d1a44d',2);}
  } else {
    const heavy=s.kind==='charged'||s.kind==='heavy'||s.kind==='cut3'||s.kind==='slam';
    const enemy=s.kind==='enemy',lift=s.kind==='lift';
    const r=s.size*(.68+t*.16),start=lift?.7:s.kind==='cut2'||s.kind==='air2'?-.2:-1.7,end=lift?-1.9:s.kind==='cut2'||s.kind==='air2'?-2.1:.9;
    const rev=end<start, a0=lerp(start,end,t*.42),a1=lerp(start,end,Math.min(1,.65+t*.6));
    ctx.strokeStyle=enemy?'#ff98795c':heavy?'#fbe1adbb':'#daf3dfba';ctx.lineWidth=heavy?13:8;ctx.beginPath();ctx.ellipse(0,0,r,r*.76,heavy?.15:0,a0,a1,rev);ctx.stroke();
    ctx.strokeStyle=enemy?'#ffb18a':'#fbffdf';ctx.lineWidth=heavy?2.4:1.5;ctx.beginPath();ctx.ellipse(0,0,r+4,r*.76+3,heavy?.15:0,a0,a1,rev);ctx.stroke();
    ctx.strokeStyle=enemy?'#ee856833':'#84c6bd38';ctx.lineWidth=heavy?23:15;ctx.beginPath();ctx.ellipse(0,0,r-12,r*.76-9,heavy?.15:0,a0,a1,rev);ctx.stroke();
    if(heavy) {ctx.strokeStyle='#f5d8a477';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,r+13,r*.76+11,.15,a0+.1,a1,rev);ctx.stroke();}
  }
  ctx.restore();
}
function drawEffects() {
  for(const s of slashes) drawSlash(s);
  ctx.save();
  for(const p of particles) {
    ctx.globalAlpha=Math.min(1,p.life/p.max*2);
    if(p.kind==='spark'){line(p.x,p.y,p.x-p.vx*.023,p.y-p.vy*.023,p.color,p.size);}
    else if(p.kind==='star'){const r=p.size*(.6+p.life/p.max*.4);poly([[p.x-r,p.y],[p.x-3,p.y-3],[p.x,p.y-r*.55],[p.x+3,p.y-3],[p.x+r,p.y],[p.x+3,p.y+3],[p.x,p.y+r*.55],[p.x-3,p.y+3]],p.color);}
    else {ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}
  }
  ctx.restore();
  for(const t of texts) {ctx.globalAlpha=Math.min(1,t.life/.18);ctx.font=t.size+'px FoundryCJK, sans-serif';ctx.textAlign='center';ctx.fillStyle='#10232b';ctx.fillText(t.text,t.x+1,t.y+1);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
}
function drawAmbient() {
  ctx.save();
  for(let i=0;i<54;i++) {
    const depth=seeded(i+100),speed=7+depth*17;
    const x=((seeded(i+8)*3300+worldTime*speed-camera.x*(.25+depth*.65))%(W+150)+W+150)%(W+150)-75;
    const y=65+((seeded(i+5)*440-worldTime*(3+depth*8))%440+440)%440;
    ctx.globalAlpha=(.1+depth*.25)*(.6+.4*Math.sin(worldTime+i));
    ctx.fillStyle=i%5===0?'#e3b77b':'#b4c3a3';ctx.fillRect(x,y,depth> .6?2:1,depth>.6?2:1);
  }
  ctx.restore();
}
function render() {
  ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
  ctx.save();
  const sx=shake>.1?Math.sin(now*171)*shake:0,sy=shake>.1?Math.cos(now*139)*shake*.55:0;
  ctx.translate(sx,sy);drawBackground();drawArena();drawAmbient();
  ctx.save();ctx.translate(-camera.x,0);drawSkillUnderlay();
  for(const e of enemies) if(!e.dead) {const h=clamp(1-(FLOOR-e.y)/340,.2,1);ellipse(e.x,FLOOR+1,31*h,6*h,'#0b202951');drawTelegraph(e);}
  ellipse(player.x,FLOOR+2,29*clamp(1-(FLOOR-player.y)/400,.2,1),6,'#091c276e');
  for(const d of debris) if(d.y>FLOOR-20) drawDebris(d);
  for(const e of enemies) if(e.dead) drawEnemy(e);
  for(const g of ghosts) {ctx.save();ctx.globalAlpha=g.life/g.max*.25;const ox=player.x,oy=player.y,od=player.dir;player.x=g.x;player.y=g.y;player.dir=g.dir;drawPlayer(g.pose,true);player.x=ox;player.y=oy;player.dir=od;ctx.restore();}
  for(const e of enemies) if(!e.dead) drawEnemy(e);
  ctx.save();if(player.invuln>0&&player.action!=='dash'&&player.action!=='skill'&&!player.dead)ctx.globalAlpha=.6+Math.sin(now*50)*.25;drawPlayer();ctx.restore();
  for(const d of debris) if(d.y<=FLOOR-20) drawDebris(d);
  drawSkillForeground();drawEffects();ctx.restore();ctx.restore();
  // A thin cinematic edge frames the arena without restricting the viewport.
  ctx.fillStyle='#0a1924';ctx.fillRect(0,0,W,4);ctx.fillRect(0,H-4,W,4);
}
let last = performance.now(), hudTick = 0;
function frame(ts) {
  const raw = clamp((ts-last)/1000,0,.05); last=ts; now+=raw;
  const steps=Math.max(1,Math.ceil(raw/(1/120))),dt=raw/steps;
  for(let i=0;i<steps;i++)update(dt);
  render();hudTick+=raw;if(hudTick>.05){updateHUD();hudTick=0;}
  frameCost=performance.now()-ts;requestAnimationFrame(frame);
}
resize();reset(false);camera.x=clamp(player.x-W*.64,0,WORLD-W);requestAnimationFrame(frame);
