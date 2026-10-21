// ============================================================
// game.js — 编排：输入 / 相机 / 波次 / 战斗判定 / 渲染 / HUD
// ============================================================
const SFX = new Sfx();
const BASE_ZOOM = 1.3;   // 基础镜头放大，让角色更大更醒目

const G = {
  booted: false,
  state: 'menu',            // menu | playing | dead
  time: 0,
  freeze: 0,                // 命中顿帧
  slow: 0, slowScale: 1,    // 击杀慢动作
  trauma: 0, punch: 0,
  cam: { x: WORLD_W / 2, y: 336 },
  shX: 0, shY: 0,
  keys: {}, press: {},
  player: null,
  enemies: [], needles: [], shocks: [],
  pending: [], spawnT: 0, maxAlive: 4,
  wave: 0, waveActive: false, interT: 0.6,
  combo: 0, comboT: 0, comboPop: 0,
  hpLag: 100, hurtFlash: 0, fade: 1,
  banner: { main: '', sub: '', t: 99, dur: 1 },
  stats: { hits: 0, limbs: 0, kills: 0, maxCombo: 0, skillUses: { strings: 0, blink: 0, wave: 0, ult: 0 } },
  energy: 0, skillFx: [], crescents: [], ultFx: null, skillFlash: {}, gaugeDeny: 0,
  deadShown: false,
};

// ---------- 输入 ----------
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  KeyJ: 'j', KeyK: 'k', KeyL: 'l', KeyI: 'i',
  KeyU: 'u', KeyO: 'o', KeyP: 'p', KeyH: 'h',
};
const GAME_CODES = new Set(Object.keys(KEYMAP).concat(['ArrowDown', 'KeyS', 'KeyR', 'Enter', 'KeyM', 'KeyN'])); // KEYMAP 已含 U/O/P/H

function onKey(e, down) {
  if (GAME_CODES.has(e.code)) { if (e.preventDefault) e.preventDefault(); }
  SFX.ensure();
  if (down && e.repeat) return;
  const a = KEYMAP[e.code];
  if (a) {
    G.keys[a] = down;
    if (down) G.press[a] = G.time;
    if (a === 'k' && !down) G.keys.k = false;
  }
  if (!down) return;
  if (e.code === 'Enter') {
    if (G.state === 'menu') startGame();
    else if (G.state === 'dead') restartGame();
  } else if (e.code === 'KeyR') {
    if (G.state !== 'menu') restartGame();
    else startGame();
  } else if (e.code === 'KeyM') {
    toggleMute();
  }
}
function clearKeys() {
  G.keys = {}; G.press = {};
  if (G.player) G.player.onBlur();
}

// ---------- 流程 ----------
function startGame() {
  if (G.state === 'playing') return;
  SFX.ensure(); SFX.uiStart();
  resetRun();
  G.state = 'playing';
  UI.startOverlay.classList.add('hidden');
  UI.deadOverlay.classList.add('hidden');
}
function restartGame() {
  SFX.ensure(); SFX.uiStart();
  resetRun();
  G.state = 'playing';
  UI.deadOverlay.classList.add('hidden');
  UI.startOverlay.classList.add('hidden');
}
function resetRun() {
  G.player.reset();
  G.enemies.length = 0; G.needles.length = 0; G.shocks.length = 0;
  G.pending.length = 0;
  FX.reset();
  G.wave = 0; G.waveActive = false; G.interT = 0.45;
  G.combo = 0; G.comboT = 0; G.hpLag = 100; G.hurtFlash = 0;
  G.stats = { hits: 0, limbs: 0, kills: 0, maxCombo: 0, skillUses: { strings: 0, blink: 0, wave: 0, ult: 0 } };
  G.energy = 0; G.skillFx.length = 0; G.crescents.length = 0; G.ultFx = null; G.skillFlash = {}; G.gaugeDeny = 0;
  G.freeze = 0; G.slow = 0; G.trauma = 0; G.punch = 0;
  G.cam.x = G.player.x; G.deadShown = false;
  G.banner.t = 99;
}
function showDeath() {
  G.state = 'dead';
  UI.deadStats.textContent = `击破 ${G.stats.kills} · 最高连击 ${G.stats.maxCombo} · 断肢 ${G.stats.limbs} · 止步第 ${cnWave(G.wave)} 幕`;
  UI.deadOverlay.classList.remove('hidden');
}
function toggleMute() {
  SFX.ensure();
  SFX.setMuted(!SFX.muted);
  UI.muteBtn.textContent = SFX.muted ? '声音：关' : '声音：开';
}

// ---------- 波次 ----------
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnWave(n) { return n <= 10 ? (CN_NUM[n - 1] || n) : n; }

function nextWave() {
  G.wave++;
  G.waveActive = true;
  G.spawnT = 0.35;
  G.maxAlive = Math.min(3 + Math.floor(G.wave / 3), 6);
  const n = G.wave;
  const list = [];
  const grunts = 2 + Math.floor(n / 2);
  const throwers = n >= 2 ? Math.min(2, Math.floor(n / 2)) : 0;
  const heavies = n >= 3 ? Math.min(3, 1 + Math.floor((n - 3) / 2)) : 0;
  for (let i = 0; i < grunts; i++) list.push('grunt');
  for (let i = 0; i < throwers; i++) list.push('thrower');
  for (let i = 0; i < heavies; i++) list.push('heavy');
  // 打乱
  for (let i = list.length - 1; i > 0; i--) { const j = randi(0, i); [list[i], list[j]] = [list[j], list[i]]; }
  G.pending = list.map(type => ({ type }));
  banner(`第 ${cnWave(n)} 幕`, n === 1 ? '傀儡登场 · 斩碎它们' : `${list.length} 具傀儡`);
  SFX.wave();
}
function spawnEnemy(type) {
  const p = G.player;
  let x = 0;
  for (let i = 0; i < 12; i++) {
    const side = p.x < WORLD_W / 2 ? 1 : -1;
    x = clamp(p.x + side * rand(260, 560) + rand(-120, 120), 90, WORLD_W - 90);
    if (Math.abs(x - p.x) > 220) break;
  }
  G.enemies.push(new Enemy(G, type, x));
}
function waveLogic(dt) {
  const g = G;
  if (!g.player.alive) return;
  if (g.waveActive) {
    if (g.pending.length && g.spawnT <= 0 && g.enemies.length < g.maxAlive) {
      spawnEnemy(g.pending.shift().type);
      g.spawnT = rand(0.5, 1.1);
    }
    g.spawnT -= dt;
    if (!g.pending.length && g.enemies.length === 0) {
      g.waveActive = false;
      g.interT = 1.7;
      if (g.player.hp > 0) {
        g.player.hp = Math.min(g.player.maxhp, g.player.hp + 16);
        SFX.heal();
        banner('幕 间', '生命恢复 +16');
      }
    }
  } else {
    g.interT -= dt;
    if (g.interT <= 0) nextWave();
  }
}
function banner(main, sub, dur = 1.6) { G.banner = { main, sub: sub || '', t: 0, dur }; }

