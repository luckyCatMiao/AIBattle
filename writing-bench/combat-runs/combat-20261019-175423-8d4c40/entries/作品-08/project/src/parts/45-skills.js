/* ============================================================
   Four independent skills, bound to 1 / 2 / 3 / 4
   ============================================================ */
const SKILL_DEFS = [
  {
    id: 1,
    key: "1",
    name: "月轮斩",
    glyph: "月",
    color: "#ff6f84",
    cd: 4.5,
    iframes: 0.7,
    duration: 0.64,
    desc: "环身回旋三斩，终结挑空",
  },
  {
    id: 2,
    key: "2",
    name: "影渡",
    glyph: "影",
    color: "#c7b3ff",
    cd: 6.5,
    iframes: 0.66,
    duration: 0.6,
    desc: "瞬身穿过目标，回身十字斩",
  },
  {
    id: 3,
    key: "3",
    name: "千樱葬",
    glyph: "樱",
    color: "#ff9ec4",
    cd: 11.0,
    iframes: 1.6,
    duration: 1.55,
    desc: "全场樱雨，多段斩击并终结",
  },
  {
    id: 4,
    key: "4",
    name: "断界",
    glyph: "界",
    color: "#ffd98a",
    cd: 15.0,
    iframes: 0.92,
    duration: 0.82,
    desc: "蓄势后向前斩出贯穿战场的断界巨浪",
  },
];

const SKILL_NEUTRAL = {
  handR: { x: 10, y: -24 },
  handL: { x: -3, y: -22 },
  angle: 1.15,
  lean: 0.03,
  crouch: 1,
  hipShift: 0,
  footL: { x: -8, y: 0 },
  footR: { x: 9, y: 0 },
  headTilt: 0,
  twoHand: false,
};

function skillDefById(id) {
  return SKILL_DEFS[clamp(id, 1, 4) - 1];
}

function tryStartSkill(p, id) {
  if (!p || p.dead || p.state === "hurt" || p.state === "skill") return false;
  const def = skillDefById(id);
  if (!def) return false;
  if (p.skillCd[id] > 0) {
    p.skillDenyT = 0.32;
    p.skillDenyId = id;
    audio.skillDeny();
    return false;
  }

  const dir = moveDir();
  if (dir) p.facing = dir;
  p.skillCd[id] = def.cd;
  p.state = "skill";
  p.atk = null;
  p.dashT = 0;
  p.parryT = 0;
  p.lightBuffer = 0;
  p.heavyQueued = 0;
  p.dashQueued = 0;
  p.parryQueued = 0;
  p.jumpBuffer = 0;
  if (p.chargeT > 0 || audio.chargeNodes) {
    stopCharge(p);
    audio.chargeStop();
  }
  p.chargeT = 0;
  p.chargeLevel = 0;
  p.chargeFullNotified = false;
  p.vx *= 0.15;
  p.vy = 0;
  p.iframes = Math.max(p.iframes, def.iframes);
  p.skill = {
    id,
    def,
    t: 0,
    started: true,
    ghostT: 0,
    blinkFrom: null,
    destX: p.x,
    destY: p.y,
    travelDir: p.facing,
    afterFacing: p.facing,
    blinked: false,
    struck: false,
    released: false,
    wave: 0,
  };

  if (id === 2) prepareShadowSkill(p);
  if (id === 3) prepareSakuraSkill(p);
  if (id === 4) prepareSunderSkill(p);
  if (id === 1) {
    addSkillFx("rune", {
      x: p.x, y: GROUND_Y, radius: 138, life: 0.68, color: def.color, layer: "back", petals: 10,
    });
    addRing(p.x, p.y - 34, def.color, 54, 0.28, 3, false);
    for (let i = 0; i < 13; i++) {
      addParticle({
        kind: "petal", x: p.x + rand(-46, 46), y: p.y - rand(2, 62),
        vx: rand(-90, 90), vy: rand(-140, -20), life: rand(0.4, 0.9), maxLife: 0.9,
        size: rand(2.5, 5), color: chance(0.4) ? "#ffd6d9" : def.color, grav: 120, drag: 0.96,
        rot: rand(0, TAU), vr: rand(-8, 8), back: false,
      });
    }
  }

  addFloater(def.name, p.x, p.y - 104, def.color, 19, {
    vy: -26, life: 0.9, glow: def.color, pop: true,
  });
  audio.skillStart(id);
  return true;
}

