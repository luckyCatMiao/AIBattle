(function (AV) {
  "use strict";
  const U = AV.util;
  const G = AV.gfx;
  const { clamp, lerp, TAU, rand, randInt, pick, sign, easeOutCubic, easeInCubic, easeOutQuint, easeOutBack } = U;
  const D2R = Math.PI / 180;
  const PAL = G.palette;

  const DESIGN_H = 720;

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.audio = new AV.AudioEngine();
      this.fx = new AV.Effects();
      this.cam = new AV.Camera();
      this.stage = new AV.Stage(this);
      this.arenaW = this.stage.arenaW;
      this.player = new AV.Player(this);
      this.enemies = [];
      this.projectiles = [];
      this.state = "title";
      this.time = 0;
      this.realTime = 0;
      this.hitstop = 0;
      this.slowmo = 0;
      this.slowmoT = 0;
      this.wave = 0;
      this.spawnQueue = [];
      this.waveDelay = 0;
      this.waveBanner = 0;
      this.waveBannerText = "";
      this.combo = 0;
      this.comboTimer = 0;
      this.comboPop = 0;
      this.maxCombo = 0;
      this.score = 0;
      this.scoreDisplay = 0;
      this.stats = { hits: 0, limbBreaks: 0, kills: 0, parries: 0, damageDealt: 0, damageTaken: 0 };
      this.ready = false;
      this.lastTime = 0;
      this.hpDisplay = 1;
      this.focusDisplay = 0;
      this.hudPulse = 0;
      this.bossBar = null;
      this.titleT = 0;
      this.deathT = 0;
      this.audioStarted = false;
      this.firstFrame = true;
      this.pausedFrom = null;
      this.killFeed = [];
      this.markerT = 0;
      this.usedCharge = false;
      this.tipsSeen = false;
      this.uiFlash = 0;
      this.W = 0;
      this.H = 0;
      this.camera = { x: 0, y: 0 };
      this.setupResize();
      this.bindGlobal();
      this.player.x = this.arenaW / 2;
      this.player.facing = 1;
      this.cam.x = this.player.x;
      this.cam.y = -180;
      this.lastT = performance.now();
      this.ready = true;
      requestAnimationFrame(this.frame.bind(this));
    }

    // ------------------------------------------------------------------ setup
    setupResize() {
      const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = Math.max(320, window.innerWidth);
        const ch = Math.max(240, window.innerHeight);
        this.cssW = cw;
        this.cssH = ch;
        this.canvas.width = Math.floor(cw * dpr);
        this.canvas.height = Math.floor(ch * dpr);
        this.canvas.style.width = cw + "px";
        this.canvas.style.height = ch + "px";
        let scale = (ch * dpr) / DESIGN_H;
        let lw = (cw * dpr) / scale;
        if (lw < 960) {
          scale = (cw * dpr) / 960;
          lw = 960;
        }
        this.scale = scale;
        this.dpr = dpr;
        this.cam.w = lw;
        this.cam.h = (ch * dpr) / scale;
        this.viewW = this.cam.w;
        this.viewH = this.cam.h;
      };
      resize();
      window.addEventListener("resize", resize);
    }

    bindGlobal() {
      AV.Input.init(this.canvas);
      const muteBtn = document.getElementById("muteBtn");
      const muteLabel = document.getElementById("muteLabel");
      const muteIcon = document.getElementById("muteIcon");
      const hint = document.getElementById("stageHint");
      this.muteEls = { muteBtn, muteLabel, muteIcon, hint };

      const applyMute = (m) => {
        this.audio.setMuted(m);
        if (muteBtn) {
          muteBtn.setAttribute("aria-pressed", m ? "true" : "false");
          muteBtn.title = m ? "音效已关闭 (M)" : "音效开启 (M)";
        }
        if (muteLabel) muteLabel.textContent = m ? "音效 关" : "音效 开";
        if (muteIcon) muteIcon.textContent = m ? "♪" : "♪";
      };
      if (muteBtn) {
        muteBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.audio.ensure();
          this.audio.muted = !this.audio.muted;
          applyMute(this.audio.muted);
          this.audio.resume();
        });
      }
      this.applyMute = applyMute;
      applyMute(false);

      window.addEventListener("keydown", (e) => {
        if (e.code === "KeyM" && !e.repeat) {
          this.audio.ensure();
          applyMute(!this.audio.muted);
          this.audio.resume();
        }
        if (AV.Input.pressed.size) this.audio.resume();
      });
      this.canvas.addEventListener("pointerdown", () => {
        this.audio.resume();
        if (this.state === "title") this.startRun();
      });
      this.audioStarted = false;
    }

    // ------------------------------------------------------------------ run flow
    startRun() {
      this.audio.resume();
      this.state = "playing";
      this.time = 0;
      this.deathT = 0;
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.fx.clear();
      this.player.reset(this.arenaW * 0.5 - 120, 0);
      this.player.facing = 1;
      this.wave = 0;
      this.spawnQueue.length = 0;
      this.waveDelay = 1.15;
      this.combo = 0;
      this.comboTimer = 0;
      this.comboPop = 0;
      this.maxCombo = 0;
      this.score = 0;
      this.scoreDisplay = 0;
      this.hitstop = 0;
      this.slowmo = 0;
      this.stats = { hits: 0, limbBreaks: 0, kills: 0, parries: 0, damageDealt: 0, damageTaken: 0 };
      this.hpDisplay = 1;
      this.cam.x = this.player.x;
      this.cam.y = -180;
      this.cam.shake = 0;
      this.waveBanner = 0;
      this.killFeed.length = 0;
      if (this.muteEls.hint) this.muteEls.hint.classList.add("hidden");
      this.audio.startDrone();
    }

    restart() {
      this.startRun();
    }

    togglePause() {
      if (this.state === "playing") {
        this.state = "paused";
        this.audio.stopChargeHum();
        AV.Input.clear();
      } else if (this.state === "paused") {
        this.state = "playing";
        AV.Input.clear();
      }
    }

    onPlayerDeath() {
      this.state = "dead";
      this.deathT = 0;
      this.audio.death();
      this.fx.screenFlash(0.3, "120,20,10");
      this.cam.addShake(14);
      this.combo = 0;
      this.audio.stopChargeHum();
    }

    // ------------------------------------------------------------------ waves
    waveComp(n) {
      const list = [];
      const t = Math.floor((n - 1) / 4);
      if (n === 1) {
        list.push(["stalker", 0], ["stalker", 0], ["turret", 0]);
      } else if (n === 2) {
        list.push(["stalker", 0], ["blade", 0], ["stalker", 0]);
      } else if (n === 3) {
        list.push(["turret", 0], ["stalker", 0], ["stalker", 0], ["blade", 0]);
      } else if (n === 4) {
        list.push(["brute", 0], ["stalker", 0], ["turret", 0], ["stalker", 0]);
      } else {
        const r = n % 3;
        list.push(["blade", t], ["stalker", t], ["stalker", t]);
        if (r === 0) list.push(["brute", t]);
        if (r === 1) list.push(["turret", t]);
        if (n >= 7) list.push(["stalker", t], ["turret", t]);
        if (n >= 10) list.push(["brute", t], ["blade", t]);
      }
      return list;
    }

    startWave(n) {
      this.wave = n;
      this.waveBanner = 2.0;
      this.waveBannerText = n === 1 ? "第 一 波 · 熔炉巡查" : (n === 4 ? "第 " + n + " 波 · 熔铁巨傀" : "第 " + n + " 波");
      this.audio.wave();
      const comp = this.waveComp(n);
      const side = Math.random() < 0.5 ? -1 : 1;
      let delay = 0.2;
      let idx = 0;
      for (const [kind, tier] of comp) {
        let x;
        const base = this.player.x;
        const dist = kind === "turret" ? rand(560, 380) : rand(520, 300);
        const sx = sign(side * (idx % 2 === 0 ? 1 : -1)) * (base + dist * (side * (idx % 2 === 0 ? 1 : -1) < 0 ? 1 : 1));
        // simpler: alternate sides around the player
        const dir = (idx % 2 === 0) ? side : -side;
        x = clamp(base + dir * dist, 120, this.arenaW - 120);
        this.spawnQueue.push({ at: delay, kind, tier, x });
        delay += kind === "brute" ? 0.95 : 0.34;
        idx++;
      }
      this.waveDelay = 0;
    }

    queueNextWave() {
      this.waveDelay = 2.0;
      this.waveBanner = 1.6;
      this.waveBannerText = "战场整顿";
    }

    spawnEnemy(kind, x, tier) {
      let e;
      if (kind === "turret") e = new AV.enemies.Turret(this, x, tier);
      else if (kind === "stalker") e = new AV.enemies.Stalker(this, x, tier);
      else if (kind === "blade") e = new AV.enemies.BladeFiend(this, x, tier);
      else e = new AV.enemies.Brute(this, x, tier);
      this.enemies.push(e);
      this.fx.ring(x, 0, { r1: 74, width: 3, color: "#ffb070", life: 0.5, squash: 0.28 });
      this.fx.dustPuff(x, 0, 10, 0, 1.2);
      this.fx.emberBurst(x, -20, 12, "#ffa860", 220);
      this.audio.tone && this.audio.tone("sine", 120, 60, 0.3, 0.08);
      return e;
    }

    // ------------------------------------------------------------------ combat
    addHitstop(t) {
      this.hitstop = Math.max(this.hitstop, t);
    }

    slowmoFor(t, scale) {
      this.slowmoT = Math.max(this.slowmoT, t);
      this.slowmo = Math.min(this.slowmo || 1, scale);
    }

    addCombo() {
      this.combo++;
      this.comboTimer = 2.3;
      this.comboPop = 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }

    focusGain(v) {
      this.player.focus = Math.min(this.player.maxFocus, this.player.focus + v);
    }

    rectOverlap(a, b) {
      return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
    }

    screenToWorld(sx, sy) {
      // input coords are CSS pixels within the canvas; convert to logical then world
      const cw = this.cssW || 1;
      const lw = this.cam.w || 1;
      const lx = (sx / cw) * lw;
      const ly = (sy / (this.cssH || 1)) * this.cam.h;
      const z = this.cam.zoom;
      return {
        x: this.cam.x + (lx - this.cam.w / 2) / z,
        y: this.cam.y + (ly - this.cam.h / 2) / z,
      };
    }

    tryPlayerParry(attacker) {
      const p = this.player;
      if (!p.alive) return false;
      if (p.state === "parry" && p.parryTimer > 0) {
        p.perfectParry(attacker);
        this.hudPulse = 1;
        return true;
      }
      return false;
    }

    onPlayerHit(enemy, attack, contact, player) {
      const p = player;
      const dmgBase = attack.dmg;
      let chargeMul = 1;
      if (attack.chargePower) chargeMul += attack.chargePower * 1.0;
      if (attack.empowered) chargeMul *= 1.85;
      const comboMul = 1 + Math.min(0.5, this.combo * 0.015);
      let dmg = dmgBase * chargeMul * comboMul;

      // pick the limb under the contact point
      const parts = enemy.parts ? enemy.parts() : [];
      let chosen = null;
      let best = Infinity;
      for (const part of parts) {
        let score = Math.hypot(contact.x - part.x, contact.y - part.y) / Math.max(6, part.r) - (part.priority || 0) * 0.8;
        if (part.broken) score += 100;
        // discourage attacking the opposite side
        if (score < best) { best = score; chosen = part; }
      }
      if (!chosen) chosen = { key: "body", x: contact.x, y: contact.y, r: 20, kind: "armU", hp: 9999, maxHp: 9999 };
      const part = chosen;

      let limbBroke = false;
      let headKill = false;
      const isHead = part.key === "head";
      const isBlade = enemy.kind === "blade" || enemy.kind === "brute";
      const headGated = isBlade && enemy.hp > enemy.maxHp * 0.4;
      const partMul = attack.partMul || 1;

      if (part.key !== "body" && !part.broken && enemy.limbHp) {
        const partDmg = dmg * partMul * (isHead ? 1.2 : 1) + (attack.heavy ? 7 : 0);
        if (isHead && headGated) {
          // helmeted head resists until the torso is worn down
          enemy.limbHp.head = Math.max(1, enemy.limbHp.head - partDmg * 0.3);
        } else {
          enemy.limbHp[part.key] = Math.max(0, (enemy.limbHp[part.key] || 0) - partDmg);
          if (enemy.limbHp[part.key] <= 0) {
            limbBroke = true;
            headKill = isHead;
            if (enemy.severPart) enemy.severPart(part.key, this, contact);
          }
        }
      }

      // I-parry counter: executioner's cut severs a limb outright
      if (attack.counter && !limbBroke && enemy.alive && enemy.limbHp && enemy.severPart) {
        const cand = ["armR", "armL", "legR", "legL"].find((k) => !enemy.limbs[k].broken && enemy.limbHp[k] != null);
        if (cand) {
          limbBroke = true;
          enemy.limbHp[cand] = 0;
          enemy.severPart(cand, this, contact);
        }
      }

      // execution skill: guaranteed kill on low HP targets
      if (attack.execution && enemy.hp / enemy.maxHp <= 0.30) {
        enemy.hp = 0;
        dmg = enemy.maxHp;
        const execKey = enemy.kind === "turret" ? "barrel" : "head";
        const alreadyGone = enemy.kind === "turret" ? enemy.barrelBroken : (enemy.limbs.head && enemy.limbs.head.broken);
        if (enemy.severPart && !alreadyGone) {
          if (enemy.limbHp) enemy.limbHp[execKey] = 0;
          enemy.severPart(execKey, this, contact);
          if (execKey === "head") headKill = true;
        }
        this.player.focus = this.player.maxFocus;
        this.fx.screenFlash(0.18, "255,70,50");
        this.fx.text(contact.x, contact.y - 120, "处 刑", { color: "#ff6b5c", size: 38, vy: -90, life: 1.3, glow: 1 });
        this.audio.execution();
      }

      // apply to the enemy
      if (headKill) {
        // decapitation finishes the job
        enemy.hp = Math.min(enemy.hp, 0.01);
        enemy.hurt(dmg + enemy.maxHp, { limbBreak: false, contact, headKill: true }, this);
      } else {
        enemy.hurt(dmg, {
          contact,
          part: part.key,
          limbBreak: limbBroke,
          launch: attack.launch || false,
          kb: attack.kb,
          kbY: attack.kbY,
          heavy: (attack.partMul || 1) >= 2,
          player,
        }, this);
      }

      // stagger / knockback motion
      if (enemy.alive) {
        const dir = sign(enemy.x - p.x) || p.facing;
        const kb = (attack.kb || 120);
        const mass = enemy.mass || 1;
        enemy.vx += dir * kb / mass;
        if (attack.launch) {
          if (enemy.knockdown) enemy.knockdown(0.9);
          enemy.vy = Math.min(enemy.vy, attack.kbY || -600);
          enemy.y = Math.min(enemy.y, -1);
          enemy.grounded = false;
        } else if (attack.kbY && enemy.alive && !enemy.limbs?.legR?.broken) {
          if (enemy.knockdown && (attack.partMul || 1) >= 2.6) enemy.knockdown(0.55);
        }
        if (limbBroke || attack.counter) {
          if (enemy.stun) enemy.stun(attack.counter ? 1.1 : 0.45);
        } else if ((attack.partMul || 1) >= 2.0 && enemy.kind === "stalker") {
          if (enemy.stun) enemy.stun(0.22);
        }
      }

      // ------------------------------------------------------------ feedback
      const hx = contact.x;
      const hy = contact.y;
      const dir = sign(p.x - hx) ? -sign(p.x - hx) : p.facing;
      const heavy = (attack.partMul || 1) >= 2.0 || limbBroke;
      const power = clamp((attack.hitstop || 0.05) / 0.05, 1, 2.6);

      this.fx.slash(hx, hy, rand(TAU), 10, { arc: 1.7, life: 0.16, width: 7 + power * 3, color: "#e2fdff", grow: 100 });
      this.fx.impact(hx, hy, dir, power, enemy.kind === "stalker" ? "#ffdcb0" : "#ffe0b0");
      this.fx.spark(hx, hy, dir, -0.6, {
        count: Math.floor(7 + power * 6),
        speed: 340 + power * 190, spread: 0.85,
        life: 0.42, scale: 0.7 + power * 0.3,
        color: enemy.kind === "stalker" ? "#ffd8a0" : "#ffcf8a",
      });
      if (enemy.kind !== "stalker") {
        this.fx.spark(hx, hy, dir, -0.9, { count: 4, speed: 520, life: 0.3, color: "#ffffff", spread: 0.5, scale: 0.6 });
      } else {
        this.fx.oil(hx, hy, dir, 5 + (limbBroke ? 8 : 0));
      }
      if (heavy) {
        this.fx.ring(hx, hy, { r1: 44 + power * 26, width: 2 + power, color: "#ffe2b0", life: 0.22, squash: 0.5 });
      }
      this.fx.flashBurst(hx, hy, { r: 16 + power * 16, color: "#ffffff", life: 0.1 });

      const hs = attack.hitstop || 0.05;
      this.addHitstop(limbBroke ? Math.max(0.14, hs * 1.7) : hs);
      this.cam.addShake((attack.shake || 2) * (limbBroke ? 1.6 : 1));
      this.cam.punchZoom(0.004 * power);
      if (heavy) this.fx.screenFlash(0.07, "255,240,210");

      const dmgShown = Math.round(dmg);
      this.fx.text(hx + rand(16, -16), hy - 18, String(dmgShown), {
        color: limbBroke ? "#ffe3a6" : (heavy ? "#ffe2c0" : "#fff4e2"),
        size: heavy ? 27 : 21, vy: -150, vx: rand(60, -60), life: 0.6, gravity: 320,
      });

      this.audio.hit(power * (heavy ? 1.5 : 1));
      if (heavy) this.audio.heavy(power);

      this.stats.hits++;
      this.stats.damageDealt += dmg;
      this.addCombo();
      this.score += Math.floor(dmg * 10 * (1 + this.combo * 0.02));
      this.focusGain(3.2 + (limbBroke ? 7 : 0) + (attack.counter ? 10 : 0));
      if (limbBroke) {
        this.hudPulse = 1;
        this.fx.screenFlash(0.1, "255,220,180");
      }
    }

    spawnLimbDebris(enemy, key, worldX, worldY) {
      const f = enemy.facing;
      const kind = enemy.kind;
      let type = "arm";
      if (key === "head") type = "head";
      else if (key.startsWith("leg")) type = "leg";
      else if (key.startsWith("arm")) type = "arm";
      let colors;
      if (kind === "stalker") colors = ["#2b3a3c", "#8f9b8c", "#ffb070"];
      else if (kind === "blade") colors = ["#4a3b2e", "#2a2018", "#ff9a50"];
      else colors = ["#4e4d45", "#2a2925", "#ff8a3c"];
      const part = {
        type,
        palette: colors,
        len: type === "head" ? 24 : (type === "leg" ? 58 : 48),
        w0: type === "head" ? 14 : 9,
        w1: type === "head" ? 9 : 5,
        headKind: type === "head",
      };
      const dir = sign(worldX - this.player.x) || 1;
      this.fx.limb(worldX, worldY, part, {
        vx: dir * rand(420, 160) + this.player.vx * 0.25,
        vy: rand(-180, -540),
        rot: rand(TAU),
        spin: rand(18, -18),
        life: 2.8,
        trail: true,
      });
      // stump spray
      this.fx.oil(worldX, worldY, dir, 14);
      this.fx.spark(worldX, worldY, dir, -0.8, { count: 18, speed: 560, life: 0.55, color: "#ffbd73", scale: 1.1 });
      this.fx.emberBurst(worldX, worldY, 8, "#ffab5e", 220);
      this.fx.ring(worldX, worldY, { r1: 64, width: 3.5, color: "#ffdbb0", life: 0.28, squash: 0.7 });
      this.audio.limbBreak();
      this.cam.addShake(8);
      this.addHitstop(0.13);
      this.stats.limbBreaks++;
      this.score += 120;
      this.focusGain(9);
      const labels = { head: "斩 首", armL: "断 臂", armR: "断 臂", legL: "断 腿", legR: "断 腿" };
      this.fx.text(worldX, worldY - 60, labels[key] || "部 位 破 坏", {
        color: "#ffe1b0", size: 25, vy: -105, life: 0.95, glow: 1, gravity: 30,
      });
      this.hudPulse = 1;
      this.fx.screenFlash(0.08, "255,210,160");
    }

    spawnProjectile(o) {
      this.projectiles.push({
        x: o.x, y: o.y, vx: o.vx, vy: o.vy,
        dmg: o.dmg || 10, life: 3.2, kind: o.kind || "bolt",
        fromEnemy: o.fromEnemy !== false,
        trail: [],
      });
    }

    onEnemyDeath(enemy) {
      this.stats.kills++;
      this.score += enemy.score || 20;
      this.combo += 1;
      this.comboTimer = 2.3;
      this.comboPop = 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.focusGain(8);
      this.fx.text(enemy.x, -110, "击 破", { color: "#ffd9a0", size: 26, vy: -90, life: 0.9, glow: 1 });
      this.fx.emberBurst(enemy.x, -60, 22, "#ffa25c", 340);
      this.fx.spark(enemy.x, -60, 0, -1, { count: 18, speed: 500, spread: 2.6, life: 0.5, color: "#ffc890" });
      this.addHitstop(0.06);
      this.cam.addShake(5);
    }

    // ------------------------------------------------------------------ update
    frame(now) {
      const realDt = Math.min(0.05, (now - this.lastT) / 1000) || 0.016;
      this.lastT = now;
      this.realTime += realDt;
      this.tick(realDt);
      this.render();
      AV.Input.endFrame();
      requestAnimationFrame(this.frame.bind(this));
    }

    handleGlobalInput() {
      const inp = AV.Input;
      if (inp.wasPressed("KeyM")) {
        const m = !this.audio.muted;
        this.applyMute(m);
      }
      AV.Input.mutePressed = inp.wasPressed("KeyM");
      if (this.state === "title") {
        if (inp.wasPressed("Enter", "Space", "KeyJ") || inp.pointerPressed) this.startRun();
        return;
      }
      if (this.state === "dead") {
        AV.Input.deadConfirm = inp.wasPressed("KeyR", "Enter");
        return;
      }
      if (inp.wasPressed("Escape") || inp.wasPressed("KeyP")) {
        this.togglePause();
        return;
      }
      if (this.state === "paused") {
        if (inp.wasPressed("Enter")) this.togglePause();
        return;
      }
      if (this.state === "playing" && inp.wasPressed("KeyR")) {
        this.restart();
      }
    }

    tick(realDt) {
      if (this.state === "dead" && AV.Input.deadConfirm) {
        AV.Input.deadConfirm = false;
        this.restart();
        return;
      }
      this.handleGlobalInput();
      this.audio.tick(realDt);

      if (this.state === "paused") {
        this.cam.update(realDt * 0.2, this.player, this.arenaW);
        return;
      }
      if (this.state === "title") {
        this.time += realDt;
        this.titleT += realDt;
        this.fx.update(realDt);
        this.stage.update(realDt);
        this.player.animT += realDt;
        this.player.updatePose(realDt);
        this.player.vx = 0;
        this.cam.update(realDt, this.player, this.arenaW);
        this.cam.x = this.player.x;
        this.cam.y = -205;
        if (Math.random() < 0.02) this.fx.emberBurst(this.player.x + rand(120, -120), -rand(40), 1, "#ffa860", 40);
        return;
      }

      if (this.state === "playing") {
        if (this.waveDelay > 0) {
          this.waveDelay -= realDt;
          if (this.waveDelay <= 0 && this.wave === 0) this.startWave(1);
        }
        if (this.wave > 0) {
          for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
            const s = this.spawnQueue[i];
            s.at -= realDt;
            if (s.at <= 0) {
              this.spawnEnemy(s.kind, s.x, s.tier);
              this.spawnQueue.splice(i, 1);
            }
          }
        }
        this.waveBanner = Math.max(0, this.waveBanner - realDt);
        this.comboPop = Math.max(0, this.comboPop - realDt * 4);
        this.hudPulse = Math.max(0, this.hudPulse - realDt * 3);
        this.uiFlash = Math.max(0, this.uiFlash - realDt * 3);
        this.killFeed = this.killFeed.filter((k) => (k.t -= realDt) > 0);
      }

      // time scaling
      let ts = 1;
      if (this.slowmoT > 0) {
        this.slowmoT -= realDt;
        ts = this.slowmo;
        if (this.slowmoT <= 0) { this.slowmo = 0; ts = 1; }
      }
      let worldDt = realDt * ts;
      let frozen = false;
      if (this.hitstop > 0) {
        this.hitstop -= realDt;
        worldDt *= 0.02;
        frozen = true;
      }

      // combo timer (real time)
      if (this.state === "playing") {
        if (this.comboTimer > 0) {
          this.comboTimer -= realDt;
          if (this.comboTimer <= 0) this.combo = 0;
        }
      }

      if (this.state === "playing" || this.state === "dead") {
        if (this.state === "dead") this.deathT += realDt;

        // player
        if (this.player.alive || this.state === "playing") {
          this.player.update(worldDt, this);
        }
        // enemies
        for (const e of this.enemies) {
          if (e.spawnT !== undefined && e.spawnT > 0) { e.update(worldDt, this); continue; }
          e.update(worldDt, this);
        }
        // clean dead + faded
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (e.dying && e.deadT > 2.4) this.enemies.splice(i, 1);
          else if (!e.alive && e.dying === undefined) this.enemies.splice(i, 1);
        }

        this.updateProjectiles(worldDt, realDt);

        // wave progression
        if (this.state === "playing" && this.wave > 0 && this.spawnQueue.length === 0 && this.enemies.length === 0 && this.waveDelay <= 0) {
          this.queueNextWave();
        }
        if (this.state === "playing" && this.waveDelay > 0) {
          this.waveDelay -= realDt;
          if (this.waveDelay <= 0) {
            if (this.wave === 0) this.startWave(1);
            else this.startWave(this.wave + 1);
          }
        }
      }

      // fx always run on real time for readability
      this.fx.update(realDt);
      this.stage.update(frozen ? realDt * 0.25 : realDt);
      this.cam.update(realDt, this.player, this.arenaW);
      if (this.state === "dead") {
        this.cam.x = lerp(this.cam.x, this.player.x, 1 - Math.exp(-realDt * 1.5));
      }

      // hp bar smoothing
      const hpFrac = clamp(this.player.hp / this.player.maxHp, 0, 1);
      this.hpDisplay = lerp(this.hpDisplay, hpFrac, 1 - Math.exp(-realDt * 5));
      this.focusDisplay = lerp(this.focusDisplay, this.player.focus / this.player.maxFocus, 1 - Math.exp(-realDt * 8));
      this.scoreDisplay = lerp(this.scoreDisplay, this.score, 1 - Math.exp(-realDt * 7));
      if (Math.abs(this.scoreDisplay - this.score) < 1) this.scoreDisplay = this.score;
    }

    updateProjectiles(worldDt, realDt) {
      const p = this.player;
      const pb = p.hitbox();
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.life -= realDt;
        pr.trail.push({ x: pr.x, y: pr.y, life: 0.16 });
        if (pr.trail.length > 6) pr.trail.shift();
        for (const t of pr.trail) t.life -= realDt;
        pr.x += pr.vx * worldDt;
        pr.y += pr.vy * worldDt;

        // player attacks can cut bolts
        if (pr.fromEnemy && p.state === "attack" && p.attack) {
          const tt = p.attackT / p.attack.dur;
          if (tt >= p.attack.hit[0] && tt <= p.attack.hit[1]) {
            const hx = p.x + p.facing * p.attack.reach * 0.5;
            const hy = p.y - 60;
            if (Math.abs(pr.x - hx) < p.attack.reach * 0.5 + 16 && Math.abs(pr.y - hy) < p.attack.hh * 0.5 + 12) {
              this.fx.spark(pr.x, pr.y, sign(pr.vx), -0.4, { count: 12, speed: 380, life: 0.3, color: "#ffe0a0" });
              this.fx.flashBurst(pr.x, pr.y, { r: 20, color: "#fff0c0" });
              this.audio.parryReady();
              this.projectiles.splice(i, 1);
              continue;
            }
          }
        }

        if (pr.y > 0) {
          this.fx.spark(pr.x, 0, sign(pr.vx), -1, { count: 7, speed: 300, life: 0.3, color: "#ffcf90" });
          this.projectiles.splice(i, 1);
          continue;
        }
        if (pr.life <= 0 || pr.x < -80 || pr.x > this.arenaW + 80) {
          this.projectiles.splice(i, 1);
          continue;
        }
        // collide with enemies when reflected
        if (!pr.fromEnemy) {
          for (const e of this.enemies) {
            if (!e.alive || e.spawning) continue;
            const hb = e.hurtbox();
            if (Math.abs(pr.x - hb.x) < hb.w * 0.5 + 8 && Math.abs(pr.y - hb.y) < hb.h * 0.5 + 8) {
              e.hurt(pr.dmg * 3, { contact: { x: pr.x, y: pr.y }, kb: pr.vx * 0.2, kbY: -120 }, this);
              this.fx.impact(pr.x, pr.y, sign(pr.vx), 1.6, "#fff0c0");
              this.audio.heavy(1);
              this.projectiles.splice(i, 1);
              break;
            }
          }
          continue;
        }
        // hit player
        if (p.alive && Math.abs(pr.x - pb.x) < pb.w * 0.5 + 6 && pr.y > pb.y - pb.h * 0.5 - 6 && pr.y < pb.y + pb.h * 0.5 + 4) {
          if (this.tryPlayerParry({ x: pr.x, stun: (t) => {}, parried: false })) {
            pr.fromEnemy = false;
            pr.vx *= -1.35;
            pr.vy = -220;
            pr.dmg = 14;
            pr.life = 2.4;
            this.projectiles.splice(i, 1);
            this.spawnProjectile({ x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, dmg: 20, kind: "bolt", fromEnemy: false });
            this.addHitstop(0.1);
            continue;
          }
          if (p.iFrames <= 0 && !(p.state === "dash")) {
            p.takeDamage(pr.dmg, pr.x, { kb: 200 });
            this.fx.impact(pr.x, pr.y, sign(pr.vx), 1.2, "#ffb080");
            this.projectiles.splice(i, 1);
          } else if (p.state === "dash") {
            this.fx.ghost(p.x, p.y, p.pose, p.facing, { life: 0.2, alpha: 0.25 });
          }
        }
      }
      for (const pr of this.projectiles) {
        pr.trail = pr.trail.filter((t) => t.life > 0);
      }
    }

    // ------------------------------------------------------------------ render
    render() {
      const ctx = this.ctx;
      const scale = this.scale;
      const cam = this.cam;
      const dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#07080a";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // letterbox-free logical transform
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const W = cam.w, H = cam.h;

      // background (screen space, parallax computed from cam)
      this.stage.draw(ctx, cam);

      // world transform
      ctx.save();
      const z = cam.zoom;
      ctx.translate(W / 2 + cam.shakeX, H / 2 + cam.shakeY);
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);

      this.stage.drawGround(ctx, cam);

      // telegraphs
      for (const e of this.enemies) this.drawTelegraph(ctx, e);

      // in-world ember ambience behind characters
      this.stage.drawAmbient(ctx, cam);

      // enemies
      const sorted = this.enemies.slice().sort((a, b) => a.x - b.x);
      for (const e of sorted) e.draw(ctx, this);

      // projectiles
      this.drawProjectiles(ctx);

      // player
      this.player.draw(ctx, this);

      // fx
      this.drawEffects(ctx);

      ctx.restore();

      // foreground (screen space)
      this.stage.drawForeground(ctx, cam);

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.3, W / 2, H * 0.5, H * 0.9);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.66)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // flash
      if (this.fx.flash > 0.002) {
        ctx.fillStyle = "rgba(" + this.fx.flashColor + "," + this.fx.flash * 0.65 + ")";
        ctx.fillRect(0, 0, W, H);
      }

      // HUD
      if (this.state === "title") this.drawTitle(ctx, W, H);
      else {
        this.drawHUD(ctx, W, H);
        if (this.state === "playing") this.drawSkillTargeting(ctx, W, H);
        if (this.state === "paused") this.drawPause(ctx, W, H);
        if (this.state === "dead") this.drawDeath(ctx, W, H);
      }
    }

    drawTelegraph(ctx, e) {
      if (!e.alive || e.spawning) return;
      const st = e.state || "";
      const f = e.facing;
      ctx.save();
      if (e.kind === "turret") {
        if (e.aimT > 0) {
          const p = this.player;
          const bx = e.x + f * 40, by = -56;
          const ang = Math.atan2((p.y - 60) - by, p.x - bx);
          const a = 0.16 + (1 - e.aimT / 0.52) * 0.44;
          ctx.strokeStyle = "rgba(255,80,50," + a + ")";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5, 9]);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ang) * 1100, by + Math.sin(ang) * 1100);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = "rgba(255,90,50," + (a * 0.7) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(bx + Math.cos(ang) * 260, by + Math.sin(ang) * 260, 9 + Math.sin(this.realTime * 20) * 2, 0, TAU);
          ctx.stroke();
        }
      } else if (st === "windup" || st === "leapPrep") {
        // claw arc
        const prog = st === "leapPrep" ? 0.5 : clamp(e.stateT / 0.34, 0, 1);
        ctx.strokeStyle = "rgba(255,90,50," + (0.18 + prog * 0.3) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x + f * 10, -52, 66, (-0.9 + (1 - prog) * 0.4) * f > 0 ? 0 : 0, TAU * 0.28);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,110,60," + (0.05 + prog * 0.12) + ")";
        ctx.beginPath();
        ctx.ellipse(e.x + f * 42, -50, 58, 48, 0, 0, TAU);
        ctx.fill();
      } else if (st === "chopWind" || st === "slashWind") {
        const prog = clamp(e.stateT / (e.windDur || 0.5), 0, 1);
        const reach = st === "slashWind" ? 110 : 160;
        ctx.fillStyle = "rgba(255,80,40," + (0.05 + prog * 0.15) + ")";
        ctx.beginPath();
        ctx.ellipse(e.x + f * reach * 0.55, -78, reach * 0.75, 100, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,120,70," + (0.12 + prog * 0.4) + ")";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(e.x + f * reach * 0.55, -78, reach * 0.7, 92, 0, 0, TAU);
        ctx.stroke();
        // edge arc growing
        ctx.strokeStyle = "rgba(255,170,100," + (prog * 0.65) + ")";
        ctx.lineWidth = 4;
        ctx.beginPath();
        const a0 = f > 0 ? -2.4 : Math.PI - 0.3;
        ctx.arc(e.x + f * 20, -90, 90 + prog * 40, a0, a0 + 1.9 * f, f < 0);
        ctx.stroke();
      } else if (st === "slamWind") {
        const prog = clamp(e.stateT / (e.windDur || 0.75), 0, 1);
        ctx.fillStyle = "rgba(255,70,30," + (0.06 + prog * 0.16) + ")";
        ctx.beginPath();
        ctx.ellipse(e.x + f * 80, -8, 100, 26, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,110,60," + (0.2 + prog * 0.5) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(e.x + f * 80, -8, 92 + prog * 16, 22, 0, 0, TAU);
        ctx.stroke();
        // overhead indicator
        ctx.fillStyle = "rgba(255,90,50," + (0.4 + Math.sin(this.realTime * 26) * 0.2) + ")";
        ctx.font = "700 34px UIFont, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("危", e.x, -242);
      } else if (st === "chargeWind") {
        const prog = clamp(e.stateT / (e.windDur || 0.6), 0, 1);
        ctx.fillStyle = "rgba(255,70,30," + (0.04 + prog * 0.14) + ")";
        ctx.fillRect(f > 0 ? e.x + 20 : e.x - 340, -140, 320, 140);
        ctx.strokeStyle = "rgba(255,110,60," + (0.15 + prog * 0.4) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x + f * 20, -140); ctx.lineTo(e.x + f * 20, 0);
        ctx.stroke();
      } else if (st === "chargeRun") {
        ctx.fillStyle = "rgba(255,80,40," + (0.06 + Math.sin(this.realTime * 18) * 0.04) + ")";
        ctx.fillRect(f > 0 ? e.x + 20 : e.x - 300, -140, 280, 140);
      } else if (st === "stompWind") {
        const prog = clamp(e.stateT / (e.windDur || 0.38), 0, 1);
        ctx.strokeStyle = "rgba(255,120,60," + (0.2 + prog * 0.4) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(e.x + f * 30, -4, 70 + prog * 50, 18, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawProjectiles(ctx) {
      for (const pr of this.projectiles) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const col = pr.fromEnemy ? "255,170,80" : "180,255,255";
        for (const t of pr.trail) {
          const a = clamp(t.life / 0.16, 0, 1);
          ctx.fillStyle = "rgba(" + col + "," + a * 0.35 + ")";
          ctx.beginPath();
          ctx.arc(t.x, t.y, 3.5 * a + 1, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(" + col + ",0.35)";
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 11, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,240,210,0.95)";
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 3.6, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawEffects(ctx) {
      const fx = this.fx;
      // ghost poses (silhouettes)
      for (const g of fx.ghosts) {
        const a = clamp(g.life / g.max, 0, 1);
        this.drawSilhouette(ctx, g.x, g.y, g.pose, g.facing, g.color, a * (g.alpha || 0.4), g.dims);
      }
      // limbs first (behind sparks)
      for (const d of fx.debris) {
        this.drawLimbDebris(ctx, d);
      }
      for (const e of fx.list) {
        const k = e.k;
        const a = clamp(e.life / e.max, 0, 1);
        if (k === "spark") {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = e.color;
          ctx.globalAlpha = a;
          ctx.lineWidth = e.size * 0.8;
          ctx.lineCap = "round";
          const len = clamp(Math.hypot(e.vx, e.vy) * 0.018, 3, 22);
          const sp = Math.hypot(e.vx, e.vy) || 1;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x - (e.vx / sp) * len, e.y - (e.vy / sp) * len);
          ctx.stroke();
          ctx.restore();
        } else if (k === "ember") {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = a * 0.2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size * 3, 0, TAU);
          ctx.fill();
          ctx.restore();
        } else if (k === "dust") {
          ctx.save();
          ctx.globalAlpha = a * 0.28;
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size * (1.6 - a * 0.6), 0, TAU);
          ctx.fill();
          ctx.restore();
        } else if (k === "oil") {
          ctx.save();
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = "#0e0b0a";
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.size * 1.4, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(120,40,20,0.5)";
          ctx.beginPath();
          ctx.arc(e.x - e.size * 0.35, e.y - e.size * 0.35, e.size * 0.6, 0, TAU);
          ctx.fill();
          ctx.restore();
        } else if (k === "slash") {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.translate(e.x, e.y);
          ctx.rotate(e.angle + e.rot);
          const prog = 1 - a;
          const radius = e.radius + prog * e.grow;
          const half = e.arc / 2;
          const start = -half + prog * 0.35;
          const end = half - (1 - a) * 0.2;
          const grad = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius);
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(0.7, e.color);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = grad;
          ctx.globalAlpha = a * 0.9 * e.glow;
          ctx.lineWidth = e.width * (0.5 + a * 0.8);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(0, 0, radius, start, end);
          ctx.stroke();
          // inner hot core
          ctx.globalAlpha = a * 0.55;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(1.4, e.width * 0.28);
          ctx.beginPath();
          ctx.arc(0, 0, radius, start + half * 0.3, end - half * 0.3);
          ctx.stroke();
          ctx.restore();
        } else if (k === "ring") {
          ctx.save();
          const prog = 1 - a;
          const r = lerp(e.r, e.r1, U.easeOutCubic(prog));
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = a * 0.9;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = e.width * (0.4 + a * 0.9);
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, r, r * e.squash, e.rot, 0, TAU);
          ctx.stroke();
          ctx.restore();
        } else if (k === "flash") {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (1.4 - a * 0.4));
          g.addColorStop(0, "rgba(255,255,255," + a * 0.85 + ")");
          g.addColorStop(0.4, e.color + "");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.globalAlpha = a;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r * (1.4 - a * 0.4), 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
      // floating text
      for (const t of fx.texts) {
        const a = clamp(t.life / t.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 2.2);
        ctx.font = "700 " + t.size + "px UIFont, sans-serif";
        ctx.textAlign = t.align;
        ctx.textBaseline = "middle";
        if (t.glow) {
          ctx.shadowColor = "rgba(255,200,140,0.9)";
          ctx.shadowBlur = 12;
        }
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillText(t.str, t.x + 1.5, t.y + 2);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
        ctx.restore();
      }
    }

    drawSilhouette(ctx, x, y, pose, facing, color, alpha, dims) {
      if (!pose || alpha <= 0.01) return;
      const d = dims || G.DIMS.player;
      const sk = G.makeSkel(pose, d);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(facing, 1);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = "round";
      const line = (a, b, w) => {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };
      const torsoW = d.shoulderW * 0.8;
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.moveTo(sk.hip.x - torsoW * 0.4, sk.hip.y);
      ctx.lineTo(sk.neck.x - torsoW * 0.5, sk.neck.y);
      ctx.lineTo(sk.neck.x + torsoW * 0.5, sk.neck.y);
      ctx.lineTo(sk.hip.x + torsoW * 0.4, sk.hip.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha;
      line(sk.backArm.sh, sk.backArm.el, 4.5);
      line(sk.backArm.el, sk.backArm.hand, 3.5);
      line(sk.backLeg.hip, sk.backLeg.knee, 5);
      line(sk.backLeg.knee, sk.backLeg.foot, 4);
      line(sk.frontLeg.hip, sk.frontLeg.knee, 5);
      line(sk.frontLeg.knee, sk.frontLeg.foot, 4);
      line(sk.frontArm.sh, sk.frontArm.el, 4.5);
      line(sk.frontArm.el, sk.frontArm.hand, 3.5);
      ctx.beginPath();
      ctx.arc(sk.head.x, sk.head.y, d.headR * 0.7, 0, TAU);
      ctx.fill();
      // blade line
      const w = sk.weapon;
      const a = w.ang * D2R;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(w.x + Math.cos(a) * 80, w.y + Math.sin(a) * 80);
      ctx.stroke();
      ctx.restore();
    }

    drawLimbDebris(ctx, d) {
      const part = d.part;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = clamp(d.life / 0.8, 0, 1);
      if (d.trail) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(255,150,80,0.25)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-d.vx * 0.03, -d.vy * 0.03);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      const [c1, c2, c3] = part.palette;
      if (part.type === "head") {
        ctx.fillStyle = c1;
        ctx.strokeStyle = "#05070a";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, part.w0, part.w0 * 0.9, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = c2;
        ctx.beginPath();
        ctx.ellipse(-2, 3, part.w0 * 0.55, part.w0 * 0.45, 0, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = c3;
        ctx.beginPath();
        ctx.arc(4, -2, 2.2, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        // two-segment limb
        const len = part.len;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#05070a";
        ctx.lineWidth = part.w0 + 2;
        ctx.beginPath();
        ctx.moveTo(-len * 0.5, 0);
        ctx.lineTo(0, 0);
        ctx.lineTo(len * 0.5, 0);
        ctx.stroke();
        ctx.strokeStyle = c1;
        ctx.lineWidth = part.w0;
        ctx.beginPath();
        ctx.moveTo(-len * 0.5, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.strokeStyle = c2;
        ctx.lineWidth = part.w1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len * 0.5, 0);
        ctx.stroke();
        ctx.fillStyle = c3;
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        ctx.arc(len * 0.5, 0, part.w1 * 0.9, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------------ HUD / screens
    drawSkillTargeting(ctx, W, H) {
      const p = this.player;
      if (!p.alive) return;
      const inp = AV.Input;
      const w = this.screenToWorld(inp.mouseX, inp.mouseY);
      const toScreen = (wx, wy) => {
        const lx = (wx - this.cam.x) * this.cam.zoom + this.cam.w / 2;
        const ly = (wy - this.cam.y) * this.cam.zoom + this.cam.h / 2;
        return { x: lx * (this.cssW / this.cam.w), y: ly * (this.cssH / this.cam.h) };
      };
      // iaido reticle: nearest enemy within cursor range while skill is ready
      if (p.iaidoCooldown <= 0) {
        let best = null, bd = 460;
        for (const e of this.enemies) {
          if (!e.alive || e.spawning) continue;
          const hb = e.hurtbox();
          const d = Math.hypot(hb.x - w.x, hb.y - w.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const hb = best.hurtbox();
          const s = toScreen(hb.x, hb.y);
          const t = this.realTime;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(t * 0.9);
          ctx.strokeStyle = "rgba(255,235,153,0.85)";
          ctx.lineWidth = 1.4;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, hb.w * 0.62 + 12, i * Math.PI / 2 + 0.18, i * Math.PI / 2 + 0.62);
            ctx.stroke();
          }
          ctx.restore();
          const ly2 = s.y - hb.h * 0.62 - 16;
          ctx.save();
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,235,180,0.9)";
          ctx.font = "700 10px UIFont, sans-serif";
          ctx.fillText("左键 · 一闪", s.x, ly2);
          ctx.restore();
        }
      }
      // execution reticle on wounded foes
      if (p.executionCooldown <= 0) {
        for (const e of this.enemies) {
          if (!e.alive || e.spawning || e.hp / e.maxHp > 0.3) continue;
          const hb = e.hurtbox();
          const s = toScreen(hb.x, hb.y);
          const pulse = 0.6 + Math.sin(this.realTime * 7) * 0.3;
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = "#ff5c4d";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hb.w * 0.62 + 14, 0, TAU);
          ctx.stroke();
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,120,100,0.95)";
          ctx.font = "700 10px UIFont, sans-serif";
          ctx.fillText("中键 · 处刑", s.x, s.y - hb.h * 0.62 - 16);
          ctx.restore();
        }
      }
    }

    drawHUD(ctx, W, H) {
      const p = this.player;
      ctx.save();
      // top-left panel
      const px = 28, py = 26;
      // title mark
      ctx.fillStyle = "rgba(255,225,190,0.9)";
      ctx.font = "700 15px UIFont, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("余 烬 之 刃", px, py + 2);
      ctx.fillStyle = "rgba(255,190,140,0.45)";
      ctx.font = "700 9px UIFont, sans-serif";
      ctx.fillText("ASHEN  VOW", px + 1, py + 15);

      // HP
      const bw = 258, bh = 11;
      const bx = px, by = py + 30;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = "rgba(60,20,14,0.85)";
      ctx.fillRect(bx, by, bw, bh);
      // trailing damage
      ctx.fillStyle = "rgba(255,120,70,0.35)";
      ctx.fillRect(bx, by, bw * this.hpDisplay, bh);
      const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
      const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grd.addColorStop(0, "#c8342c");
      grd.addColorStop(0.5, "#e8613a");
      grd.addColorStop(1, "#ffb15c");
      ctx.fillStyle = grd;
      ctx.fillRect(bx, by, bw * hpFrac, bh);
      ctx.fillStyle = "rgba(255,240,220,0.22)";
      ctx.fillRect(bx, by, bw * hpFrac, 2);
      // segment ticks
      ctx.strokeStyle = "rgba(10,8,8,0.55)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const x = bx + (bw / 5) * i;
        ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, by + bh); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,235,210,0.85)";
      ctx.font = "700 10px UIFont, sans-serif";
      ctx.fillText("生 命", bx, by - 6);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,235,210,0.65)";
      ctx.fillText(Math.ceil(p.hp) + " / " + p.maxHp, bx + bw, by - 6);

      // focus gauge
      const fy = by + bh + 12;
      const fw = 190;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(120,240,255,0.55)";
      ctx.font = "700 10px UIFont, sans-serif";
      ctx.fillText("刃 势", bx, fy + 8);
      const fx0 = bx + 40;
      ctx.fillStyle = "rgba(8,26,30,0.75)";
      ctx.fillRect(fx0, fy, fw, 7);
      const fg = ctx.createLinearGradient(fx0, 0, fx0 + fw, 0);
      fg.addColorStop(0, "#2f9fb4");
      fg.addColorStop(0.7, "#7cf3ff");
      fg.addColorStop(1, "#e9ffff");
      ctx.fillStyle = fg;
      ctx.fillRect(fx0, fy, fw * clamp(this.focusDisplay, 0, 1), 7);
      ctx.strokeStyle = "rgba(160,250,255,0.25)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const x = fx0 + (fw / 3) * i;
        ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x, fy + 7); ctx.stroke();
      }
      if (p.focus >= p.maxFocus) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255,220,170," + (0.35 + Math.sin(this.realTime * 8) * 0.2) + ")";
        ctx.fillRect(fx0, fy - 1, fw, 9);
        ctx.restore();
        ctx.fillStyle = "rgba(255,226,180,0.95)";
        ctx.font = "700 10px UIFont, sans-serif";
        ctx.fillText("满 · K 斩罪", fx0 + fw + 10, fy + 8);
      }

      // score
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,235,210,0.55)";
      ctx.font = "700 9px UIFont, sans-serif";
      ctx.fillText("SCORE", bx, fy + 28);
      ctx.fillStyle = "rgba(255,240,220,0.9)";
      ctx.font = "700 16px UIFont, sans-serif";
      ctx.fillText(Math.floor(this.scoreDisplay).toLocaleString("en-US"), bx + 44, fy + 29);

      // top center wave
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,235,210,0.7)";
      ctx.font = "700 12px UIFont, sans-serif";
      const remain = this.enemies.filter((e) => e.alive).length + this.spawnQueue.length;
      ctx.fillText("第 " + Math.max(1, this.wave) + " 波    ·    余 敌 " + remain, W / 2, 36);
      // thin rule
      ctx.strokeStyle = "rgba(255,180,120,0.18)";
      ctx.lineWidth = 1;
      const ruleW = 170;
      ctx.beginPath();
      ctx.moveTo(W / 2 - ruleW, 46);
      ctx.lineTo(W / 2 + ruleW, 46);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,180,120,0.55)";
      ctx.fillRect(W / 2 - 1.5, 43, 3, 6);

      // combo display
      if (this.combo > 1) {
        const cx = W - 54, cy = H * 0.36;
        const pop = 1 + this.comboPop * 0.22;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.textAlign = "right";
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255,170,90,0.15)";
        ctx.font = "700 64px UIFont, sans-serif";
        ctx.fillText(String(this.combo), 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#ffe6c4";
        ctx.font = "700 54px UIFont, sans-serif";
        ctx.shadowColor = "rgba(255,150,70,0.75)";
        ctx.shadowBlur = 16;
        ctx.fillText(String(this.combo), 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,200,150,0.85)";
        ctx.font = "700 13px UIFont, sans-serif";
        ctx.letterSpacing = "4px";
        ctx.fillText("连 击", 0, 22);
        ctx.restore();
        // timer sliver
        const w2 = 66;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(cx - w2, cy + 30, w2, 3);
        ctx.fillStyle = "#ffb470";
        ctx.fillRect(cx - w2, cy + 30, w2 * clamp(this.comboTimer / 2.3, 0, 1), 3);
        // grade
        const grade = this.combo >= 30 ? "S" : this.combo >= 20 ? "A" : this.combo >= 12 ? "B" : this.combo >= 6 ? "C" : "D";
        ctx.textAlign = "right";
        ctx.fillStyle = grade === "S" ? "#ffe2a6" : "rgba(255,220,180,0.55)";
        ctx.font = "700 20px UIFont, sans-serif";
        ctx.fillText(grade, cx, cy + 68);
      }

      // boss bar (heaviest alive near player)
      let boss = null;
      for (const e of this.enemies) {
        if (!e.alive || e.spawning) continue;
        if (e.kind === "blade" || e.kind === "brute") {
          if (!boss || Math.abs(e.x - p.x) < Math.abs(boss.x - p.x)) boss = e;
        }
      }
      if (boss) {
        const bw2 = 420;
        const bx2 = W / 2 - bw2 / 2;
        const by2 = H - 132;
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.fillRect(bx2 - 3, by2 - 3, bw2 + 6, 14);
        ctx.fillStyle = "rgba(60,22,16,0.8)";
        ctx.fillRect(bx2, by2, bw2, 8);
        const bf = clamp(boss.hp / boss.maxHp, 0, 1);
        const bg = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
        bg.addColorStop(0, "#a33224");
        bg.addColorStop(0.6, "#e0703c");
        bg.addColorStop(1, "#ffc06a");
        ctx.fillStyle = bg;
        ctx.fillRect(bx2, by2, bw2 * bf, 8);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,235,215,0.85)";
        ctx.font = "700 12px UIFont, sans-serif";
        const name = boss.kind === "blade" ? "锻 炉 剑 鬼" : "熔 铁 巨 傀";
        ctx.fillText(name, W / 2, by2 - 8);
        // limb pips
        const keys = ["head", "armL", "armR", "legL", "legR"];
        for (let i = 0; i < keys.length; i++) {
          const broken = boss.limbs[keys[i]].broken;
          ctx.fillStyle = broken ? "rgba(255,110,60,0.85)" : "rgba(255,235,215,0.22)";
          ctx.fillRect(bx2 + i * 14, by2 + 11, 9, 3);
        }
      }

      // bottom control hints (faded out on the death screen so they don't compete)
      const hintAlpha = this.state === "dead" ? 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = hintAlpha;
      const hints = [
        ["A", "D", "移动"],
        ["SPACE", "跳跃"],
        ["J", "斩击"],
        ["K", "重斩"],
        ["L", "闪避"],
        ["I", "弹反"],
        ["Q", "影分身"],
        ["R", "重来"],
        ["ESC", "暂停"],
      ];
      ctx.textAlign = "left";
      ctx.font = "700 10px UIFont, sans-serif";
      let hx = 28;
      const hy = H - 104;
      for (const [k, label] of hints) {
        ctx.fillStyle = "rgba(255,235,210,0.2)";
        ctx.fillRect(hx, hy - 12, 18 + Math.max(0, k.length - 1) * 6, 15);
        ctx.fillStyle = "rgba(255,226,190,0.9)";
        ctx.fillText(k, hx + 4, hy);
        hx += 18 + Math.max(0, k.length - 1) * 6 + 6;
        ctx.fillStyle = "rgba(255,235,210,0.45)";
        ctx.fillText(label, hx, hy);
        hx += ctx.measureText(label).width + 16;
      }
      ctx.globalAlpha = this.state === "dead" ? 0.18 : 1;

      // ---- skill panel: four named skills with key + cooldown ----
      const skills = [
        { name: "一闪·居合", key: "左键", cd: p.iaidoCooldown, max: 7.0, color: "#ffeb99", glyph: "居" },
        { name: "旋风斩", key: "右键", cd: p.stormCooldown, max: 9.0, color: "#7cf3ff", glyph: "旋" },
        { name: "影分身", key: "Q", cd: p.shadowCloneCooldown, max: 7.5, color: "#b899ff", glyph: "影" },
        { name: "处刑", key: "中键", cd: p.executionCooldown, max: 10.0, color: "#ff6b5c", glyph: "刑" },
      ];
      const sw = 140, sh = 44, gap = 8;
      let sx = W / 2 - (sw * 4 + gap * 3) / 2;
      const sy = H - 78;
      for (const s of skills) {
        const ready = s.cd <= 0.001;
        ctx.fillStyle = ready ? "rgba(18,16,20,0.72)" : "rgba(10,10,12,0.72)";
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = ready ? s.color + "88" : "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
        // glyph tile
        ctx.fillStyle = ready ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
        ctx.fillRect(sx + 5, sy + 6, 32, 32);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = ready ? s.color : "rgba(190,190,190,0.28)";
        ctx.font = "700 17px UIFont, sans-serif";
        ctx.fillText(s.glyph, sx + 21, sy + 23);
        ctx.textAlign = "left";
        ctx.fillStyle = ready ? "rgba(255,240,220,0.92)" : "rgba(200,195,190,0.32)";
        ctx.font = "700 12px UIFont, sans-serif";
        ctx.fillText(s.name, sx + 44, sy + 17);
        // key chip
        ctx.textAlign = "right";
        ctx.fillStyle = ready ? "rgba(255,235,200,0.85)" : "rgba(190,185,180,0.3)";
        ctx.font = "700 11px UIFont, sans-serif";
        ctx.fillText(s.key, sx + sw - 7, sy + 17);
        // cooldown bar
        const barW = sw - 50;
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(sx + 44, sy + 28, barW, 5);
        const frac = ready ? 1 : clamp(1 - s.cd / s.max, 0, 1);
        ctx.fillStyle = ready ? s.color : "rgba(220,160,150,0.65)";
        ctx.fillRect(sx + 44, sy + 28, barW * frac, 5);
        if (!ready) {
          ctx.textAlign = "right";
          ctx.fillStyle = "rgba(255,220,200,0.7)";
          ctx.font = "700 9px UIFont, sans-serif";
          ctx.fillText(s.cd.toFixed(1) + "s", sx + sw - 8, sy + 41);
        } else {
          ctx.textAlign = "right";
          ctx.fillStyle = "rgba(200,255,220,0.5)";
          ctx.font = "700 9px UIFont, sans-serif";
          ctx.fillText("READY", sx + sw - 8, sy + 41);
        }
        sx += sw + gap;
      }
      ctx.textBaseline = "alphabetic";
      ctx.restore();

      // wave banner
      if (this.waveBanner > 0) {
        const t = this.waveBanner;
        const a = t > 1.55 ? (2.0 - t) / 0.45 : clamp(t / 0.55, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, H * 0.23 - 34, W, 68);
        ctx.strokeStyle = "rgba(255,170,100,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W / 2 - 220, H * 0.23 + 30); ctx.lineTo(W / 2 + 220, H * 0.23 + 30); ctx.stroke();
        ctx.fillStyle = "rgba(255,225,190,0.95)";
        ctx.font = "700 30px UIFont, sans-serif";
        ctx.shadowColor = "rgba(255,140,60,0.6)";
        ctx.shadowBlur = 20;
        ctx.fillText(this.waveBannerText, W / 2, H * 0.23);
        ctx.restore();
      }

      // hurt vignette
      if (p.hurtFlash > 0.02) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
        g.addColorStop(0, "rgba(150,20,10,0)");
        g.addColorStop(1, "rgba(150,20,10," + (p.hurtFlash * 0.5) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      // low hp pulse
      if (p.alive && p.hp / p.maxHp < 0.3) {
        const a = 0.12 + Math.sin(this.realTime * 5) * 0.06;
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
        g.addColorStop(0, "rgba(180,20,10,0)");
        g.addColorStop(1, "rgba(180,20,10," + a + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    drawTitle(ctx, W, H) {
      const t = this.titleT;
      ctx.save();
      const shade = ctx.createLinearGradient(0, 0, W, 0);
      shade.addColorStop(0, "rgba(4,5,7,0.9)");
      shade.addColorStop(0.55, "rgba(4,5,7,0.55)");
      shade.addColorStop(1, "rgba(4,5,7,0.1)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);

      const bx = 92;
      const by = H * 0.30;
      ctx.textAlign = "left";
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(255,170,100,0.6)";
      ctx.font = "700 12px UIFont, sans-serif";
      ctx.fillText("A  F O R G E   D U E L", bx, by - 58);
      ctx.strokeStyle = "rgba(255,160,90,0.35)";
      ctx.beginPath();
      ctx.moveTo(bx, by - 44); ctx.lineTo(bx + 176, by - 44);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const tg = ctx.createLinearGradient(bx, by, bx + 420, by + 80);
      tg.addColorStop(0, "#fff3dc");
      tg.addColorStop(0.55, "#ffd9a8");
      tg.addColorStop(1, "#ff9a52");
      ctx.fillStyle = tg;
      ctx.font = "700 64px UIFont, sans-serif";
      ctx.shadowColor = "rgba(255,120,50,0.35)";
      ctx.shadowBlur = 34;
      ctx.fillText("余 烬 之 刃", bx, by + 22);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,220,185,0.5)";
      ctx.font = "700 13px UIFont, sans-serif";
      ctx.fillText("在锻炉的余火中，以刃为誓。", bx + 3, by + 58);

      // start prompt
      const pulse = 0.55 + Math.sin(t * 3.4) * 0.25;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ffe3bb";
      ctx.font = "700 22px UIFont, sans-serif";
      ctx.fillText("按  ENTER  /  点击画面  开始", bx + 3, by + 132);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,230,200,0.35)";
      ctx.font = "700 11px UIFont, sans-serif";
      ctx.fillText("按任意方向键前请先点击一次以启用音效", bx + 4, by + 158);

      // controls card
      const cw = 360, ch = 232;
      const cx = bx, cy = by + 190;
      ctx.fillStyle = "rgba(8,10,13,0.6)";
      ctx.strokeStyle = "rgba(255,190,130,0.16)";
      ctx.lineWidth = 1;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      ctx.fillStyle = "rgba(255,180,110,0.75)";
      ctx.font = "700 11px UIFont, sans-serif";
      ctx.fillText("操 作", cx + 16, cy + 24);
      const rows = [
        ["A / D  或  ← / →", "移动"],
        ["SPACE", "跳跃 · 二段跳 · 空中可闪"],
        ["J", "斩击 · 三连 · 挑空 · 空中追击"],
        ["K", "按住蓄力重斩 / 空中下劈"],
        ["L", "疾影步（短暂无敌）"],
        ["I", "弹反（成功后可 J 反击）"],
        ["R / ENTER", "重新开始 / 确认"],
        ["ESC / P", "暂停"],
      ];
      ctx.font = "700 11px UIFont, sans-serif";
      for (let i = 0; i < rows.length; i++) {
        const yy = cy + 46 + i * 21;
        ctx.fillStyle = "rgba(255,225,195,0.85)";
        ctx.fillText(rows[i][0], cx + 16, yy);
        ctx.fillStyle = "rgba(255,225,195,0.45)";
        ctx.fillText(rows[i][1], cx + 130, yy);
      }
      // tips
      ctx.fillStyle = "rgba(255,200,150,0.4)";
      ctx.font = "700 10px UIFont, sans-serif";
      ctx.fillText("强攻可斩断敌人肢体：断臂夺其兵器，斩首即刻终结。", cx + 16, cy + ch - 30);
      ctx.fillText("弹反成功会凝滞时间；刃势满时重斩化为「斩罪」。", cx + 16, cy + ch - 14);

      // skills card
      const sw2 = 372, sh2 = 232;
      const sx2 = cx + cw + 22, sy2 = cy;
      ctx.fillStyle = "rgba(8,10,13,0.6)";
      ctx.strokeStyle = "rgba(160,220,255,0.18)";
      ctx.fillRect(sx2, sy2, sw2, sh2);
      ctx.strokeRect(sx2 + 0.5, sy2 + 0.5, sw2 - 1, sh2 - 1);
      ctx.fillStyle = "rgba(150,225,255,0.8)";
      ctx.font = "700 11px UIFont, sans-serif";
      ctx.fillText("四 式 · 战 技", sx2 + 16, sy2 + 24);
      const skillRows = [
        ["左键 · 一闪·居合", "锁定敌影，瞬身拔刀，必定断肢"],
        ["右键 · 旋风斩", "原地回旋，周身多段斩击"],
        ["Q · 影分身", "召出残影，自行追敌一击"],
        ["中键 · 处刑", "残血敌人瞬杀，回满刃势"],
      ];
      for (let i = 0; i < skillRows.length; i++) {
        const yy = sy2 + 52 + i * 38;
        ctx.fillStyle = ["#ffeb99", "#7cf3ff", "#b899ff", "#ff6b5c"][i];
        ctx.font = "700 12px UIFont, sans-serif";
        ctx.fillText(skillRows[i][0], sx2 + 16, yy);
        ctx.fillStyle = "rgba(255,225,195,0.45)";
        ctx.font = "700 10px UIFont, sans-serif";
        ctx.fillText(skillRows[i][1], sx2 + 16, yy + 15);
      }
      ctx.fillStyle = "rgba(255,200,150,0.4)";
      ctx.font = "700 10px UIFont, sans-serif";
      ctx.fillText("鼠标技能需先点击画面启用音效。", sx2 + 16, sy2 + sh2 - 14);

      // right-side dueling silhouette flourish: big etched ring
      ctx.save();
      ctx.translate(W * 0.78, H * 0.45);
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "#ffb176";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 168, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 150, 0.4, 0.4 + 4.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 196, 2.1, 2.1 + 1.4); ctx.stroke();
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * TAU;
        const l = i % 4 === 0 ? 10 : 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 168, Math.sin(a) * 168);
        ctx.lineTo(Math.cos(a) * (168 + l), Math.sin(a) * (168 + l));
        ctx.stroke();
      }
      ctx.globalAlpha = 0.32;
      ctx.font = "700 11px UIFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("A  S  H  E  N   ·   V  O  W", 0, 210);
      ctx.restore();

      // bottom-right credit line (no identity)
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,230,200,0.22)";
      ctx.font = "700 10px UIFont, sans-serif";
      ctx.fillText("单场景 · 无限波次 · 离线游玩", W - 28, H - 24);
      ctx.restore();
    }

    drawPause(ctx, W, H) {
      ctx.save();
      ctx.fillStyle = "rgba(3,4,6,0.78)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,225,190,0.95)";
      ctx.font = "700 40px UIFont, sans-serif";
      ctx.fillText("暂 停", W / 2, H * 0.38);
      ctx.font = "700 14px UIFont, sans-serif";
      ctx.fillStyle = "rgba(255,225,195,0.6)";
      ctx.fillText("按 ESC / P / ENTER 继续", W / 2, H * 0.38 + 40);
      ctx.fillStyle = "rgba(255,225,195,0.32)";
      ctx.font = "700 12px UIFont, sans-serif";
      ctx.fillText("J 斩击 · K 蓄力重斩 · L 疾影步 · I 弹反 · SPACE 跳跃", W / 2, H * 0.38 + 74);
      ctx.restore();
    }

    drawDeath(ctx, W, H) {
      const t = Math.min(1, this.deathT / 0.9);
      ctx.save();
      ctx.fillStyle = "rgba(5,3,4," + (0.72 * t) + ")";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,150,110,0.9)";
      ctx.font = "700 13px UIFont, sans-serif";
      ctx.fillText("T H E   B L A D E   F A L L S", W / 2, H * 0.30);
      ctx.fillStyle = "#ffe2c4";
      ctx.font = "700 62px UIFont, sans-serif";
      ctx.shadowColor = "rgba(255,80,40,0.5)";
      ctx.shadowBlur = 30;
      ctx.fillText("刀 折", W / 2, H * 0.30 + 70);
      ctx.shadowBlur = 0;
      ctx.font = "700 13px UIFont, sans-serif";
      ctx.fillStyle = "rgba(255,225,195,0.55)";
      ctx.fillText("你在第 " + Math.max(1, this.wave) + " 波倒下", W / 2, H * 0.30 + 106);

      const stats = [
        ["抵达波次", String(Math.max(1, this.wave))],
        ["击败", String(this.stats.kills)],
        ["命中", String(this.stats.hits)],
        ["断肢", String(this.stats.limbBreaks)],
        ["弹反", String(this.stats.parries)],
        ["最高连击", String(this.maxCombo)],
        ["得分", Math.floor(this.score).toLocaleString("en-US")],
      ];
      const cw = 400, ch = 190;
      const cx = W / 2 - cw / 2, cy = H * 0.30 + 136;
      ctx.fillStyle = "rgba(8,9,12,0.6)";
      ctx.strokeStyle = "rgba(255,170,110,0.18)";
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      ctx.font = "700 12px UIFont, sans-serif";
      for (let i = 0; i < stats.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const xx = cx + 26 + col * (cw / 2);
        const yy = cy + 32 + row * 30;
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,225,195,0.45)";
        ctx.fillText(stats[i][0], xx, yy);
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(255,235,210,0.92)";
        ctx.fillText(stats[i][1], xx + 150, yy);
      }
      ctx.textAlign = "center";
      const pulse = 0.55 + Math.sin(this.realTime * 4) * 0.25;
      ctx.globalAlpha = t * pulse;
      ctx.fillStyle = "#ffe0b8";
      ctx.font = "700 18px UIFont, sans-serif";
      ctx.fillText("按 R / ENTER 重新开始", W / 2, cy + ch + 46);
      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // Effects.oil helper
  // --------------------------------------------------------------------------
  AV.Effects.prototype.oil = function (x, y, dirx, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(-0.6, dirx) + rand(0.9, -0.9);
      const spd = rand(300, 60);
      this.add({
        k: "oil", x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: rand(0.9, 0.3), max: 0.9,
        size: rand(3.2, 1.2), grav: 1500, drag: 1.4,
      });
    }
  };

  // --------------------------------------------------------------------------
  // boot
  // --------------------------------------------------------------------------
  function boot() {
    const canvas = document.getElementById("game");
    if (!canvas) return;
    try {
      const game = new Game(canvas);
      AV.game = game;
      const api = function combatBenchState() {
        return {
          ready: !!game.ready,
          playerAlive: !!(game.player && game.player.alive),
          enemyCount: game.enemies ? game.enemies.filter((e) => e.alive).length : 0,
          hitCount: game.stats ? game.stats.hits : 0,
          limbBreakCount: game.stats ? game.stats.limbBreaks : 0,
          playing: game.state === "playing" || game.state === "dead" ? game.state === "playing" : false,
        };
      };
      Object.defineProperty(window, "combatBenchState", { value: api, writable: false, configurable: false });
    } catch (err) {
      console.error("game init failed", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})(window.AV = window.AV || {});