// ---------- 战斗判定 ----------
function nearestEnemy(x, maxD) {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = dist2(x, 0, e.x, 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function bladeHitTest(bl, e) {
  let best = null;
  for (const c of e.sk.circles) {
    if (c.part && c.part !== 'torso' && !e.parts[c.part].on) continue;
    const cp = closestOnSeg(bl.bx, bl.by, bl.tx, bl.ty, c.x, c.y);
    const d2v = dist2(cp[0], cp[1], c.x, c.y);
    const rr = c.r + 4;
    if (d2v < rr * rr && (!best || d2v < best.d2)) best = { part: c.part, x: cp[0], y: cp[1], d2: d2v };
  }
  return best;
}
function playerCombat() {
  const p = G.player;
  if (p.state !== 'atk' || !p.sk || !p.sk.blade) return;
  const def = p.atkDef(); if (!def) return;
  const t = p.atkT / def.dur;
  if (t < def.a0 || t > def.a1) return;
  const bl = p.sk.blade;
  // 判定段向刀柄方向延伸，覆盖贴身范围
  const dx = bl.tx - bl.bx, dy = bl.ty - bl.by;
  const L = Math.hypot(dx, dy) || 1;
  const bl2 = { bx: bl.bx - dx / L * 30, by: bl.by - dy / L * 30, tx: bl.tx, ty: bl.ty };
  for (const e of G.enemies) {
    if (!e.alive || p.hitIds.has(e.id)) continue;
    if (!e.sk) continue;
    const res = bladeHitTest(bl2, e);
    if (res) {
      p.hitIds.add(e.id);
      p.swingHit = true;
      hitEnemy(e, res, def, p);
    }
  }
  // 斩落飞针
  for (const n of G.needles) {
    if (n.dead) continue;
    if (segHit(bl2.bx, bl2.by, bl2.tx, bl2.ty, n.x, n.y, 10)) {
      n.dead = true;
      FX.spark(n.x, n.y, 6, sign(n.vx), 0.8, '#dfeaf2', 240);
      FX.flash(n.x, n.y, 8, 0.07, '#fff');
      SFX.tick();
    }
  }
}
function hitEnemy(e, res, def, src) {
  if (!e.alive) return;
  const dir = res.dir || src.facing;
  const airborne = e.airborne;
  let dmg = def.dmg;
  if (airborne) dmg *= Math.pow(0.88, e.juggle);
  if (!e.parts.legF.on && !e.parts.legB.on) dmg *= 1.15;
  e.hp -= dmg;
  e.hitFlash = 0.09;
  G.stats.hits++;
  // 肢体伤害
  let broke = false;
  const part = res.part;
  if (part && part !== 'torso') {
    if (def.forceBreak) {
      if (e.parts[part].on) broke = e.breakPart(part, dir);
    } else if (def.forcePart && chance(def.forcePart)) {
      broke = e.breakPart(part, dir);
    } else {
      const pp = e.parts[part];
      if (pp.on) {
        pp.hp -= def.dmg * (def.part || 0.6) * (part === 'head' ? 0.85 : 1);
        if (pp.hp <= 0) broke = e.breakPart(part, dir);
      }
    }
  } else {
    // 躯干命中：溅射最近肢体
    let nearest = null, nd = 1e9;
    for (const k of ['head', 'armF', 'armB', 'legF', 'legB']) {
      const pp = e.parts[k]; if (!pp.on) continue;
      const c = e.sk.circles.find(c => c.part === k);
      if (!c) continue;
      const d = dist2(c.x, c.y, res.x, res.y);
      if (d < nd) { nd = d; nearest = k; }
    }
    if (nearest) {
      const pp = e.parts[nearest];
      pp.hp -= def.dmg * (def.part || 0.6) * 0.5;
      if (pp.hp <= 0) broke = e.breakPart(nearest, dir);
    }
  }
  // 打击特效
  const w = def.w;
  FX.flash(res.x, res.y, 9 + w * 5, 0.08, '#ffffff');
  FX.spark(res.x, res.y, 4 + w * 3, dir, 0.9, w >= 2 ? '#ffe9b0' : '#ffd98a', 280 + w * 130);
  FX.ring(res.x, res.y, 3, 20 + w * 16, 0.16, w >= 2 ? '#ffe9b0' : '#ffffff', 2);
  if (w >= 2) FX.lines(res.x, res.y, dir, 3 + w * 2);
  if (broke) FX.chips(res.x, res.y, 6, null, 320);
  G.freeze = Math.max(G.freeze, def.ks + (broke ? 0.045 : 0));
  G.trauma = Math.min(1, G.trauma + def.shake + (broke ? 0.08 : 0));
  G.punch = Math.max(G.punch, def.punch || 0);
  SFX.hit(w);
  // 连击与丝线能量
  G.combo++;
  G.comboT = 2.2;
  G.comboPop = 1;
  G.stats.maxCombo = Math.max(G.stats.maxCombo, G.combo);
  G.gainEnergy(3, res.x, res.y);
  // 受击反应
  if (e.hp <= 0) {
    e.die(dir);
  } else {
    e.hitReact({ dir, def, dmg, launch: def.launch, slam: def.slam });
  }
}
function onSlamLand(x, dir, enemy) {
  FX.ring(x, GROUND_Y - 4, 8, 70, 0.3, '#ffd98a', 3);
  FX.dust(x, GROUND_Y, 12, 150);
  FX.chips(x, GROUND_Y - 6, 8, null, 240);
  G.trauma = Math.min(1, G.trauma + (enemy ? 0.34 : 0.24));
  G.freeze = Math.max(G.freeze, enemy ? 0.08 : 0.05);
  SFX.hit(3);
}
G.onSlamLand = onSlamLand;
G.nearestEnemy = nearestEnemy;
G.onEnemyDeath = function () {};
G.onPlayerHurt = function (dir) {
  G.hurtFlash = 0.55;
  G.trauma = Math.min(1, G.trauma + 0.32);
  G.freeze = Math.max(G.freeze, 0.055);
  G.combo = 0;
  SFX.hurt();
  FX.spark(G.player.x, G.player.y - 34, 8, -dir, 0.9, '#ff8a7a', 260);
};
G.onPlayerDeath = function () {
  G.slow = 0.3; G.slowScale = 0.35;
  G.trauma = 1;
  SFX.kill();
};

// ---------- 弹幕与冲击波 ----------
function updateNeedles(dt) {
  const p = G.player;
  for (const n of G.needles) {
    if (n.dead) continue;
    n.x += n.vx * dt; n.y += n.vy * dt; n.life -= dt;
    if (n.life <= 0 || n.y > GROUND_Y - 2 || n.x < 20 || n.x > WORLD_W - 20) {
      n.dead = true;
      FX.dust(n.x, Math.min(n.y, GROUND_Y), 2, 40);
      continue;
    }
    if (p.alive && p.sk) {
      for (const c of p.sk.circles) {
        const rr = c.r + 5;
        if (dist2(n.x, n.y, c.x, c.y) < rr * rr) {
          if (p.takeHit(TYPES.thrower.needleDmg, sign(n.vx) || 1)) {
            n.dead = true;
            FX.spark(n.x, n.y, 5, sign(n.vx), 0.7, '#dfeaf2', 200);
          }
          break;
        }
      }
    }
  }
  G.needles = G.needles.filter(n => !n.dead);
}
function updateShocks(dt) {
  const p = G.player;
  for (const s of G.shocks) {
    s.x += s.dir * s.spd * dt;
    s.life -= dt;
    if (chance(dt * 30)) FX.dust(s.x, GROUND_Y - 2, 1, 40);
    if (p.alive && p.onGround && Math.abs(p.x - s.x) < 30) {
      if (p.takeHit(TYPES.heavy.shockDmg, s.dir)) s.life = 0;
    }
  }
  G.shocks = G.shocks.filter(s => s.life > 0 && s.x > 30 && s.x < WORLD_W - 30);
}
G.spawnShock = function (x, dir) {
  G.shocks.push({ x, dir, spd: 430, life: 1.6 });
  FX.dust(x, GROUND_Y - 4, 8, 120);
  FX.chips(x, GROUND_Y - 4, 6, null, 260);
  SFX.hit(2);
};

// ---------- 丝线能量与四大技能 ----------
G.gainEnergy = function (n, x, y) {
  G.energy = clamp(G.energy + n, 0, 100);
  if (x !== undefined) for (let i = 0; i < 2; i++) {
    FX.ps.push({ t: 'mote', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-30, 30), vy: rand(-160, -90), life: rand(0.35, 0.6), max: 0.6, w: rand(1.5, 2.6) });
  }
};
G.denySkill = function (slot, reason) {
  G.gaugeDeny = 0.35;
  SFX.deny();
};
G.onSkillCast = function (name) {
  G.skillFlash[name] = 0.45;
  if (name === 'strings') SFX.strings(false);
  else if (name === 'blink') SFX.blink();
  else if (name === 'wave') SFX.wave();
  else if (name === 'ult') {
    SFX.ultRiser();
    G.slow = Math.max(G.slow, 0.75); G.slowScale = 0.5;
    G.ultFx = { t: 0, dur: 1.7, burst: false };
  }
};
G.skillStringsTick = function (final) {
  const p = G.player;
  const R = final ? 215 : 175;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    if (Math.abs(dx) < R + 24 && Math.abs((e.y - 30 * e.scale) - (p.y - 34)) < 150) {
      const chest = e.sk ? e.sk.chest : [e.x, e.y - 30 * e.scale];
      hitEnemy(e, { part: 'torso', x: chest[0], y: chest[1], dir: sign(dx) || p.facing }, final ? SKD_HIT.str3 : SKD_HIT.str1, p);
    }
  }
  FX.ring(p.x, p.y - 30, 24, R, final ? 0.3 : 0.22, final ? '#ffe9b0' : '#ffd98a', final ? 3 : 2);
  G.skillFx.push({ type: 'spokes', x: p.x, y: p.y - 30, t: 0, dur: 0.32, r: R });
  SFX.strings(final);
  if (final) G.trauma = Math.min(1, G.trauma + 0.22);
};
G.skillShadowBlink = function (final) {
  const p = G.player;
  FX.ghost(p);
  let tgt = null, bd = 470 * 470;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d < bd) { bd = d; tgt = e; }
  }
  if (tgt) {
    const nx = clamp(tgt.x - tgt.facing * 26, 60, WORLD_W - 60);
    p.x = nx;
    p.y = tgt.airborne ? tgt.y : GROUND_Y - FOOT;
    p.onGround = !tgt.airborne; p.vy = 0;
    p.facing = sign(tgt.x - nx) || 1;
    G.cam.x += (clamp(p.x + p.facing * 46, VIEW_W / (2 * BASE_ZOOM) - 30, WORLD_W - VIEW_W / (2 * BASE_ZOOM) + 30) - G.cam.x) * 0.6;
    FX.ghost(p);
    const chest = tgt.sk ? tgt.sk.chest : [tgt.x, tgt.y - 30 * tgt.scale];
    hitEnemy(tgt, { part: 'torso', x: chest[0], y: chest[1], dir: p.facing }, final ? SKD_HIT.blinkEnd : SKD_HIT.blink, p);
    SFX.blink();
  } else {
    p.x = clamp(p.x + p.facing * 170, 60, WORLD_W - 60);
    FX.dust(p.x, GROUND_Y, 4, 60);
    SFX.dash();
  }
};
G.skillCrescent = function () {
  const p = G.player;
  G.crescents.push({ x: p.x + p.facing * 46, y: p.y - 36, vx: p.facing * 790, life: 1.05, hit: {} });
  SFX.wave();
  G.trauma = Math.min(1, G.trauma + 0.12);
  G.freeze = Math.max(G.freeze, 0.05);
};
G.ultBurst = function () {
  const p = G.player;
  SFX.ultBoom();
  G.freeze = Math.max(G.freeze, 0.16);
  G.trauma = 1;
  G.punch = Math.max(G.punch, 0.06);
  G.slow = 0.2; G.slowScale = 0.35;
  if (G.ultFx) { G.ultFx.burst = true; G.ultFx.t = 0; }
  FX.ring(p.x, p.y - 30, 30, 640, 0.5, '#ffe9b0', 4);
  FX.flash(p.x, p.y - 30, 90, 0.2, '#fff2d8');
  FX.lines(p.x, p.y - 30, 1, 10); FX.lines(p.x, p.y - 30, -1, 10);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const aliveParts = ['head', 'armF', 'armB', 'legF', 'legB'].filter(k => e.parts[k].on);
    for (let i = 0; i < 2 && aliveParts.length; i++) {
      const k = aliveParts.splice(randi(0, aliveParts.length - 1), 1)[0];
      e.breakPart(k, sign(e.x - p.x) || 1);
    }
    if (!e.alive) continue;
    const chest = e.sk ? e.sk.chest : [e.x, e.y - 30 * e.scale];
    FX.lines(chest[0], chest[1], sign(e.x - p.x) || 1, 8);
    hitEnemy(e, { part: 'torso', x: chest[0], y: chest[1], dir: sign(e.x - p.x) || 1 }, SKD_HIT.ult, p);
  }
};
function updateSkillFx(dt) {
  for (let i = G.skillFx.length - 1; i >= 0; i--) {
    const sf = G.skillFx[i];
    sf.t += dt;
    if (sf.t >= sf.dur) G.skillFx.splice(i, 1);
  }
  for (const k in G.skillFlash) if (G.skillFlash[k] > 0) G.skillFlash[k] -= dt;
  if (G.gaugeDeny > 0) G.gaugeDeny -= dt;
  if (G.ultFx) { G.ultFx.t += Math.max(dt, 0.0001); if (G.ultFx.t > G.ultFx.dur) G.ultFx = null; }
}
function updateCrescents(dt) {
  const p = G.player;
  for (let i = G.crescents.length - 1; i >= 0; i--) {
    const c = G.crescents[i];
    c.x += c.vx * dt; c.life -= dt;
    if (chance(dt * 22)) FX.ps.push({ t: 'spark', x: c.x - sign(c.vx) * 30, y: c.y + rand(-24, 24), vx: -c.vx * 0.08, vy: rand(-40, 40), life: 0.2, max: 0.2, col: '#8fe3ff', w: 1.6 });
    for (const nd of G.needles) {
      if (!nd.dead && Math.abs(nd.x - c.x) < 46 && Math.abs(nd.y - c.y) < 46) {
        nd.dead = true;
        FX.spark(nd.x, nd.y, 5, sign(c.vx), 0.7, '#dfeaf2', 220);
        SFX.tick();
      }
    }
    for (const e of G.enemies) {
      if (!e.alive || c.hit[e.id]) continue;
      if (Math.abs(e.x - c.x) < 56 && Math.abs((e.y - 30 * e.scale) - c.y) < 110) {
        c.hit[e.id] = 1;
        const chest = e.sk ? e.sk.chest : [e.x, e.y - 30 * e.scale];
        hitEnemy(e, { part: 'torso', x: chest[0], y: chest[1], dir: sign(c.vx) || 1 }, SKD_HIT.wave, p);
      }
    }
    if (c.life <= 0 || c.x < 40 || c.x > WORLD_W - 40) {
      FX.dust(c.x, Math.min(c.y + 30, GROUND_Y), 4, 60);
      G.crescents.splice(i, 1);
    }
  }
}