function endSkill(p) {
  if (!p || !p.skill) return;
  p.state = "idle";
  p.skill = null;
  p.vy = Math.min(p.vy, 160);
  p.lightWindow = 0.24;
  p.lightNext = 0;
  // Chain a skill pressed during the previous cast (rapid 1-2-3-4 input).
  if (p.skillQueue && p.skillQueue.length) {
    while (p.skillQueue.length) {
      const q = p.skillQueue.shift();
      if (q.ttl > 0 && tryStartSkill(p, q.id)) break;
    }
  }
}

function updatePlayerSkill(p, dt) {
  const s = p.skill;
  if (!s) {
    p.state = "idle";
    return;
  }
  s.t += dt;
  p.vx = damp(p.vx, 0, 18, dt);
  if (s.id !== 2) p.vy = 0;

  if (s.ghostT != null) {
    s.ghostT += dt;
    if (s.ghostT > 0.035) {
      s.ghostT = 0;
      addAfterimage(snapshotPose(computePlayerPose(p)), s.def.color, 0.2);
    }
  }

  switch (s.id) {
    case 1: updateMoonSkill(p, s, dt); break;
    case 2: updateShadowSkill(p, s, dt); break;
    case 3: updateSakuraSkill(p, s, dt); break;
    case 4: updateSunderSkill(p, s, dt); break;
  }

  if (p.skill === s && s.t >= s.def.duration) endSkill(p);
}

/* ---------------- shared skill helpers ---------------- */
function skillHitRadius(p, radius, opts) {
  const cx = p.x;
  const cy = p.y - 38;
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    const dx = e.x - cx;
    const dy = e.y - 34 * e.scale - cy;
    if (Math.hypot(dx, dy * 0.82) > radius + 18 * e.scale) continue;
    applySkillHit(e, p, opts);
    count++;
  }
  return count;
}

function skillHitForward(p, maxDist, opts) {
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    const rel = (e.x - p.x) * p.facing;
    if (rel < -55 || rel > maxDist) continue;
    applySkillHit(e, p, opts);
    count++;
  }
  return count;
}

function skillHitAll(p, opts) {
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    applySkillHit(e, p, opts);
    count++;
  }
  return count;
}

function applySkillHit(e, p, opts) {
  const contact = {
    x: e.x + rand(-8, 8),
    y: e.y - 36 * e.scale + rand(-10, 10),
  };
  const bias = opts.bias || { arm: 1, leg: 1, head: 1 };
  let part = null;
  if (!opts.aoeParts) {
    part = chooseNearestPartId(e, contact, bias);
  }
  const hit = {
    dmg: opts.dmg,
    limb: opts.limb,
    poise: opts.poise != null ? opts.poise : 40,
    kb: opts.kb != null ? opts.kb : 100,
    launch: opts.launch || 0,
    hitstop: opts.hitstop != null ? opts.hitstop : 0.03,
    shake: opts.shake != null ? opts.shake : 1.5,
    heavy: !!opts.heavy,
    aoeParts: !!opts.aoeParts,
    bias,
    reach: opts.reach || opts.radius || 150,
    sourceX: p.x,
  };
  damageEnemyFromPlayer(e, hit, contact, p, part);

  // skill-coloured slash stamp and petals
  const color = opts.color || "#fff1d8";
  addSlash(
    e.x + rand(-14, 14), e.y - 40 * e.scale + rand(-12, 12),
    opts.slashR || 48, rand(-1.7, -0.5), rand(0.55, 1.5),
    color, 0.16, opts.slashW || 12, sgn(e.x - p.x) || p.facing, 0.62
  );
  if (opts.petals !== false) {
    petalBurst(e.x, e.y - 38 * e.scale, opts.big ? 10 : 4, opts.petalColor || color);
  }
  if (opts.big) {
    addRing(e.x, e.y - 38 * e.scale, color, 46, 0.24, 2.5, false);
    emberBurst(e.x, e.y - 34 * e.scale, 7, color, 0.8, false);
  }
}

