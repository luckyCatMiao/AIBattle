'use strict';
/* ============================================================
   Player attack definitions & runtime
   ============================================================ */
const F = 1 / 60;

function poseLight1(w, r) {
  const wind = clonePose(POSE.idle);
  wind.sword = -1.35; wind.chestTwist = -0.5; wind.lean = -0.08; wind.fh = [8, -70]; wind.bh = [-10, -52];
  const strike = clonePose(wind);
  strike.sword = 0.55; strike.chestTwist = 0.6; strike.lean = 0.3; strike.fh = [30, -60]; strike.hipY = -48;
  strike.ff = [30, -2]; strike.bf = [-24, -2];
  return [{ t: 0, p: wind }, { t: 0.055, p: strike, ease: easeOutCubic }, { t: 0.16, p: strike }, { t: w, p: POSE.idle, ease: easeOutQuad }];
}
function poseLight2(w) {
  const wind = clonePose(POSE.idle);
  wind.sword = 0.2; wind.chestTwist = 0.7; wind.fh = [26, -64]; wind.bh = [4, -50];
  const strike = clonePose(wind);
  strike.sword = -2.3; strike.chestTwist = -0.7; strike.lean = 0.24; strike.fh = [-16, -64]; strike.bh = [16, -54];
  strike.ff = [28, -2]; strike.bf = [-26, -4]; strike.hipY = -50;
  return [{ t: 0, p: wind }, { t: 0.06, p: strike, ease: easeOutCubic }, { t: 0.17, p: strike }, { t: w, p: POSE.idle, ease: easeOutQuad }];
}
function poseLight3(w) {
  const wind = clonePose(POSE.idle);
  wind.hipY = -46; wind.lean = -0.2; wind.sword = 2.9; wind.chestTwist = -0.9; wind.fh = [-4, -72];
  const mid = clonePose(wind);
  mid.sword = 0.0; mid.chestTwist = 0.4; mid.lean = 0.35; mid.fh = [34, -58]; mid.hipY = -52;
  mid.ff = [26, -6]; mid.bf = [-30, -10];
  const spin = clonePose(wind);
  spin.sword = -2.6; spin.chestTwist = -0.1; spin.lean = -0.05; spin.fh = [-2, -70]; spin.hipY = -54;
  return [
    { t: 0, p: wind }, { t: 0.1, p: mid, ease: easeOutCubic },
    { t: 0.2, p: spin, ease: easeInOut },
    { t: 0.30, p: spin }, { t: w, p: POSE.idle, ease: easeOutQuad }
  ];
}
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function poseHeavy(w) {
  const wind = clonePose(POSE.idle);
  wind.hipY = -58; wind.lean = -0.30; wind.sword = 3.35; wind.chestTwist = -0.55;
  wind.fh = [-6, -94]; wind.bh = [2, -84];
  const top = clonePose(wind);
  top.sword = -0.15; top.lean = 0.42; top.chestTwist = 0.55; top.hipY = -40;
  top.fh = [34, -58]; top.bh = [20, -50]; top.ff = [30, 0]; top.bf = [-28, 0];
  return [{ t: 0, p: wind }, { t: 0.13, p: top, ease: easeOutCubic }, { t: 0.26, p: top }, { t: w, p: POSE.idle, ease: easeOutQuad }];
}
function poseChargeHold() {
  const p = clonePose(POSE.idle);
  p.hipY = -40; p.lean = -0.24; p.ff = [30, 0]; p.bf = [-30, 0];
  p.sword = 3.3; p.chestTwist = -0.7; p.fh = [-8, -90]; p.bh = [-2, -76]; p.armBack = 1;
  return p;
}
function poseRelease(w) {
  const hold = poseChargeHold();
  const strike = clonePose(hold);
  strike.lean = 0.55; strike.sword = 0.3; strike.chestTwist = 0.8; strike.hipY = -38;
  strike.fh = [40, -52]; strike.bh = [22, -42]; strike.ff = [34, 0]; strike.bf = [-34, 0];
  return [{ t: 0, p: hold }, { t: 0.11, p: strike, ease: easeOutCubic }, { t: 0.26, p: strike }, { t: w, p: POSE.idle, ease: easeOutQuad }];
}
function poseAir1(w) {
  const wind = clonePose(POSE.jumpUp); wind.sword = 0.1; wind.chestTwist = 0.5;
  const strike = clonePose(wind); strike.sword = 2.1; strike.chestTwist = -0.5; strike.lean = 0.2;
  return [{ t: 0, p: wind }, { t: 0.055, p: strike, ease: easeOutCubic }, { t: 0.18, p: strike }, { t: w, p: POSE.fall, ease: easeOutQuad }];
}
function poseDive(w) {
  const wind = clonePose(POSE.fall); wind.sword = 3.4; wind.chestTwist = -0.4; wind.hipY = -60;
  const strike = clonePose(wind); strike.sword = 1.85; strike.lean = 0.5; strike.chestTwist = 0.2;
  strike.ff = [16, -2]; strike.bf = [-12, -6]; strike.hipY = -40;
  return [{ t: 0, p: wind }, { t: 0.08, p: strike, ease: easeOutCubic }, { t: 0.2, p: strike }, { t: w, p: POSE.land, ease: easeOutQuad }];
}
function poseParry() {
  const p = clonePose(POSE.idle);
  p.hipY = -44; p.lean = -0.14; p.ff = [24, 0]; p.bf = [-26, 0];
  p.sword = 1.75; p.chestTwist = 0.35; p.fh = [20, -62]; p.bh = [-8, -58];
  return p;
}
function poseCounter(w) {
  const wind = clonePose(poseParry()); wind.sword = 2.6; wind.chestTwist = -0.5; wind.lean = -0.1;
  const strike = clonePose(wind);
  strike.sword = -0.4; strike.lean = 0.45; strike.chestTwist = 0.7; strike.hipY = -46;
  strike.fh = [36, -58]; strike.bh = [26, -46]; strike.ff = [30, 0]; strike.bf = [-30, 2];
  return [{ t: 0, p: wind }, { t: 0.07, p: strike, ease: easeOutCubic }, { t: 0.24, p: strike }, { t: w, p: POSE.idle, ease: easeOutQuad }];
}