// ---------- 分离（防止堆叠） ----------
function separation(dt) {
  const arr = G.enemies;
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (a.state === 'descend') continue;
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      if (b.state === 'descend') continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) < 36 && Math.abs(a.y - b.y) < 60) {
        const push = (36 - Math.abs(dx)) * dt * 6;
        const s = sign(dx) || 1;
        a.x -= push * s; b.x += push * s;
      }
    }
    const p = G.player;
    const dx = a.x - p.x;
    if (Math.abs(dx) < 30 && a.onGround && p.onGround) {
      a.x += sign(dx || 1) * 40 * dt;
    }
  }
}

// ---------- 相机 ----------
function updateCamera(rt) {
  const p = G.player;
  const tx = clamp(p.x + p.vx * 0.22 + p.facing * 46, VIEW_W / (2 * BASE_ZOOM) - 30, WORLD_W - VIEW_W / (2 * BASE_ZOOM) + 30);
  const ty = clamp(408 + (p.y - (GROUND_Y - FOOT)) * 0.22, 330, 470);
  const k = Math.min(1, rt * 7);
  G.cam.x += (tx - G.cam.x) * k;
  G.cam.y += (ty - G.cam.y) * k;
  G.trauma = Math.max(0, G.trauma - rt * 1.7);
  const amp = G.trauma * 18;
  G.shX = rand(-1, 1) * amp;
  G.shY = rand(-1, 1) * amp;
  G.punch *= Math.exp(-rt * 7);
}