/* ---------------- skill 1: 月轮斩 ---------------- */
function updateMoonSkill(p, s, dt) {
  const t = s.t;
  const color = s.def.color;
  if (t >= 0.075 && !s.w1) {
    s.w1 = true;
    skillHitRadius(p, 186, {
      dmg: 13, limb: 15, poise: 20, kb: 130, launch: 40,
      hitstop: 0.03, shake: 1.6, color, slashR: 45, slashW: 12,
      bias: { arm: 0.9, leg: 1.05, head: 1.05 },
    });
    moonWheelVisual(p, color, 0);
    audio.swing(false);
  }
  if (t >= 0.205 && !s.w2) {
    s.w2 = true;
    skillHitRadius(p, 192, {
      dmg: 14, limb: 16, poise: 22, kb: 150, launch: 80,
      hitstop: 0.032, shake: 1.8, color, slashR: 50, slashW: 12,
      bias: { arm: 0.9, leg: 1.0, head: 1.05 },
    });
    moonWheelVisual(p, color, 1.1);
    audio.swing(false);
  }
  if (t >= 0.335 && !s.w3) {
    s.w3 = true;
    skillHitRadius(p, 198, {
      dmg: 15, limb: 18, poise: 26, kb: 170, launch: 130,
      hitstop: 0.035, shake: 2.0, color, slashR: 56, slashW: 14,
      bias: { arm: 1.0, leg: 1.0, head: 1.0 },
    });
    moonWheelVisual(p, color, 2.3);
    audio.swing(false);
  }
  if (t >= 0.46 && !s.final) {
    s.final = true;
    const hits = skillHitRadius(p, 214, {
      dmg: 22, limb: 28, poise: 48, kb: 260, launch: 330,
      hitstop: 0.065, shake: 3.8, heavy: true, color, slashR: 75, slashW: 22,
      big: true, bias: { arm: 1.05, leg: 0.95, head: 0.95 },
    });
    addSlash(p.x, p.y - 40, 102, 0, TAU, color, 0.22, 18, 1, 0.72);
    addRing(p.x, p.y - 38, color, 68, 0.3, 4, false);
    addShockwave(p.x, GROUND_Y, color, 190, 0.45, 5);
    dustBurst(p.x, GROUND_Y, 12, p.facing, 1.2);
    addShake(3.6);
    if (hits > 0) {
      screenFlash(0.025);
      setSlowmo(0.12, 0.45);
    }
  }
}

function moonWheelVisual(p, color, phase) {
  for (let k = 0; k < 4; k++) {
    const a = phase + (k * TAU) / 4 + game.time * 2.2;
    addSlash(p.x, p.y - 40, 66 + (k % 2) * 12, a, a + 1.15, color, 0.18, 15, 1, 0.7);
  }
  addRing(p.x, p.y - 38, color, 58, 0.18, 2, false);
  petalBurst(p.x, p.y - 40, 4, color);
}

/* ---------------- skill 2: 影渡 ---------------- */
function prepareShadowSkill(p) {
  let target = null;
  let best = 565;
  for (const e of game.enemies) {
    if (!e.alive || e.spawnT > 0) continue;
    const d = Math.abs(e.x - p.x);
    if (d < best && d > 8) {
      best = d;
      target = e;
    }
  }
  const s = p.skill;
  s.blinkFrom = { x: p.x, y: p.y };
  if (target) {
    s.travelDir = sgn(target.x - p.x) || p.facing;
    s.destX = clamp(target.x + s.travelDir * 46, 54, WORLD_W - 54);
    s.destY = clamp(target.y, -80, GROUND_Y);
    s.afterFacing = -s.travelDir || -p.facing;
    s.targetId = target.id;
    p.facing = s.travelDir;
  } else {
    s.travelDir = moveDir() || p.facing;
    s.destX = clamp(p.x + s.travelDir * 300, 54, WORLD_W - 54);
    s.destY = p.y;
    s.afterFacing = s.travelDir;
    p.facing = s.travelDir;
  }
  addSkillFx("rift", { x: p.x, y: p.y - 42, height: 92, life: 0.32, color: s.def.color, layer: "front", seed: rand(0, 10) });
  smokeBurst(p.x, p.y - 32, 5, "#17101e", 0.9);
  emberBurst(p.x, p.y - 34, 9, s.def.color, 0.8, false);
}