const ATTACKS = {
  light1: {
    dur: 0.26, active: [0.05, 0.13], dmg: 8, limbDmg: 14, hitstop: 0.055, shake: 0.1,
    reach: 76, reachBack: 18, arc: Math.PI * 0.95, kb: 130, kbY: -20, lunge: 190,
    keys: poseLight1, slash: { r: 60, arc: 2.4, ang: 0.35, color: 'rgba(160,230,255,' },
    next: 'light2' , sfx: 'swing',
    hitH: 0.6
  },
  light2: {
    dur: 0.28, active: [0.055, 0.145], dmg: 9, limbDmg: 17, hitstop: 0.06, shake: 0.11,
    reach: 80, reachBack: 22, arc: Math.PI * 1.0, kb: 150, kbY: -30, lunge: 220,
    keys: poseLight2, slash: { r: 64, arc: 2.7, ang: -0.15, color: 'rgba(255,160,180,' },
    next: 'light3' , sfx: 'swing',
    hitH: 0.6
  },
  light3: {
    dur: 0.40, active: [0.1, 0.22], dmg: 16, limbDmg: 43, hitstop: 0.10, shake: 0.22,
    reach: 94, reachBack: 46, arc: Math.PI * 1.6, kb: 330, kbY: -330, lunge: 300,
    keys: poseLight3, slash: { r: 80, arc: 4.4, ang: 0.6, color: 'rgba(255,215,140,' },
    next: null, sfx: 'swing', heavy: true, launch: true,
    hitH: 0.72
  },
  heavy: {
    dur: 0.44, active: [0.14, 0.24], dmg: 22, limbDmg: 66, hitstop: 0.115, shake: 0.28,
    reach: 88, reachBack: 10, arc: Math.PI * 0.7, kb: 300, kbY: -210, lunge: 260,
    keys: poseHeavy, slash: { r: 76, arc: 2.2, ang: 0.95, color: 'rgba(255,180,140,' },
    next: null, sfx: 'heavy', heavy: true, crack: true,
    hitH: 0.45
  },
  charge1: {
    dur: 0.50, active: [0.12, 0.24], dmg: 34, limbDmg: 130, hitstop: 0.16, shake: 0.42,
    reach: 104, reachBack: 30, arc: Math.PI * 1.1, kb: 520, kbY: -260, lunge: 420,
    keys: poseRelease, slash: { r: 96, arc: 3.6, ang: 0.7, color: 'rgba(255,190,120,' },
    next: null, sfx: 'heavy', heavy: true, crack: true, shock: 1,
    hitH: 0.5
  },
  charge2: {
    dur: 0.56, active: [0.12, 0.27], dmg: 52, limbDmg: 217, hitstop: 0.21, shake: 0.62,
    reach: 122, reachBack: 40, arc: Math.PI * 1.3, kb: 720, kbY: -340, lunge: 520,
    keys: poseRelease, slash: { r: 112, arc: 4.4, ang: 0.75, color: 'rgba(255,150,110,' },
    next: null, sfx: 'heavy', heavy: true, crack: true, shock: 2,
    hitH: 0.5
  },
  air1: {
    dur: 0.30, active: [0.05, 0.15], dmg: 10, limbDmg: 20, hitstop: 0.07, shake: 0.1,
    reach: 72, reachBack: 26, arc: Math.PI * 1.1, kb: 180, kbY: -80, lunge: 140,
    keys: poseAir1, slash: { r: 68, arc: 2.8, ang: 0.4, color: 'rgba(160,230,255,' },
    next: 'air2', sfx: 'swing', air: true,
    hitH: 0.7
  },
  air2: {
    dur: 0.36, active: [0.06, 0.17], dmg: 13, limbDmg: 31, hitstop: 0.09, shake: 0.18,
    reach: 78, reachBack: 30, arc: Math.PI * 1.4, kb: 240, kbY: -260, lunge: 180,
    keys: poseLight2, slash: { r: 74, arc: 3.2, ang: -0.4, color: 'rgba(180,255,240,' },
    next: null, sfx: 'swing', air: true,
    hitH: 0.7
  },
  dive: {
    dur: 0.42, active: [0.03, 0.26], dmg: 24, limbDmg: 87, hitstop: 0.14, shake: 0.4,
    reach: 84, reachBack: 34, arc: Math.PI * 1.9, kb: 300, kbY: -120, lunge: 0,
    keys: poseDive, slash: { r: 80, arc: 4.0, ang: 1.3, color: 'rgba(170,220,255,' },
    next: null, sfx: 'heavy', heavy: true, crack: true, dive: true,
    hitH: 0.25
  },
  counter: {
    dur: 0.38, active: [0.05, 0.17], dmg: 42, limbDmg: 290, hitstop: 0.20, shake: 0.5,
    reach: 94, reachBack: 20, arc: Math.PI * 0.9, kb: 420, kbY: -260, lunge: 0,
    keys: poseCounter, slash: { r: 92, arc: 3.4, ang: 0.5, color: 'rgba(180,255,255,' },
    next: null, sfx: 'heavy', heavy: true, crack: true, counter: true,
    hitH: 0.62
  }
};