// ---------- 主更新 ----------
let lastT = 0;
function update(rt) {
  G.time += rt;
  G.banner.t += rt;
  G.fade = Math.max(0, G.fade - rt * 1.6);
  G.hurtFlash -= rt;
  G.comboPop = Math.max(0, G.comboPop - rt * 5);
  G.hpLag += (G.player.hp - G.hpLag) * Math.min(1, rt * 3.5);

  if (G.freeze > 0) G.freeze -= rt;
  if (G.slow > 0) G.slow -= rt;
  const dt = G.freeze > 0 ? 0 : rt * (G.slow > 0 ? G.slowScale : 1);
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

  if (G.state === 'playing') {
    G.player.update(dt);
    if (!G.player.alive && !G.deadShown && G.player.deadT > 1.15) { G.deadShown = true; showDeath(); }
    playerCombat();
    for (const e of G.enemies) e.update(dt);
    separation(dt);
    updateNeedles(dt);
    updateShocks(dt);
    updateCrescents(dt);
    updateSkillFx(dt);
    G.enemies = G.enemies.filter(e => !e.dead);
    waveLogic(dt);
    updateCamera(rt);
    FX.update(G.freeze > 0 ? rt * 0.18 : dt);
    const intensity = clamp(G.enemies.length / 4, 0, 1);
    SFX.updateMusic(true, intensity);
  } else if (G.state === 'dead') {
    G.player.update(dt);
    for (const e of G.enemies) e.update(dt * 0.6);
    updateCamera(rt);
    FX.update(dt);
    SFX.updateMusic(false, 0);
  } else { // menu
    updateCamera(rt);
    FX.update(rt);
    SFX.updateMusic(false, 0);
  }
}