function updateShadowSkill(p, s, dt) {
  const t = s.t;
  if (!s.blinked && t >= 0.13) {
    s.blinked = true;
    const from = s.blinkFrom;
    const basePose = snapshotPose(computePlayerPose(p));
    for (let i = 1; i <= 4; i++) {
      const q = i / 5;
      const g = { ...basePose, x: lerp(from.x, s.destX, q), y: lerp(from.y, s.destY, q) };
      addAfterimage(g, s.def.color, 0.3);
    }
    p.x = s.destX;
    p.y = s.destY;
    p.facing = s.afterFacing;
    p.vx = 0;
    p.vy = 0;
    addSkillFx("rift", { x: from.x, y: from.y - 42, height: 105, life: 0.3, color: s.def.color, layer: "front", seed: rand(0, 10) });
    addSkillFx("rift", { x: p.x, y: p.y - 42, height: 120, life: 0.36, color: s.def.color, layer: "front", seed: rand(0, 10) });
    addSkillFx("streak", {
      x1: from.x, y1: from.y - 38, x2: p.x, y2: p.y - 38,
      life: 0.3, color: s.def.color, layer: "back",
    });
    addRing(p.x, p.y - 38, s.def.color, 46, 0.26, 3, false);
    smokeBurst(p.x, p.y - 28, 5, "#17101e", 0.9);
    addShake(2.4);
    audio.blinkStep();
  }
  if (!s.struck && t >= 0.25) {
    s.struck = true;
    const hits = skillHitRadius(p, 158, {
      dmg: 58, limb: 72, poise: 140, kb: 300, launch: 260,
      hitstop: 0.13, shake: 6.2, heavy: true, color: s.def.color,
      slashR: 96, slashW: 30, big: true,
      bias: { arm: 0.9, leg: 0.9, head: 0.55 },
    });
    // cross cut
    addSlash(p.x, p.y - 40, 88, -1.55, 1.55, "#fff4ec", 0.22, 12, 1, 0.7);
    addSlash(p.x, p.y - 40, 82, 0.05, -3.05, s.def.color, 0.24, 24, 1, 0.62);
    addRing(p.x, p.y - 38, s.def.color, 64, 0.26, 3.5, false);
    addShockwave(p.x, GROUND_Y, s.def.color, 130, 0.4, 4);
    addShake(4);
    if (hits > 0) {
      screenFlash(0.045);
      setSlowmo(0.2, 0.34);
    }
    audio.swordRift();
  }
  if (t >= 0.6) {
    // nothing extra; end handled by caller
  }
}

/* ---------------- skill 3: 千樱葬 ---------------- */
function prepareSakuraSkill(p) {
  const s = p.skill;
  s.wave = 0;
  p.skillCd[3] = s.def.cd;
  addSkillFx("runecircle", {
    x: p.x, y: p.y - 2, radius: 248, life: 1.55, color: s.def.color, layer: "back", petals: 18,
  });
  addSkillFx("petalDomain", {
    x: p.x, y: p.y - 34, radius: 230, life: 1.55, color: s.def.color, layer: "front",
  });
  addRing(p.x, p.y - 30, s.def.color, 82, 0.45, 4, false);
  petalBurst(p.x, p.y - 38, 16, s.def.color);
  audio.sakuraBloom();
}

function sakuraWave(p, final) {
  const color = p.skill.def.color;
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    applySkillHit(e, p, {
      dmg: final ? 24 : 11,
      limb: final ? 34 : 13,
      poise: final ? 52 : 16,
      kb: final ? 190 : 30,
      launch: final ? 320 : 70,
      hitstop: final ? 0.05 : 0.02,
      shake: final ? 3.2 : 0.8,
      heavy: final,
      color,
      slashR: final ? 68 : 30,
      slashW: final ? 18 : 8,
      big: final,
      aoeParts: final,
      petals: true,
      petalColor: "#ffb7ce",
      bias: { arm: 1, leg: 1, head: 1 },
    });
    count++;
    addParticle({
      kind: "petal", x: e.x + rand(-20, 20), y: e.y - rand(20, 70),
      vx: rand(-110, 110), vy: rand(-170, -30), life: rand(0.5, 1.1), maxLife: 1.1,
      size: rand(3, 6), color: chance(0.5) ? "#fff0f2" : color,
      grav: 80, drag: 0.96, rot: rand(0, TAU), vr: rand(-9, 9),
    });
  }
  if (final) {
    addShockwave(p.x, GROUND_Y, color, 340, 0.6, 6);
    addRing(p.x, p.y - 36, color, 120, 0.5, 4, false);
    screenFlash(0.03);
    addShake(3.2);
    audio.sakuraFinal();
  } else {
    addRing(p.x, p.y - 34, color, 66 + count * 6, 0.2, 2, false);
    audio.sakuraTick();
  }
  return count;
}

