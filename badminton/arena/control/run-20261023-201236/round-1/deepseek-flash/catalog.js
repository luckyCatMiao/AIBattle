'use strict';
/* 横版羽毛球 · 规则与场地。
 * 侧视 2D：球场 13.4 格长、中间一张 1.55 格高的网；两名火柴人隔网对打。
 * 可以左右跑、起跳；挥拍分两种：上手（从上往下）和下手（从下往上）。
 * 物理 20 Hz，每个物理帧内对球做 4 次子步，避免高速球穿过球拍。 */

const rules = {
  hz: 20,
  substeps: 4,
  decisionFrames: 10,

  courtLength: 13.4,
  netX: 6.7,
  netHeight: 1.55,
  netThickness: 0.09,
  ceiling: 11.0,

  gravity: 9.8,
  shuttleDrag: 0.025,       // 二次阻力系数：a = -k·|v|·v（越小球越快）
  shuttleRadius: 0.07,

  matchPoints: 11,
  maxPoints: 15,
  winBy: 2,
  matchSeconds: 240,
  serveFreeze: 0.8,
  pointFreeze: 0.7,
  serve: { vx: 7.0, vy: 6.2, height: 1.35, offset: 0.45, targetFromNet: 3.2 },

  playerSpeed: 3.7,
  playerAccel: 26.0,
  playerFriction: 12.0,
  playerHeight: 1.8,
  shoulderHeight: 1.45,
  jumpSpeed: 5.3,
  playerGravity: 22.0,
  playerRadius: 0.22,
  staminaRunDrain: 9.0,    // 每秒（跑动时）
  staminaRegen: 6.0,       // 每秒（站定时）
  staminaSwingCost: 7.0,   // 每次挥拍
  staminaChargeDrain: 12.0,// 每秒（蓄力时）
  staminaSprintDrain: 26.0,// 每秒（冲刺时）
  sprintMultiplier: 1.45,  // 冲刺速度倍率
  sprintMinStamina: 5.0,   // 低于这个体力无法冲刺
  chargeRate: 1.3,         // 蓄力速度（约 0.77 秒蓄满）
  chargeDecay: 6.0,        // 松开后每秒衰减
  chargeMoveFactor: 0.45,  // 蓄力时的移动速度倍率
  chargeBoost: 0.55,       // 满蓄力时出球速度 +55%

  swingFrames: 9,           // 挥拍总帧数（0.45 秒）
  swingWindup: 2,           // 前 2 帧蓄力
  swingActive: 5,           // 第 2–6 帧是击球窗口
  swingCooldown: 0.40,      // 秒
  hitLock: 0.30,            // 自己击球后多久不能再碰球
  reachRadius: 0.38,       // 只有球拍面真正碰到球才算击中（拍面 0.19 + 球 0.07 + 少量容差）

  // 两种挥拍的球拍扫掠弧线（相对脚下、相对朝向）
  overhead: { fromUp: 2.10, fromFwd: 0.05, toUp: 1.25, toFwd: 0.80 },
  underarm: { fromUp: 0.28, fromFwd: 0.50, toUp: 1.22, toFwd: 0.68 },

  // 出球速度（格/秒）与角度（弧度，正值向上）
  shot: {
    overheadSpeed: 9.0, overheadBoost: 3.0, overheadSmashBonus: 7.5,
    overheadAngleLow: 0.60,   // 后场：高远球
    overheadAngleHigh: -0.42, // 高点 + 靠网：下压杀球
    clearHeight: 1.80,
    smashHeight: 2.35,
    liftSpeed: 9.0, liftBoost: 2.0, liftAngle: 1.05,
  },
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeRng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

module.exports = { rules, TAU, clamp, makeRng };