// ============================================================
// 渲染
// ============================================================
let CTX = null, RS = 1;
let LAYERS = null;
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
// 预渲染静态图层：天幕/幕布/包厢/地板/幕柱/追光/暗角/红晕
// 软件渲染环境下把每帧十几万次渐变像素填充降为十余次快速 blit
function buildLayers() {
  const L = {};
  { // 天幕 + 檐口（屏幕固定）
    const c = mkCanvas(VIEW_W, VIEW_H), x = c.getContext('2d');
    const g0 = x.createLinearGradient(0, 0, 0, VIEW_H);
    g0.addColorStop(0, '#150b17'); g0.addColorStop(0.55, '#1d1018'); g0.addColorStop(1, '#0d080e');
    x.fillStyle = g0; x.fillRect(0, 0, VIEW_W, VIEW_H);
    x.fillStyle = '#280d18'; x.fillRect(0, 0, VIEW_W, 34);
    x.fillStyle = '#3e1622';
    for (let i = 0; i < VIEW_W / 64 + 2; i++) { x.beginPath(); x.arc(i * 64 + 32, 34, 30, 0, PI); x.fill(); }
    x.fillStyle = 'rgba(217,164,65,0.25)'; x.fillRect(0, 62, VIEW_W, 2);
    L.sky = c;
    const c2 = mkCanvas(VIEW_W, 70), x2 = c2.getContext('2d');
    x2.fillStyle = '#280d18'; x2.fillRect(0, 0, VIEW_W, 34);
    x2.fillStyle = '#3e1622';
    for (let i = 0; i < VIEW_W / 64 + 2; i++) { x2.beginPath(); x2.arc(i * 64 + 32, 34, 30, 0, PI); x2.fill(); }
    x2.fillStyle = 'rgba(217,164,65,0.25)'; x2.fillRect(0, 62, VIEW_W, 2);
    L.valance = c2;
  }
  { // 远幕布条带（视差 0.35）
    const W = 1800, H = GROUND_Y - 60;
    const c = mkCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#3d1422'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#331019';
    for (let i = -1; i < W / 46 + 2; i++) x.fillRect(i * 46 - 20, 0, 22, H);
    const gg = x.createLinearGradient(0, H - 140, 0, H);
    gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = gg; x.fillRect(0, H - 140, W, 140);
    L.curtain = c;
  }
  { // 包厢条带（视差 0.55）
    const W = 2100;
    const c = mkCanvas(W, 100), x = c.getContext('2d');
    x.fillStyle = '#1a1018'; x.fillRect(0, 12, W, 88);
    x.fillStyle = '#251723';
    for (let i = -1; i < W / 26 + 3; i++) x.fillRect(i * 26 - 12, 32, 5, 62);
    x.fillStyle = '#0f090d'; x.fillRect(0, 16, W, 10);
    L.balcony = c;
  }
  { // 壁灯光晕 sprite
    const c = mkCanvas(140, 140), x = c.getContext('2d');
    const rg = x.createRadialGradient(70, 70, 2, 70, 70, 66);
    rg.addColorStop(0, 'rgba(255,190,110,0.16)'); rg.addColorStop(1, 'rgba(255,190,110,0)');
    x.fillStyle = rg; x.fillRect(0, 0, 140, 140);
    L.sconce = c;
  }
  { // 追光锥 sprite（顶中心锚点，底边接地面）
    const c = mkCanvas(300, 636), x = c.getContext('2d');
    const cone = x.createLinearGradient(0, 0, 0, 636);
    cone.addColorStop(0, 'rgba(255,220,160,0.10)'); cone.addColorStop(1, 'rgba(255,220,160,0.02)');
    x.fillStyle = cone;
    x.beginPath(); x.moveTo(116, 0); x.lineTo(184, 0); x.lineTo(300, 636); x.lineTo(0, 636); x.closePath(); x.fill();
    L.cone = c;
  }
  { // 地面光池 sprite
    const c = mkCanvas(344, 80), x = c.getContext('2d');
    const pool = x.createRadialGradient(172, 40, 6, 172, 40, 170);
    pool.addColorStop(0, 'rgba(255,220,160,0.13)'); pool.addColorStop(1, 'rgba(255,220,160,0)');
    x.save(); x.translate(172, 40); x.scale(1, 0.22); x.translate(-172, -40);
    x.fillStyle = pool; x.beginPath(); x.arc(172, 40, 170, 0, TAU); x.fill();
    x.restore();
    L.pool = c;
  }
  { // 世界静态层：地板 + 木纹 + 台口 + 金线（世界 x 0..2240, y 466..776）
    const Y0 = 466, W = WORLD_W, H = 310;
    const c = mkCanvas(W, H), x = c.getContext('2d');
    x.translate(0, -Y0);
    x.fillStyle = '#3b2b1e'; x.fillRect(0, GROUND_Y, W, 400);
    for (const pl of DECOR.planks) {
      if (pl.shade > 0) x.fillStyle = `rgba(160,118,76,${0.05 + pl.shade * 2.2})`;
      else x.fillStyle = `rgba(0,0,0,${0.16 - pl.shade})`;
      x.fillRect(pl.x, GROUND_Y, 86, 130);
      x.fillStyle = 'rgba(0,0,0,0.4)';
      x.fillRect(pl.x + 84, GROUND_Y, 2, 130);
    }
    const gf = x.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 180);
    gf.addColorStop(0, 'rgba(0,0,0,0)'); gf.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = gf; x.fillRect(0, GROUND_Y, W, 180);
    x.fillStyle = '#551a26'; x.fillRect(0, GROUND_Y + 130, W, 300);
    x.fillStyle = 'rgba(230,180,90,0.55)'; x.fillRect(0, GROUND_Y + 130, W, 2.5);
    x.fillStyle = '#8a6140'; x.fillRect(0, GROUND_Y - 1, W, 3);
    L.floor = { c, y0: Y0 };
  }
  { // 两侧幕柱（世界空间）
    L.curtainEdge = [];
    for (const cx of [46, WORLD_W - 46]) {
      const c = mkCanvas(124, 676), x = c.getContext('2d');
      const grd = x.createLinearGradient(2, 0, 122, 0);
      grd.addColorStop(0, '#4d1626'); grd.addColorStop(0.5, '#6e2436'); grd.addColorStop(1, '#38101d');
      x.fillStyle = grd; x.fillRect(2, 0, 120, 676);
      x.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 5; i++) x.fillRect(12 + i * 24, 0, 8, 676);
      x.fillStyle = '#d9a441'; x.fillRect(2, 340, 120, 6);
      L.curtainEdge.push({ c, x: cx - 62, y: -20 });
    }
  }
  { // 暗角
    const c = mkCanvas(VIEW_W, VIEW_H), x = c.getContext('2d');
    const vg = x.createRadialGradient(VIEW_W / 2, VIEW_H / 2 - 30, 260, VIEW_W / 2, VIEW_H / 2, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    x.fillStyle = vg; x.fillRect(0, 0, VIEW_W, VIEW_H);
    L.vign = c;
  }
  { // 受伤/低血红晕 sprite
    const c = mkCanvas(VIEW_W, VIEW_H), x = c.getContext('2d');
    const hg = x.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 300, VIEW_W / 2, VIEW_H / 2, 740);
    hg.addColorStop(0, 'rgba(180,30,30,0)'); hg.addColorStop(1, 'rgba(180,30,30,1)');
    x.fillStyle = hg; x.fillRect(0, 0, VIEW_W, VIEW_H);
    L.red = c;
  }
  const need = ['sky', 'valance', 'curtain', 'balcony', 'sconce', 'cone', 'pool', 'floor', 'vign', 'red'];
  for (const k of need) {
    if (!L[k]) { // 兜底：缺失图层用透明画布占位，绝不让渲染循环抛错
      const c = mkCanvas(2, 2);
      L[k] = k === 'floor' ? { c, y0: 466 } : c;
    }
  }
  if (!L.curtainEdge) L.curtainEdge = [];
  LAYERS = L;
}
const DECOR = (() => {
  const rng = mulberry32(20240614);
  const planks = [];
  for (let x = 0; x < WORLD_W; x += 88) planks.push({ x, shade: rng() * 0.14 - 0.07 });
  const sconces = [];
  for (let i = 0; i < 6; i++) sconces.push({ x: 260 + i * 380, y: 210 + rng() * 40 });
  const hangers = [];
  for (let i = 0; i < 5; i++) hangers.push({ x: 150 + i * 470 + rng() * 80, y: 96 + rng() * 46, ph: rng() * TAU });
  return { planks, sconces, hangers };
})();