function updateSakuraSkill(p, s, dt) {
  const t = s.t;
  const waves = [0.26, 0.5, 0.74, 0.98];
  if (s.wave < waves.length && t >= waves[s.wave]) {
    sakuraWave(p, false);
    s.wave++;
  }
  if (!s.final && t >= 1.22) {
    s.final = true;
    sakuraWave(p, true);
    addSkillFx("petalBurst", { x: p.x, y: p.y - 36, radius: 320, life: 0.55, color: s.def.color, layer: "front" });
  }
}

/* ---------------- skill 4: 断界 ---------------- */
function prepareSunderSkill(p) {
  const s = p.skill;
  s.travelDir = moveDir() || p.facing;
  p.facing = s.travelDir;
  addSkillFx("rune", {
    x: p.x, y: GROUND_Y, radius: 160, life: 0.86, color: s.def.color, layer: "back", petals: 8,
  });
  addRing(p.x, p.y - 36, s.def.color, 62, 0.4, 3, false);
  audio.sunderCharge();
  audio.chargeStart();
}

function updateSunderSkill(p, s, dt) {
  const t = s.t;
  if (!s.released && t < 0.36) {
    // converging sparks around the blade
    if (chance(dt * 36)) {
      const a = rand(0, TAU);
      addParticle({
        kind: "spark",
        x: p.x + Math.cos(a) * rand(45, 90), y: p.y - 34 + Math.sin(a) * rand(30, 70),
        vx: -Math.cos(a) * rand(120, 260), vy: -Math.sin(a) * rand(90, 200),
        life: rand(0.15, 0.35), maxLife: 0.35, size: rand(0.8, 2),
        color: s.def.color, grav: 0, drag: 0.9, additive: true,
      });
    }
  }
  if (!s.released && t >= 0.36) {
    s.released = true;
    audio.chargeStop();
    audio.sunderRelease();
    p.facing = s.travelDir;
    addSkillFx("beam", {
      x: p.x + p.facing * 28, y: p.y - 40, dir: p.facing,
      length: 1280, height: 66, life: 0.55, color: s.def.color, layer: "front",
    });
    addSkillFx("sunderFlash", { x: p.x + p.facing * 420, y: p.y - 40, length: 900, life: 0.38, color: "#fff4dd", layer: "front" });
    const hits = skillHitForward(p, 1250, {
      dmg: 78, limb: 96, poise: 260, kb: 440, launch: 380,
      hitstop: 0.16, shake: 9.0, heavy: true, aoeParts: true,
      color: s.def.color, slashR: 100, slashW: 34, big: true,
      bias: { arm: 1, leg: 1, head: 1 },
    });
    for (const e of game.enemies) {
      if (e.alive && Math.abs(e.x - p.x) < 1250) {
        addSkillFx("rift", { x: e.x, y: e.y - 44, height: 150, life: 0.4, color: s.def.color, layer: "front", seed: rand(0, 10) });
      }
    }
    addShockwave(p.x, GROUND_Y, s.def.color, 260, 0.55, 6);
    for (let i = 1; i <= 5; i++) {
      const dx = p.x + p.facing * i * 150;
      addDecal(clamp(dx, 30, WORLD_W - 30), GROUND_Y, "crack", 1, 1.0 + i * 0.08, "#221311", 8);
    }
    dustBurst(p.x + p.facing * 90, GROUND_Y, 18, p.facing, 1.4);
    addShake(7.5);
    screenFlash(0.065);
    if (hits > 0) setSlowmo(0.24, 0.32);
  }
}

