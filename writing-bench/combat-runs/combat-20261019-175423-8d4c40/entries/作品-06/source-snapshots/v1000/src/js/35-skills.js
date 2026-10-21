'use strict';
/* ============================================================
   四式 · 刃气 — four signature techniques.
   Each is a real, combat-usable ability with its own resource cost,
   cooldown, motion, hitstop weight and visual language.

     U  斩月·居合   iai       35 qi  3.2s
     O  千刃回旋     vortex    45 qi  8.0s
     P  断空·升龙     sky       30 qi  5.0s
     H  残心·时刃     rift      60 qi 12.0s
   ============================================================ */

const SKILL_DEFS = [
  { id: 'iai',    key: 'KeyU', label: 'U', name: '斩月·居合', short: '居合', cost: 35, cd: 3.2 },
  { id: 'vortex', key: 'KeyO', label: 'O', name: '千刃回旋',   short: '千刃', cost: 45, cd: 8.0 },
  { id: 'sky',    key: 'KeyP', label: 'P', name: '断空·升龙', short: '升龙', cost: 30, cd: 5.0 },
  { id: 'rift',   key: 'KeyH', label: 'H', name: '残心·时刃', short: '残心', cost: 60, cd: 12.0 }
];
const SKILL_BY_ID = Object.fromEntries(SKILL_DEFS.map(s => [s.id, s]));