function drawBackground(ctx) {
  const camx = G.cam.x;
  if (LAYERS.sky) ctx.drawImage(LAYERS.sky, 0, 0);
  // 远幕布（视差 0.35）
  const camMin = VIEW_W / (2 * BASE_ZOOM) - 30;
  const sx = clamp((camx - camMin) * 0.35, 0, LAYERS.curtain.width - VIEW_W);
  if (LAYERS.curtain) ctx.drawImage(LAYERS.curtain, sx, 0, VIEW_W, LAYERS.curtain.height, 0, 0, VIEW_W, LAYERS.curtain.height);
  // 包厢（视差 0.55）
  const sx2 = clamp((camx - camMin) * 0.55, 0, LAYERS.balcony.width - VIEW_W);
  if (LAYERS.balcony) ctx.drawImage(LAYERS.balcony, sx2, 0, VIEW_W, LAYERS.balcony.height, 0, 148, VIEW_W, LAYERS.balcony.height);
  // 檐口（最上层）
  if (LAYERS.valance) ctx.drawImage(LAYERS.valance, 0, 0);
  // 壁灯
  for (const s of DECOR.sconces) {
    const sxp = s.x - camx * 0.62 + VIEW_W / 2;
    if (sxp < -80 || sxp > VIEW_W + 80) continue;
    if (LAYERS.sconce) ctx.drawImage(LAYERS.sconce, sxp - 70, s.y - 70);
    ctx.fillStyle = '#ffca7a';
    ctx.beginPath(); ctx.arc(sxp, s.y, 2.6, 0, TAU); ctx.fill();
  }
  // 悬挂的旧傀儡剪影
  for (const h of DECOR.hangers) {
    const hx = h.x - camx * 0.8 + VIEW_W / 2;
    if (hx < -60 || hx > VIEW_W + 60) continue;
    ctx.strokeStyle = 'rgba(200,190,170,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx + Math.sin(G.time * 0.7 + h.ph) * 4, h.y); ctx.stroke();
    ctx.fillStyle = 'rgba(12,8,12,0.55)';
    ctx.beginPath(); ctx.arc(hx + Math.sin(G.time * 0.7 + h.ph) * 4, h.y + 10, 5, 0, TAU); ctx.fill();
    ctx.fillRect(hx + Math.sin(G.time * 0.7 + h.ph) * 4 - 3, h.y + 14, 6, 18);
  }
}

function drawWorld(ctx) {
  const camx = G.cam.x, camy = G.cam.y;
  const z = (1 + G.punch) * BASE_ZOOM;
  const left = camx - VIEW_W / 2 / z - 60, right = camx + VIEW_W / 2 / z + 60;
  // 静态地板层（一次 blit，源坐标即世界坐标）
  const F = LAYERS.floor;
  const fsx = clamp(left, 0, WORLD_W);
  const fsw = clamp(right, 0, WORLD_W) - fsx;
  if (fsw > 0 && F.c) ctx.drawImage(F.c, fsx, 0, fsw, F.c.height, fsx, F.y0, fsw, F.c.height);
  // 两侧幕柱
  for (const e of LAYERS.curtainEdge) {
    if (e.x > right || e.x + 124 < left) continue;
    if (e.c) ctx.drawImage(e.c, e.x, e.y);
  }
  // 追光（跟随玩家）
  const p = G.player;
  const px = p.x;
  if (LAYERS.cone) ctx.drawImage(LAYERS.cone, px - 150, -44);
  if (LAYERS.pool) ctx.drawImage(LAYERS.pool, px - 172, GROUND_Y - 38);
  // 阴影
  const shadow = (x, h, w) => {
    const k = clamp(1 - (GROUND_Y - h) / 300, 0.15, 1);
    ctx.save();
    ctx.translate(x, GROUND_Y + 6); ctx.scale(1, 0.28);
    ctx.fillStyle = `rgba(0,0,0,${0.34 * k})`;
    ctx.beginPath(); ctx.arc(0, 0, w * (0.6 + 0.4 * k), 0, TAU); ctx.fill();
    ctx.restore();
  };
  for (const e of G.enemies) if (e.sk) shadow(e.x, e.y - FOOT * e.scale, 26 * e.scale);
  if (p.sk) shadow(p.x, p.y - FOOT, 24);
}