/* ---------------- skill poses ---------------- */
function skillPoseSpec(p) {
  const s = p.skill;
  if (!s) return SKILL_NEUTRAL;
  const t = s.t;
  const id = s.id;

  if (id === 1) {
    const wind = {
      handR: { x: -8, y: -23 }, handL: { x: -5, y: -27 }, angle: -2.6,
      lean: -0.14, crouch: 9, hipShift: -5,
      footL: { x: -17, y: 0 }, footR: { x: 16, y: 0 }, headTilt: -0.05, twoHand: false,
    };
    const strike = {
      handR: { x: 24, y: -31 }, handL: { x: 5, y: -28 }, angle: 0.28,
      lean: 0.24, crouch: 6, hipShift: 8,
      footL: { x: -20, y: 0 }, footR: { x: 19, y: 0 }, headTilt: 0.05, twoHand: false,
    };
    const recover = {
      handR: { x: 14, y: -25 }, handL: { x: 0, y: -23 }, angle: 1.05,
      lean: 0.08, crouch: 3, hipShift: 2,
      footL: { x: -14, y: 0 }, footR: { x: 14, y: 0 }, headTilt: 0.02, twoHand: false,
    };
    if (t < 0.09) return blendPoseSpec(SKILL_NEUTRAL, wind, easeOutCubic(t / 0.09));
    if (t < 0.18) return blendPoseSpec(wind, strike, easeOutQuint((t - 0.09) / 0.09));
    return blendPoseSpec(strike, recover, easeInOutCubic(clamp((t - 0.18) / 0.4, 0, 1)));
  }

  if (id === 2) {
    const wind = {
      handR: { x: -3, y: -31 }, handL: { x: -9, y: -23 }, angle: -2.35,
      lean: -0.06, crouch: 8, hipShift: -4,
      footL: { x: -16, y: 0 }, footR: { x: 15, y: 0 }, headTilt: -0.03, twoHand: false,
    };
    const strike = {
      handR: { x: 25, y: -30 }, handL: { x: 10, y: -27 }, angle: 0.06,
      lean: 0.58, crouch: 7, hipShift: 18,
      footL: { x: -24, y: 0 }, footR: { x: 22, y: 0 }, headTilt: 0.09, twoHand: false,
    };
    const recover = {
      handR: { x: 18, y: -26 }, handL: { x: 4, y: -23 }, angle: 0.8,
      lean: 0.2, crouch: 3, hipShift: 5,
      footL: { x: -16, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.02, twoHand: false,
    };
    if (t < 0.12) return blendPoseSpec(SKILL_NEUTRAL, wind, easeOutCubic(t / 0.12));
    if (t < 0.27) return blendPoseSpec(wind, strike, easeOutQuint((t - 0.12) / 0.15));
    return blendPoseSpec(strike, recover, easeInOutCubic(clamp((t - 0.27) / 0.32, 0, 1)));
  }

  if (id === 3) {
    const pulse = Math.sin(t * 9) * 0.6;
    const channel = {
      handR: { x: 14, y: -18 }, handL: { x: 1, y: -39 + pulse }, angle: 1.52,
      lean: 0.06, crouch: 10 + pulse * 0.5, hipShift: 2,
      footL: { x: -15, y: 0 }, footR: { x: 14, y: 0 }, headTilt: -0.02, twoHand: false,
    };
    const start = blendPoseSpec(SKILL_NEUTRAL, channel, easeOutCubic(clamp(t / 0.2, 0, 1)));
    if (t > 1.26) {
      const end = {
        handR: { x: 18, y: -22 }, handL: { x: 5, y: -34 }, angle: 1.08,
        lean: 0.1, crouch: 6, hipShift: 4,
        footL: { x: -15, y: 0 }, footR: { x: 15, y: 0 }, headTilt: 0.03, twoHand: false,
      };
      return blendPoseSpec(start, end, easeInOutCubic(clamp((t - 1.26) / 0.28, 0, 1)));
    }
    return start;
  }

  const charge = {
    handR: { x: -10, y: -22 }, handL: { x: -5, y: -24 }, angle: -2.8,
    lean: -0.15, crouch: 13, hipShift: -6,
    footL: { x: -18, y: 0 }, footR: { x: 16, y: 0 }, headTilt: -0.06, twoHand: true,
  };
  const strike = {
    handR: { x: 26, y: -27 }, handL: { x: 16, y: -28 }, angle: 0.85,
    lean: 0.46, crouch: 8, hipShift: 16,
    footL: { x: -22, y: 0 }, footR: { x: 21, y: 0 }, headTilt: 0.12, twoHand: true,
  };
  const recover = {
    handR: { x: 18, y: -23 }, handL: { x: 8, y: -25 }, angle: 1.12,
    lean: 0.12, crouch: 4, hipShift: 4,
    footL: { x: -16, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.03, twoHand: true,
  };
  if (t < 0.1) return blendPoseSpec(SKILL_NEUTRAL, charge, easeOutCubic(t / 0.1));
  if (t < 0.36) return charge;
  if (t < 0.46) return blendPoseSpec(charge, strike, easeOutQuint((t - 0.36) / 0.1));
  return blendPoseSpec(strike, recover, easeInOutCubic(clamp((t - 0.46) / 0.36, 0, 1)));
}

function skillSpinValue(p) {
  if (!p.skill || p.skill.id !== 1) return 0;
  return TAU * easeInOutCubic(clamp(p.skill.t / 0.5, 0, 1));
}

/* ---------------- skill auras / effects ---------------- */
function drawSkillAura(p) {
  if (!p.skill) return;
  const s = p.skill;
  const color = s.def.color;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (s.id === 1) {
    const t = game.time;
    for (let k = 0; k < 3; k++) {
      const a0 = t * 4 + (k * TAU) / 3;
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 38, 54 + k * 17, a0, a0 + 1.5);
      ctx.stroke();
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 38, 54 + k * 17, a0, a0 + 1.5);
      ctx.stroke();
    }
  } else if (s.id === 3) {
    glowCircle(ctx, p.x, p.y - 36, 40 + Math.sin(game.time * 5) * 5, color, 0.13);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 32 + Math.sin(game.time * 3) * 4, 0, TAU);
    ctx.stroke();
  } else if (s.id === 4) {
    const t = clamp(s.t / 0.36, 0, 1);
    glowCircle(ctx, p.x, p.y - 38, 30 + t * 30, color, 0.12 + t * 0.16);
    ctx.globalAlpha = 0.4 + t * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 36, 42 + t * 14, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

function addSkillFx(kind, opts) {
  const fx = {
    kind,
    x: opts.x || 0,
    y: opts.y || 0,
    radius: opts.radius || 100,
    length: opts.length || 400,
    height: opts.height || 80,
    life: opts.life || 0.5,
    maxLife: opts.life || 0.5,
    color: opts.color || "#ff6f84",
    layer: opts.layer || "front",
    petals: opts.petals || 0,
    dir: opts.dir || 1,
    x1: opts.x1,
    y1: opts.y1,
    x2: opts.x2,
    y2: opts.y2,
    seed: opts.seed != null ? opts.seed : rand(0, 100),
  };
  game.skillFx.push(fx);
  if (game.skillFx.length > 36) game.skillFx.shift();
}

function updateSkillFx(dt) {
  for (let i = game.skillFx.length - 1; i >= 0; i--) {
    const fx = game.skillFx[i];
    fx.life -= dt;
    if (fx.life <= 0) game.skillFx.splice(i, 1);
  }
}

function drawSkillFx(layer) {
  for (const fx of game.skillFx) {
    if (fx.layer !== layer) continue;
    const t = 1 - fx.life / fx.maxLife;
    const fade = clamp(fx.life / (fx.maxLife * 0.7), 0, 1);
    ctx.save();
    if (fx.kind === "rune" || fx.kind === "runecircle") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 1.4;
      const r = fx.radius * (fx.kind === "rune" ? 0.55 + t * 0.55 : 1);
      const spin = game.time * 0.8 + fx.seed;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.62 + k * 0.18), spin + k * 0.5, spin + k * 0.5 + TAU * 0.72);
        ctx.stroke();
      }
      ctx.globalAlpha = fade * 0.45;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.27, 0, 0, TAU);
      ctx.stroke();
      const petalN = fx.petals || 0;
      for (let k = 0; k < petalN; k++) {
        const a = spin * 1.4 + (k / petalN) * TAU;
        const rr = r * (0.55 + (k % 3) * 0.14);
        ctx.globalAlpha = fade * 0.5;
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr * 0.3, 5, 1.7, a, 0, TAU);
        ctx.fill();
      }
    } else if (fx.kind === "petalDomain") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      const spin = game.time * 0.9 + fx.seed;
      ctx.globalAlpha = fade * 0.55;
      for (let k = 0; k < 22; k++) {
        const a = spin + (k / 22) * TAU + Math.sin(game.time * 1.5 + k) * 0.2;
        const rr = fx.radius * (0.42 + ((k * 37) % 100) / 160);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr * 0.55 - 55);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = chance(0.25) ? "#fff2f4" : fx.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5.5, 2.1, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = fade * 0.22;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, fx.radius * 0.82, fx.radius * 0.42, 0, 0, TAU);
      ctx.stroke();
    } else if (fx.kind === "beam") {
      ctx.translate(fx.x, fx.y);
      ctx.scale(fx.dir, 1);
      ctx.globalCompositeOperation = "lighter";
      const grow = easeOutQuint(clamp(t / 0.32, 0, 1));
      const len = fx.length * grow;
      const h0 = fx.height * (1 - t * 0.3);
      const h1 = h0 * 0.12;
      // tapered wave body
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, rgba(fx.color, 0.78 * fade));
      g.addColorStop(0.28, rgba(fx.color, 0.55 * fade));
      g.addColorStop(0.72, rgba(fx.color, 0.24 * fade));
      g.addColorStop(1, rgba(fx.color, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -h0 / 2);
      ctx.quadraticCurveTo(len * 0.35, -h0 * 0.36, len, -h1 / 2);
      ctx.lineTo(len, h1 / 2);
      ctx.quadraticCurveTo(len * 0.35, h0 * 0.3, 0, h0 / 2);
      ctx.closePath();
      ctx.fill();
      // inner white-hot core
      const core = ctx.createLinearGradient(0, 0, len, 0);
      core.addColorStop(0, `rgba(255,250,236,${0.95 * fade})`);
      core.addColorStop(0.55, `rgba(255,238,210,${0.6 * fade})`);
      core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1.2, h0 * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      // jagged energy edges
      ctx.globalAlpha = fade * 0.34;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 8; k++) {
        const x = (k / 8) * len;
        const hh = h0 * (0.22 - k * 0.02);
        ctx.beginPath();
        ctx.moveTo(x, -hh);
        ctx.lineTo(x + 22, -hh * 0.4);
        ctx.lineTo(x + 6, hh * 0.4);
        ctx.stroke();
      }
    } else if (fx.kind === "sunderFlash") {
      ctx.translate(fx.x, fx.y);
      ctx.scale(fx.dir, 1);
      ctx.globalCompositeOperation = "lighter";
      const grow = easeOutQuint(clamp(t / 0.26, 0, 1));
      const len = fx.length * grow;
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = "rgba(255,250,238,0.9)";
      ctx.lineWidth = 4.5 * (1 - t * 0.5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.35;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 18 * (1 - t * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
    } else if (fx.kind === "rift") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.9;
      const h = fx.height;
      const seed = fx.seed;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      for (let k = 1; k <= 5; k++) {
        ctx.lineTo(Math.sin(seed + k * 2.3 + game.time * 18) * 7, -h / 2 + (h * k) / 5);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,248,238,0.9)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      for (let k = 1; k <= 5; k++) {
        ctx.lineTo(Math.sin(seed + k * 2.3 + game.time * 18) * 4, -h / 2 + (h * k) / 5);
      }
      ctx.stroke();
      ctx.globalAlpha = fade * 0.25;
      glowCircle(ctx, 0, 0, h * 0.45, fx.color, 0.5);
    } else if (fx.kind === "streak") {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.9;
      const x1 = fx.x1;
      const y1 = fx.y1;
      const x2 = fx.x2;
      const y2 = fx.y2;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,240,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (fx.kind === "petalBurst") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      const rr = fx.radius * easeOutCubic(t);
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU + fx.seed;
        ctx.globalAlpha = fade * 0.7;
        ctx.fillStyle = k % 3 === 0 ? "#fff4f6" : fx.color;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 6, 2.2, a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