const Skills = {
  cutLines: [], vortexes: [], echoes: [], pillars: [], glints: [],
  t: 0,

  reset() {
    this.cutLines.length = 0; this.vortexes.length = 0;
    this.echoes.length = 0; this.pillars.length = 0; this.glints.length = 0;
  },

  /* ---------- casting ---------- */
  keyDown(p, id) {
    const def = SKILL_BY_ID[id];
    if (!def) return false;
    if (!p.alive || p.hitstun > 0) return false;
    if ((p.skillCd[id] || 0) > 0) {
      this.deny(p, '冷却中', '#8f9bb0');
      return false;
    }
    if (p.qi < def.cost) {
      this.deny(p, '刃气不足', '#8f9bb0');
      return false;
    }
    p.qi -= def.cost;
    p.skillCd[id] = def.cd;
    p.skillCastT = 0;
    p.act = null;
    p.parryT = 0;
    p.queued = null;
    const dir = this.aimDir(p);
    p.facing = dir;
    switch (id) {
      case 'iai': this.castIai(p, dir); break;
      case 'vortex': this.castVortex(p, dir); break;
      case 'sky': this.castSky(p, dir); break;
      case 'rift': this.castRift(p, dir); break;
    }
    UI.skillFlash(id);
    return true;
  },

  aimDir(p) {
    let best = null, bd = 1e9;
    for (const e of Game.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - p.x);
      if (d < bd) { bd = d; best = e; }
    }
    if (best && bd < 620) return best.x >= p.x ? 1 : -1;
    return p.facing;
  },

  deny(p, msg, color) {
    FX.text(p.x, p.y - 165, msg, color, 17, { life: 0.45, vy: -34, weight: 600 });
  },

  castIai(p, dir) {
    p.startAction({
      name: 'sk_iai', skill: true, skillId: 'iai', dir,
      dur: 0.66, vx: 0, noCancel: true
    });
    p.invuln = Math.max(p.invuln, 0.2);
    Sfx.iaiCharge();
    Camera.kick(-dir * 2, 0);
    // charging glints while the blade is sheathed
    for (let i = 0; i < 14; i++) {
      FX.part({
        x: p.x + rand(-26, 26), y: p.y - rand(20, 150),
        vx: dir * rand(-40, 10), vy: rand(-70, 20), g: -10, drag: 2.2,
        life: rand(0.16, 0.4), size: rand(1, 2.4), color: '#bfe6ff', type: 'dot', glow: 1
      });
    }
  },

  castVortex(p, dir) {
    p.startAction({ name: 'sk_vortex', skill: true, skillId: 'vortex', dir, dur: 0.5, vx: dir * 120, noCancel: true });
    Sfx.vortexCast();
    Camera.kick(dir * 3, -1);
    FX.slash(p.x + dir * 40, p.y - 100, 96, dir > 0 ? -2.2 : Math.PI + 0.6, dir > 0 ? 0.9 : Math.PI - 0.9,
             dir, 0.2, 'rgba(150,240,255,0.85)', 26);
  },

  castSky(p, dir) {
    p.startAction({ name: 'sk_sky', skill: true, skillId: 'sky', dir, dur: 0.8, vx: 0, noCancel: true });
    p.invuln = Math.max(p.invuln, 0.18);
    Sfx.skyCharge();
    // ground charge ring under the player
    FX.ring(p.x, WORLD.ground, 10, 120, 0.4, 'rgba(255,190,120,0.55)', 4, 0.28);
    FX.dust(p.x, WORLD.ground, 0, 1.2, 10);
  },

  castRift(p, dir) {
    p.startAction({ name: 'sk_rift', skill: true, skillId: 'rift', dir, dur: 0.62, vx: 0, noCancel: true });
    Sfx.riftCast();
  },

  /* ---------- per-frame action logic ---------- */
  updateAction(p, dt) {
    const a = p.act;
    if (!a || !a.skill) return false;
    const t = p.actT;
    const dir = a.dir;

    if (a.skillId === 'iai') {
      if (t < 0.17) {
        p.vx = approach(p.vx, 0, 4200 * dt);
        // sheathe glint intensifies
        if (Math.random() < 0.5) {
          GriftSpark(p.x, p.y, dir);
        }
      } else if (!a.dashed) {
        a.dashed = true;
        this.iaiCut(p, dir);
      }
      if (a.dashed) p.vx = approach(p.vx, 0, 5200 * dt);
    } else if (a.skillId === 'vortex') {
      if (t >= 0.1 && !a.spawned) {
        a.spawned = true;
        this.spawnVortex(p, dir);
      }
      p.vx = approach(p.vx, 0, 2400 * dt);
    } else if (a.skillId === 'sky') {
      if (t < 0.13) {
        p.vx = approach(p.vx, 0, 4000 * dt);
      } else if (!a.launched) {
        a.launched = true;
        this.skyRend(p, dir);
      }
    } else if (a.skillId === 'rift') {
      if (t >= 0.08 && !a.fired) {
        a.fired = true;
        this.riftOpen(p);
      }
      p.vx = approach(p.vx, 0, 3000 * dt);
    }

    if (t >= a.dur) {
      p.act = null; p.actT = 0; p.state = 'idle';
    }
    return true;
  },

  /* ---------- 1. 居合 ---------- */
  iaiCut(p, dir) {
    const startX = p.x;
    const reach = 470;
    const endX = clamp(startX + dir * reach, WORLD.left + 30, WORLD.right - 30);
    const x0 = Math.min(startX, endX) - 26;
    const x1 = Math.max(startX, endX) + 26;
    const yTop = WORLD.ground - 205;

    // the body flickers across the gap
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const gx = lerp(startX, endX, k);
      FX.ghost((c, x, y, f) => drawPlayerSilhouette(c, x, y, f, 'dash'), gx, p.y, dir, 0.34 * (1 - k * 0.5), '#9fe0ff', 0.22 + k * 0.1);
    }
    p.x = endX;
    p.invuln = Math.max(p.invuln, 0.45);
    p.dodgeT = Math.max(p.dodgeT, 0.2);

    // the cut line
    this.cutLines.push({
      x0, x1, y: WORLD.ground - 110, life: 0.62, max: 0.62,
      dir, color: '#dff4ff', width: 13, delayCut: true
    });
    Sfx.iaiSlash();
    Game.addHitstop(0.17, p, null);
    Camera.shake(7, 0.32);
    Camera.kick(-dir * 9, -2);
    this.glints.push({ x: endX, y: WORLD.ground - 110, life: 0.3, max: 0.3, dir });

    const hits = [];
    for (const e of Game.enemies) {
      if (e.dead) continue;
      if (e.x > x0 - 24 && e.x < x1 + 24 && e.y > yTop && e.y < WORLD.ground + 30) {
        const res = Game.damageEnemy(e, {
          damage: 38, fromX: startX, heavy: true, knock: 470, lift: -150,
          limbMul: 2.4, hitstop: 0, kind: 'iai', dir: (e.x >= startX ? 1 : -1), noSpray: true
        });
        if (res.hit) hits.push(e.id);
      }
    }
    // delayed echo of the same cut: the blade remembers
    for (const id of hits) {
      this.echoes.push({
        enemyId: id, t: 0.2, damage: 20, fromX: p.x, x: 0, y: 0,
        opts: { heavy: true, knock: 260, lift: -200, limbMul: 1.2, dir, kind: 'echo', noSpray: true, noEcho: true }
      });
    }
    if (hits.length >= 2) {
      FX.text(p.x, p.y - 210, '一刀两断', '#e8f8ff', 28, { life: 0.9, weight: 900, italic: true });
      Game.score += 60 * hits.length;
    }
    // camera snap through the cut
    Camera.iaiT = 0.24;
  },

  /* ---------- 2. 千刃 ---------- */
  spawnVortex(p, dir) {
    this.vortexes.push({
      x: p.x + dir * 54, y: WORLD.ground - 74, dir,
      t: 0, life: 1.18, radius: 86, hitTimer: 0, hitMemo: new Map(),
      speed: 330, spin: 0, imploded: false
    });
    Sfx.vortexLoop();
  },

  /* ---------- 3. 升龙 ---------- */
  skyRend(p, dir) {
    const cx = p.x;
    const x0 = cx - 150, x1 = cx + 150;
    p.vy = -1180;
    p.onGround = false;
    p.airHoverT = 0;
    p.y -= 6;
    Sfx.skySlash();
    Game.addHitstop(0.13, p, null);
    Camera.shake(8, 0.34);
    Camera.kick(0, 7);
    this.pillars.push({ x: cx, t: 0, life: 0.95, dir });

    let n = 0;
    for (const e of Game.enemies) {
      if (e.dead) continue;
      if (e.x > x0 && e.x < x1 && Math.abs(e.y - WORLD.ground) < 260) {
        const res = Game.damageEnemy(e, {
          damage: 26, fromX: cx, heavy: true, knock: 140, lift: -760,
          limbMul: 1.7, hitstop: 0, kind: 'sky', dir, noSpray: true
        });
        if (res.hit) {
          n++;
          this.echoes.push({
            enemyId: e.id, t: 0.22 + Math.random() * 0.1, damage: 12, fromX: cx,
            opts: { heavy: false, knock: 60, lift: -340, limbMul: 1.0, dir, kind: 'echo', noSpray: true, noEcho: true }
          });
        }
      }
    }
    p.skyKills = n;
    if (n) FX.text(cx, p.y - 230, '升龙', '#ffd9a0', 26, { life: 0.8, weight: 900, italic: true });
  },

  /* ---------- 4. 残心 ---------- */
  riftOpen(p) {
    Game.timeFracture = 1.85;
    Game.timeFractureMax = 1.85;
    p.riftGlow = 1;
    Sfx.riftOpen();
    Camera.shake(2.5, 0.3);
    // clock-ring expansion
    for (let i = 0; i < 3; i++) {
      this.pillars.push({ x: p.x, t: -i * 0.07, life: 0.7, dir: 1, rift: true });
    }
    FX.text(p.x, p.y - 200, '残心 · 时刃', '#a8f0ff', 28, { life: 1.1, weight: 900, italic: true });
    for (let i = 0; i < 26; i++) {
      FX.part({
        x: p.x + rand(-90, 90), y: p.y - rand(0, 180),
        vx: rand(-70, 70), vy: rand(-90, 10), g: -20, drag: 1.1,
        life: rand(0.5, 1.2), size: rand(1, 2.6), color: '#9fe6ff', type: 'dot', glow: 1
      });
    }
  },

  /* ---------- shared: echo / tick ---------- */
  tick(dt) {
    this.t += dt;
    // echo strikes repeat a fraction of the damage shortly after the hit
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const ec = this.echoes[i];
      ec.t -= dt;
      if (ec.t > 0) continue;
      this.echoes.splice(i, 1);
      const e = Game.enemies.find(en => en.id === ec.enemyId && !en.dead);
      if (!e) continue;
      Game.damageEnemy(e, Object.assign({ damage: ec.damage, fromX: ec.fromX, knock: 90, limbMul: 0.8 }, ec.opts));
      FX.slash(e.x - 20, e.y - e.h * 0.6, 74, -2.2, 0.9, 1, 0.16, 'rgba(190,240,255,0.7)', 12);
    }

    // vortex blades
    for (let i = this.vortexes.length - 1; i >= 0; i--) {
      const v = this.vortexes[i];
      v.t += dt;
      v.spin += dt * 24;
      const push = v.t < 0.78 ? v.speed : v.speed * 0.15;
      v.x += v.dir * push * dt;
      v.x = clamp(v.x, WORLD.left + 40, WORLD.right - 40);
      v.y = WORLD.ground - 74;

      v.hitTimer -= dt;
      if (v.hitTimer <= 0 && v.t < 0.96) {
        v.hitTimer = 0.1;
        for (const e of Game.enemies) {
          if (e.dead) continue;
          const dx = e.x - v.x, dy = (e.y - e.h * 0.5) - v.y;
          if (Math.abs(dx) < v.radius && Math.abs(dy) < v.radius * 1.3) {
            const last = v.hitMemo.get(e.id) || -1;
            if (v.t - last > 0.22) {
              v.hitMemo.set(e.id, v.t);
              Game.damageEnemy(e, {
                damage: 6, fromX: v.x - v.dir, heavy: false, knock: 40,
                limbMul: 0.7, hitstop: 0.028, kind: 'vortex',
                dir: dx >= 0 ? 1 : -1, noHitstopPush: true
              });
              // drag victims into the grinder
              e.x = approach(e.x, v.x, 240 * dt);
            }
          }
        }
        // ambient shred sparks
        for (let s = 0; s < 2; s++) {
          const a = rand(0, TAU);
          FX.part({
            x: v.x + Math.cos(a) * v.radius * 0.8, y: v.y + Math.sin(a) * v.radius * 0.8,
            vx: Math.cos(a + 1.5) * rand(80, 260), vy: Math.sin(a + 1.5) * rand(80, 260),
            g: 300, drag: 1.6, life: rand(0.1, 0.28), size: rand(1, 2.4),
            color: '#a8f0ff', type: 'streak', glow: 1
          });
        }
      }
      // implosion finish
      if (v.t >= 0.98 && !v.imploded) {
        v.imploded = true;
        Sfx.vortexBurst();
        Game.addHitstop(0.12, null, null);
        Camera.shake(7, 0.3);
        FX.ring(v.x, v.y, 10, 150, 0.36, 'rgba(150,240,255,0.8)', 5, 1);
        FX.ring(v.x, v.y, 6, 90, 0.24, 'rgba(255,255,255,0.9)', 3, 1);
        FX.sparkBurst(v.x, v.y, v.dir, 1.6, '#c8f6ff', 22);
        for (const e of Game.enemies) {
          if (e.dead) continue;
          if (Math.abs(e.x - v.x) < 130 && Math.abs(e.y - v.y) < 170) {
            Game.damageEnemy(e, {
              damage: 26, fromX: v.x, heavy: true, knock: 420, lift: -260,
              limbMul: 1.9, hitstop: 0, kind: 'vortexBurst', dir: e.x >= v.x ? 1 : -1
            });
          }
        }
      }
      if (v.t > v.life) this.vortexes.splice(i, 1);
    }

    // pillars / rings
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pz = this.pillars[i];
      pz.t += dt;
      if (pz.t > pz.life) this.pillars.splice(i, 1);
    }
    for (let i = this.cutLines.length - 1; i >= 0; i--) {
      this.cutLines[i].life -= dt;
      if (this.cutLines[i].life <= 0) this.cutLines.splice(i, 1);
    }
    for (let i = this.glints.length - 1; i >= 0; i--) {
      this.glints[i].life -= dt;
      if (this.glints[i].life <= 0) this.glints.splice(i, 1);
    }
  },

  /* ---------- render: world layer ---------- */
  drawWorld(ctx) {
    // cut lines (iai)
    for (const c of this.cutLines) {
      const k = c.life / c.max;
      const open = 1 - k;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // the gash widens then fades
      ctx.globalAlpha = Math.min(1, k * 1.8) * 0.95;
      const w = c.width * (0.35 + open * 0.65);
      const grd = ctx.createLinearGradient(c.x0, c.y, c.x1, c.y);
      grd.addColorStop(0, 'rgba(150,225,255,0)');
      grd.addColorStop(0.12, 'rgba(190,240,255,0.85)');
      grd.addColorStop(0.5, 'rgba(255,255,255,1)');
      grd.addColorStop(0.88, 'rgba(190,240,255,0.85)');
      grd.addColorStop(1, 'rgba(150,225,255,0)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x0, c.y); ctx.lineTo(c.x1, c.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(1, w * 0.24);
      ctx.beginPath(); ctx.moveTo(c.x0 + 18, c.y); ctx.lineTo(c.x1 - 18, c.y); ctx.stroke();
      // displaced edge glow
      ctx.globalAlpha = k * 0.35;
      ctx.strokeStyle = 'rgba(120,200,255,0.7)';
      ctx.lineWidth = w * 3.2;
      ctx.beginPath(); ctx.moveTo(c.x0, c.y); ctx.lineTo(c.x1, c.y); ctx.stroke();
      ctx.restore();
    }

    // glints at the end of the iai cut
    for (const g of this.glints) {
      const k = g.life / g.max;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        const r0 = 6, r1 = 34 * (1 - k) + 10;
        ctx.beginPath();
        ctx.moveTo(g.x + Math.cos(a) * r0, g.y + Math.sin(a) * r0);
        ctx.lineTo(g.x + Math.cos(a) * r1, g.y + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // vortices
    for (const v of this.vortexes) {
      const fade = clamp((v.life - v.t) / 0.25, 0, 1);
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.globalAlpha = fade;
      // motion blur disc
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const dg = ctx.createRadialGradient(0, 0, 8, 0, 0, v.radius * 1.35);
      dg.addColorStop(0, 'rgba(190,250,255,0.30)');
      dg.addColorStop(0.55, 'rgba(90,210,255,0.13)');
      dg.addColorStop(1, 'rgba(60,160,255,0)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(0, 0, v.radius * 1.35, 0, TAU); ctx.fill();
      ctx.restore();
      // three blades
      for (let b = 0; b < 3; b++) {
        const base = v.spin + b * (TAU / 3);
        ctx.save();
        ctx.rotate(base);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(v.radius * 0.9, -16, v.radius * 1.02, 0);
        ctx.quadraticCurveTo(v.radius * 0.9, 16, 0, 0);
        ctx.closePath();
        const bg = ctx.createLinearGradient(0, 0, v.radius, 0);
        bg.addColorStop(0, 'rgba(120,220,255,0.5)');
        bg.addColorStop(0.7, 'rgba(220,250,255,0.95)');
        bg.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.restore();
        // trailing arc
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(150,235,255,0.5)';
        ctx.lineWidth = 3;
        ctx.arc(0, 0, v.radius * (0.72 + b * 0.1), base - 1.2, base);
        ctx.stroke();
      }
      // spinning core
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(220,250,255,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, 12 + Math.sin(v.t * 26) * 2, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // sky pillar
    for (const pz of this.pillars) {
      const k = clamp(pz.t / pz.life, 0, 1);
      if (k < 0) continue;
      const grow = easeOut(clamp(k * 3.2, 0, 1));
      const fade = 1 - Math.max(0, (k - 0.55) / 0.45);
      ctx.save();
      ctx.translate(pz.x, WORLD.ground);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      const H = (pz.rift ? 330 : 400) * grow;
      if (pz.rift) {
        // a thin, breathing tear in time behind the player
        const wob = Math.sin(pz.t * 22) * 5;
        const g = ctx.createLinearGradient(0, 0, 0, -H);
        g.addColorStop(0, 'rgba(160,240,255,0)');
        g.addColorStop(0.25, 'rgba(140,230,255,0.30)');
        g.addColorStop(0.6, 'rgba(110,210,255,0.42)');
        g.addColorStop(1, 'rgba(90,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.quadraticCurveTo(-16 + wob, -H * 0.45, -6, -H);
        ctx.lineTo(6, -H);
        ctx.quadraticCurveTo(16 + wob, -H * 0.45, 3, 0);
        ctx.closePath();
        ctx.fill();
        // bright seam
        ctx.strokeStyle = 'rgba(235,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(wob * 0.6, -H * 0.5, 0, -H);
        ctx.stroke();
        // orbiting time shards
        for (let i = 0; i < 7; i++) {
          const a = pz.t * 3.6 + i * (TAU / 7);
          const rr = 46 + Math.sin(pz.t * 2 + i) * 16;
          const sx = Math.cos(a) * rr, sy = -H * 0.5 + Math.sin(a) * rr * 1.5;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(a);
          ctx.globalAlpha = fade * 0.8;
          ctx.fillStyle = 'rgba(190,248,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(-5, 0); ctx.lineTo(0, -2.5); ctx.lineTo(6, 0); ctx.lineTo(0, 2.5);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        continue;
      }
      const W = 44 * (1 - k * 0.25);
      const g = ctx.createLinearGradient(0, 0, 0, -H);
      g.addColorStop(0, 'rgba(255,236,190,0.62)');
      g.addColorStop(0.35, 'rgba(255,176,90,0.26)');
      g.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-W, 0);
      ctx.quadraticCurveTo(-W * 0.4, -H * 0.6, -W * 0.1, -H);
      ctx.lineTo(W * 0.1, -H);
      ctx.quadraticCurveTo(W * 0.4, -H * 0.6, W, 0);
      ctx.closePath();
      ctx.fill();
      // inner thread
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -H * 0.97);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,224,168,0.55)';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 7; i++) {
        const yy = -H * (0.12 + i * 0.125) + Math.sin(pz.t * 12 + i) * 3;
        const ww = W * (1.0 - i * 0.11);
        const slant = 10 - i * 2;
        ctx.beginPath(); ctx.moveTo(-ww, yy); ctx.lineTo(ww, yy - slant); ctx.stroke();
      }
      ctx.restore();
    }
  },

  /* ---------- render: screen layer ---------- */
  drawScreen(ctx, vw, vh, dt) {
    if (Game.timeFracture > 0) {
      const k = clamp(Game.timeFracture / (Game.timeFractureMax || 1.85), 0, 1);
      const a = Math.min(1, k * 2.2);
      ctx.save();
      // cold wash
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.30 * a;
      ctx.fillStyle = '#5f8fb8';
      ctx.fillRect(0, 0, vw, vh);
      ctx.restore();
      ctx.save();
      // cyan rim + scan lines
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.85);
      g.addColorStop(0, 'rgba(80,200,255,0)');
      g.addColorStop(1, `rgba(70,190,255,${0.16 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 0.10 * a;
      ctx.strokeStyle = '#bff4ff';
      ctx.lineWidth = 1;
      const scroll = (this.t * 60) % 8;
      for (let y = -8 + scroll; y < vh; y += 8) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      ctx.restore();
      // clock arcs at the centre
      const p = Game.player;
      const sx = VIEW.sx(p.x), sy = VIEW.sy(p.y - 40);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = 0.55 * a;
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TAU + this.t * 0.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 70, Math.sin(ang) * 70);
        ctx.lineTo(Math.cos(ang) * (82 + (i % 3) * 8), Math.sin(ang) * (82 + (i % 3) * 8));
        ctx.stroke();
      }
      ctx.restore();
    }
  }
};

/* helper: sparkle during the iai wind-up */
function GriftSpark(x, y, dir) {
  FX.part({
    x: x + dir * rand(-10, 30), y: y - rand(30, 150),
    vx: dir * rand(-30, 60), vy: rand(-60, 20), g: 0, drag: 2.4,
    life: rand(0.1, 0.26), size: rand(0.8, 2), color: '#d8f4ff', type: 'streak', glow: 1
  });
}

/* ---- late-bound: installed after Game exists (script order) ---- */
function installSkillHooks() {
  Game.damageEnemy = function (e, o) {
  const res = e.takeHit(o.damage, o.fromX != null ? o.fromX : this.player.x, {
    heavy: !!o.heavy, counter: !!o.counter, lift: o.lift, knock: o.knock,
    charged: !!o.charged, targetLimb: o.targetLimb, limbMul: o.limbMul || 1,
    noLimb: !!o.noLimb
  });
  if (!res.hit) return res;
  const hx = e.x - (o.dir || 1) * 6;
  const hy = e.y - e.h * 0.58;
  this.hitCount++;
  this.updateCombo();
  this.score += Math.round(8 + o.damage * 1.4);
  const kind = o.kind === 'iai' ? 'heavy' : (o.kind === 'sky' ? 'heavy' : (o.kind === 'vortexBurst' ? 'heavy' : 'normal'));
  FX.hitBurst(hx, hy, o.dir || 1, o.heavy ? 1.2 : 0.85, res.broke.length ? 'break' : kind);
  if (!o.noSpray && (o.heavy || Math.random() < 0.45)) {
    FX.impactLines(hx, hy, o.dir || 1, o.heavy ? 0.9 : 0.5, '#fff0d0');
  }
  Sfx.hit(o.heavy ? 1.8 : 1.05);
  this.player.bladeGlow = 1;
  if (o.hitstop) this.addHitstop(o.hitstop, this.player, e);
  // echo hits during 残心
  if (this.timeFracture > 0 && o.kind !== 'echo' && !o.noEcho) {
    Skills.echoes.push({
      enemyId: e.id, t: 0.1, damage: Math.max(2, o.damage * 0.45), fromX: o.fromX,
      opts: { heavy: false, knock: 40, limbMul: 0.5, dir: o.dir || 1, kind: 'echo' }
    });
  }
  return res;
};
}