function drawShocks(ctx) {
  for (const s of G.shocks) {
    const a = clamp(s.life / 0.3, 0, 1);
    ctx.fillStyle = `rgba(190,150,100,${0.5 * a})`;
    ctx.beginPath();
    ctx.moveTo(s.x - s.dir * 16, GROUND_Y);
    ctx.quadraticCurveTo(s.x, GROUND_Y - 30, s.x + s.dir * 14, GROUND_Y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,200,140,${0.5 * a})`;
    ctx.beginPath();
    ctx.moveTo(s.x - s.dir * 6, GROUND_Y);
    ctx.quadraticCurveTo(s.x + s.dir * 4, GROUND_Y - 20, s.x + s.dir * 12, GROUND_Y);
    ctx.closePath(); ctx.fill();
  }
}
function drawNeedles(ctx) {
  ctx.lineCap = 'round';
  for (const n of G.needles) {
    const l = 14, d = Math.hypot(n.vx, n.vy) || 1;
    const ux = n.vx / d, uy = n.vy / d;
    ctx.strokeStyle = 'rgba(230,238,244,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(n.x - ux * l, n.y - uy * l); ctx.lineTo(n.x + ux * 4, n.y + uy * 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,150,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(n.x - ux * l * 2.2, n.y - uy * l * 2.2); ctx.lineTo(n.x - ux * l, n.y - uy * l); ctx.stroke();
  }
}

function drawSkillBar(ctx) {
  const bx = 36, by = VIEW_H - 96;
  // 丝线能量槽
  ctx.fillStyle = 'rgba(8,6,10,0.72)';
  ctx.fillRect(bx - 4, by - 20, 260, 36);
  ctx.fillStyle = '#241c22';
  ctx.fillRect(bx, by - 14, 252, 12);
  const efrac = clamp(G.energy / 100, 0, 1);
  ctx.fillStyle = G.gaugeDeny > 0 ? '#e0524d' : '#8fe3ff';
  ctx.fillRect(bx, by - 14, 252 * efrac, 12);
  if (G.energy >= 100) {
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.time * 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, by - 14, 252, 12);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = G.gaugeDeny > 0 ? '#e0524d' : '#8a6a4a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(bx - 4, by - 20, 260, 36);
  ctx.font = '700 11px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#cbb9a2';
  ctx.fillText('丝线能量', bx, by - 24);
  // 四技能槽
  const SLOTS = [
    { key: 'U', skill: 'strings', name: '乱舞', def: SKD.strings },
    { key: 'O', skill: 'blink', name: '影缝', def: SKD.blink },
    { key: 'P', skill: 'wave', name: '裂空', def: SKD.wave },
    { key: 'H', skill: 'ult', name: '谢幕', def: SKD.ult },
  ];
  for (let i = 0; i < SLOTS.length; i++) {
    const s = SLOTS[i];
    const x = bx + i * 66, y = by + 20, w = 60, h = 52;
    const cd = G.player.cds[s.def.slot] || 0;
    const ready = G.energy >= s.def.cost && cd <= 0;
    const flash = G.skillFlash[s.skill] > 0;
    ctx.fillStyle = 'rgba(8,6,10,0.72)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = flash ? 'rgba(255,233,176,0.4)' : (ready ? 'rgba(46,36,30,0.9)' : 'rgba(18,14,16,0.9)');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = flash ? '#fff2d8' : (ready ? '#d9a441' : (G.gaugeDeny > 0 ? '#e0524d' : '#4a3f38'));
    ctx.lineWidth = ready || flash ? 2 : 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.font = '800 20px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = ready ? '#ffd257' : '#6b625a';
    ctx.fillText(s.key, x + w / 2, y + 22);
    ctx.font = '600 12px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = ready ? '#ece5d4' : '#6b625a';
    ctx.fillText(s.name, x + w / 2, y + 37);
    ctx.font = '500 10px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = ready ? '#8fe3ff' : '#5a524a';
    ctx.fillText(s.cost + '', x + w / 2, y + 49);
    if (cd > 0) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, h * clamp(cd / s.def.cd, 0, 1));
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }
}
function drawCrescents(ctx) {
  for (const c of G.crescents) {
    ctx.save();
    ctx.translate(c.x, c.y); ctx.scale(sign(c.vx) || 1, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(143,227,255,0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 46, -1.25, 1.25);
    ctx.arc(-18, 0, 28, 1.05, -1.05, true);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(240,251,255,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 46, -1.25, 1.25); ctx.stroke();
    ctx.restore();
  }
}
function drawSkillWorldFx(ctx) {
  // 千丝乱舞辐条
  for (const sf of G.skillFx) {
    const k = 1 - sf.t / sf.dur;
    ctx.save();
    ctx.globalAlpha = k * 0.85;
    ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const rot = sf.t * 9;
    for (let i = 0; i < 12; i++) {
      const a = rot + i * TAU / 12;
      ctx.beginPath();
      ctx.moveTo(sf.x + Math.cos(a) * 24, sf.y + Math.sin(a) * 15);
      ctx.lineTo(sf.x + Math.cos(a) * sf.r, sf.y + Math.sin(a) * sf.r * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }
}
function drawUltFx(ctx) {
  if (!G.ultFx) return;
  const u = G.ultFx, t = u.t;
  let dark;
  if (!u.burst) dark = 0.5 * clamp(t / 0.5, 0, 1);
  else dark = 0.5 * clamp(1 - t / 0.8, 0, 1);
  if (dark > 0) {
    ctx.fillStyle = `rgba(8,4,10,${dark})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (!u.burst) {
    for (let i = 0; i < 14; i++) {
      const lx = (i * 173 + 40) % VIEW_W;
      const len = 200 + ((i * 97) % 260);
      ctx.strokeStyle = `rgba(216,67,79,${0.25 + 0.15 * Math.sin(G.time * 10 + i)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lx, -10); ctx.lineTo(lx + Math.sin(G.time * 3 + i) * 6, len); ctx.stroke();
    }
  } else if (t < 0.1) {
    ctx.fillStyle = `rgba(255,242,216,${(0.1 - t) / 0.1 * 0.45})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
const RANKS = [[0, 'D', '#8f96a3'], [6, 'C', '#cfd6de'], [12, 'B', '#8fe3ff'], [20, 'A', '#ffd257'], [30, 'S', '#ff9b45'], [42, 'SS', '#ff5d5d'], [60, 'SSS', '#fff2d8']];
function rankOf(c) { let r = RANKS[0]; for (const q of RANKS) if (c >= q[0]) r = q; return r; }

function drawHUD(ctx) {
  const p = G.player;
  // 生命
  const x = 36, y = 40, w = 300, h = 15;
  ctx.fillStyle = 'rgba(8,6,10,0.72)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#241c22';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#c2403f';
  ctx.fillRect(x, y, w * clamp(G.hpLag / p.maxhp, 0, 1), h);
  ctx.fillStyle = p.hp < 30 ? (Math.sin(G.time * 10) > 0 ? '#ff7a6a' : '#ece5d4') : '#ece5d4';
  ctx.fillRect(x, y, w * clamp(p.hp / p.maxhp, 0, 1), h);
  ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + w * i / 4, y, 1.5, h);
  ctx.font = '700 14px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#cbb9a2';
  ctx.fillText('生命', x, y - 9);
  // 幕数 / 击破
  ctx.font = '600 17px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#d9a441';
  ctx.fillText(`第 ${cnWave(Math.max(1, G.wave))} 幕`, x + w + 26, y + 6);
  ctx.font = '500 13px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#9a8c7a';
  ctx.fillText(`击破 ${G.stats.kills}   断肢 ${G.stats.limbs}`, x + w + 26, y + 26);
  // 连击
  if (G.combo >= 2) {
    const r = rankOf(G.combo);
    const pop = 1 + G.comboPop * 0.45;
    ctx.save();
    ctx.translate(VIEW_W - 108, 92);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.font = '800 56px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = r[2];
    ctx.globalAlpha = 0.95;
    ctx.fillText(String(G.combo), 0, 0);
    ctx.font = '700 15px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#cbb9a2';
    ctx.fillText('HITS', 0, 18);
    ctx.font = '800 26px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = r[2];
    ctx.globalAlpha = 0.85;
    ctx.fillText(r[1], 0, 46);
    ctx.restore();
    // 连击剩余时间
    ctx.fillStyle = r[2];
    ctx.globalAlpha = 0.6;
    ctx.fillRect(VIEW_W - 158, 100, 100 * clamp(G.comboT / 2.2, 0, 1), 3);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
  // 操作提示
  ctx.font = '500 13.5px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(203,185,162,0.5)';
  ctx.fillText('A/D 移动 · Space 跳 · J 连斩 · K 蓄力 · L 瞬步 · I 挑空 · U 乱舞 · O 影缝 · P 裂空 · H 谢幕 · R 重开', VIEW_W / 2, VIEW_H - 18);
  ctx.textAlign = 'left';
  // 横幅
  const b = G.banner;
  if (b.t < b.dur + 0.5) {
    const k = b.t < 0.25 ? b.t / 0.25 : (b.t > b.dur ? clamp(1 - (b.t - b.dur) / 0.5, 0, 1) : 1);
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = '800 44px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#f2ead9';
    ctx.shadowColor = 'rgba(216,67,79,0.6)'; ctx.shadowBlur = 18;
    ctx.fillText(b.main, VIEW_W / 2, 170);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = '500 17px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#cbb9a2';
      ctx.fillText(b.sub, VIEW_W / 2, 200);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function render() {
  const ctx = CTX;
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  drawBackground(ctx);
  // 世界变换
  const z = (1 + G.punch) * BASE_ZOOM;
  ctx.setTransform(RS * z, 0, 0, RS * z,
    RS * (VIEW_W / 2 - G.cam.x * z + G.shX),
    RS * (VIEW_H / 2 - G.cam.y * z + G.shY));
  drawWorld(ctx);
  FX.drawBelow(ctx);
  drawShocks(ctx);
  for (const e of G.enemies) e.render(ctx);
  drawNeedles(ctx);
  G.player.render(ctx);
  drawSkillWorldFx(ctx);
  drawCrescents(ctx);
  FX.drawAbove(ctx);
  // 屏幕空间
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  // 暗角
  if (LAYERS.vign) ctx.drawImage(LAYERS.vign, 0, 0);
  // 受伤红晕
  if (G.hurtFlash > 0) {
    ctx.globalAlpha = clamp(G.hurtFlash, 0, 0.55) * 0.9;
    if (LAYERS.red) ctx.drawImage(LAYERS.red, 0, 0);
    ctx.globalAlpha = 1;
  }
  // 低生命脉动
  if (G.player.hp > 0 && G.player.hp < 30 && G.state === 'playing') {
    ctx.globalAlpha = 0.10 + Math.sin(G.time * 6) * 0.06;
    if (LAYERS.red) ctx.drawImage(LAYERS.red, 0, 0);
    ctx.globalAlpha = 1;
  }
  drawUltFx(ctx);
  if (G.state !== 'menu') drawHUD(ctx);
  if (G.state === 'playing' && !G.player.dead) drawSkillBar(ctx);
  if (G.fade > 0) {
    ctx.fillStyle = `rgba(5,4,8,${G.fade})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// ---------- 主循环 ----------
function loop(t) {
  requestAnimationFrame(loop);
  if (!lastT) lastT = t;
  let rt = (t - lastT) / 1000;
  lastT = t;
  if (rt > 0.05) rt = 0.05;
  if (rt <= 0) return;
  // 音频等外部故障不允许中断游戏循环（测试模式 debugNoCatch 下仍抛出以便捕获）
  try { update(rt); } catch (e) { if (G.debugNoCatch) throw e; }
  try { render(); } catch (e) { if (G.debugNoCatch) throw e; }
}

// ---------- UI ----------
const UI = {};
function boot() {
  const canvas = document.getElementById('game');
  CTX = canvas.getContext('2d');
  RS = 1; // 固定 1 倍分辨率：软件渲染环境下保帧率，CSS 负责放大
  canvas.width = VIEW_W * RS;
  canvas.height = VIEW_H * RS;
  buildLayers();

  G.player = new Player(G);
  G.player.sk = computeFigure(G.player, makePose({}));

  UI.startOverlay = document.getElementById('startOverlay');
  UI.deadOverlay = document.getElementById('deadOverlay');
  UI.deadStats = document.getElementById('deadStats');
  UI.muteBtn = document.getElementById('muteBtn');

  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  window.addEventListener('blur', clearKeys);
  window.addEventListener('mousedown', () => SFX.ensure());
  if (UI.startOverlay && UI.startOverlay.addEventListener) UI.startOverlay.addEventListener('click', () => { if (G.state === 'menu') startGame(); });
  if (UI.muteBtn && UI.muteBtn.addEventListener) UI.muteBtn.addEventListener('click', toggleMute);
  const sb = document.getElementById('startBtn');
  if (sb && sb.addEventListener) sb.addEventListener('click', () => startGame());
  const rb = document.getElementById('retryBtn');
  if (rb && rb.addEventListener) rb.addEventListener('click', () => restartGame());

  window.combatBenchState = function () {
    return {
      ready: G.booted === true,
      playerAlive: G.state !== 'menu' && G.player.hp > 0,
      enemyCount: G.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0),
      hitCount: G.stats.hits,
      limbBreakCount: G.stats.limbs,
      playing: G.state === 'playing',
    };
  };
  window.__G = G;

  G.booted = true;
  requestAnimationFrame(loop);
}

boot();
