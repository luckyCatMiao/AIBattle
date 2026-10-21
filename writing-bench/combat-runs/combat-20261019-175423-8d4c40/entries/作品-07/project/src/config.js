// ============================================================================
// config.js — 全局常量、招式数据、敌人数据（所有数值统一在这里调参）
// 坐标系：x 向右为正；y 向上为负（地面 y=0，头顶为负）。单位 = 逻辑像素。
// ============================================================================

const CFG = {
  // ---- 基础物理 ----
  gravity: 2600,
  groundFriction: 2600,
  airFriction: 260,

  // ---- 玩家移动 ----
  moveSpeed: 380,
  accel: 3400,
  airControl: 0.72,
  jumpSpeed: -880,
  jumpCut: 0.45,          // 提前松开跳跃键时削减上升速度的比例
  coyoteTime: 0.09,
  jumpBufferTime: 0.12,

  playerW: 34,
  playerH: 96,
  playerMaxHp: 100,

  // ---- 冲刺 / 闪避 ----
  dashSpeed: 820,
  dashTime: 0.15,
  dashCooldown: 0.30,
  dashIframes: 0.20,
  dashCancelWindow: 0.999, // 招式全程允许冲刺取消

  // ---- 受伤 ----
  hurtInvuln: 0.9,
  hurtKnockback: 320,
  hurtHitstop: 0.055,

  // ---- 世界 ----
  spawnMargin: 60,        // 敌人在屏幕外多远处生成
  maxEnemies: 4,
  spawnInterval: 1.0,
  comboWindow: 1.5,

  // ---- 摄像机 ----
  camLookahead: 0.12,
  camLerp: 6.0,
  camMaxLead: 140,
};

// ----------------------------------------------------------------------------
// 玩家招式表。时间单位秒。hb 为攻击判定盒（cx: 相对玩家中心前伸，cy: 相对玩家中心
// 上抬，w/h 尺寸）。chainFrom 表示从该时刻起允许接下一段轻斩。
// ----------------------------------------------------------------------------
const ATTACKS = {
  l1: {
    label: '一斩', windup: 0.055, active: 0.09, recovery: 0.13,
    damage: 13, knockback: 150, launch: 0, breakMul: 0.55,
    hitstop: 0.045, shake: 3, zoom: 0.004, move: 95, chainFrom: 0.135,
    hb: { cx: 42, cy: 6, w: 78, h: 82 },
  },
  l2: {
    label: '二斩', windup: 0.055, active: 0.09, recovery: 0.14,
    damage: 14, knockback: 200, launch: 0, breakMul: 0.6,
    hitstop: 0.05, shake: 3.5, zoom: 0.005, move: 85, chainFrom: 0.15,
    hb: { cx: 46, cy: 6, w: 84, h: 86 },
  },
  l3: {
    label: '终斩', windup: 0.09, active: 0.10, recovery: 0.24,
    damage: 24, knockback: 470, launch: 0, breakMul: 1.5,
    hitstop: 0.085, shake: 6, zoom: 0.014, move: 135, chainFrom: 999,
    hb: { cx: 54, cy: 8, w: 98, h: 92 },
  },
  heavy: {
    label: '重斩', windup: 0.16, active: 0.09, recovery: 0.26,
    damage: 34, knockback: 540, launch: 0, breakMul: 2.2,
    hitstop: 0.09, shake: 8, zoom: 0.022, move: 45, chainFrom: 999,
    hb: { cx: 60, cy: 10, w: 116, h: 100 },
  },
  heavyFull: {
    label: '满蓄重斩', windup: 0.05, active: 0.12, recovery: 0.34,
    damage: 58, knockback: 780, launch: 0, breakMul: 3.6,
    hitstop: 0.12, shake: 12, zoom: 0.032, move: 35, chainFrom: 999,
    hb: { cx: 70, cy: 12, w: 152, h: 108 },
  },
  launcher: {
    label: '挑空斩', windup: 0.07, active: 0.10, recovery: 0.22,
    damage: 17, knockback: 90, launch: -860, breakMul: 1.2,
    hitstop: 0.06, shake: 5, zoom: 0.01, move: 65, chainFrom: 999,
    hb: { cx: 20, cy: 30, w: 62, h: 104 },
  },
  air1: {
    label: '空斩一', windup: 0.05, active: 0.09, recovery: 0.12,
    damage: 14, knockback: 210, launch: -130, breakMul: 0.7,
    hitstop: 0.05, shake: 3, zoom: 0.004, move: 65, chainFrom: 0.13,
    hb: { cx: 40, cy: 4, w: 78, h: 72 },
  },
  air2: {
    label: '空斩二', windup: 0.05, active: 0.09, recovery: 0.16,
    damage: 18, knockback: 300, launch: -240, breakMul: 1.0,
    hitstop: 0.06, shake: 4, zoom: 0.006, move: 75, chainFrom: 999,
    hb: { cx: 46, cy: 4, w: 86, h: 78 },
  },
  // 空中 K 坠斩：命中地面时的冲击（见 Player/Game 逻辑）
  dive: {
    label: '坠斩', damage: 40, knockback: 220, launch: -540,
    breakMul: 2.8, hitstop: 0.10, shake: 11, zoom: 0.03, radius: 100,
  },
};

// ----------------------------------------------------------------------------
// 敌人类型。肢体（limbs）是独立可破坏的部件。
// kind: head / arm / leg / cannon；side 仅用于手臂/腿的左右。
// 不同肢体损坏会影响行为（断攻击臂→无法出招；断腿→减速；断头→眩晕）。
// ----------------------------------------------------------------------------
const ENEMY_TYPES = {
  blade: {
    name: '剑傀儡',
    w: 44, h: 92,
    bodyHp: 100,
    speed: 150,
    touchDamage: 10,
    attackRange: 86,
    windup: 0.48,
    active: 0.16,
    recovery: 0.62,
    attackDamage: 16,
    attackKnockback: 380,
    attackRangePx: 92,     // 出招判定范围
    attackHb: { cx: 40, cy: 0, w: 96, h: 78 },
    limbs: {
      head:  { hp: 26, kind: 'head' },
      armL:  { hp: 30, kind: 'arm', side: -1 },
      armR:  { hp: 48, kind: 'arm', side: 1, weapon: 'blade' },
      legL:  { hp: 30, kind: 'leg', side: -1 },
      legR:  { hp: 30, kind: 'leg', side: 1 },
    },
  },
  cannon: {
    name: '炮傀儡',
    w: 46, h: 88,
    bodyHp: 90,
    speed: 120,
    touchDamage: 9,
    fireMin: 210,
    fireMax: 520,
    windup: 0.66,
    active: 0.10,
    recovery: 0.72,
    attackDamage: 15,
    projectileSpeed: 420,
    limbs: {
      head:  { hp: 22, kind: 'head' },
      armL:  { hp: 26, kind: 'arm', side: -1 },
      cannon: { hp: 42, kind: 'cannon', side: 1 },
      legL:  { hp: 28, kind: 'leg', side: -1 },
      legR:  { hp: 28, kind: 'leg', side: 1 },
    },
  },
};

// ----------------------------------------------------------------------------
// 主动技能表（新增 4 个可独立触发的技能，各自独立按键 + 冷却）
// type: dashSlash 一闪 / clone 分身 / lightning 落雷 / nova 时滞冲击波
// ----------------------------------------------------------------------------
const SKILLS = [
  {
    key: 'KeyU', id: 'iai', name: '一闪·居合', desc: '疾冲贯穿，斩断沿途之敌',
    type: 'dashSlash', cooldown: 4.5, windup: 0.16, total: 0.36, move: 1900,
    damage: 46, knockback: 470, launch: -150, breakMul: 3.0,
    hitstop: 0.10, shake: 11, zoom: 0.03, range: 380,
  },
  {
    key: 'KeyO', id: 'clones', name: '影舞·分身斩', desc: '召唤三道残影向前绞杀',
    type: 'clone', cooldown: 5.5, windup: 0.18, total: 0.34,
    damage: 20, knockback: 250, launch: -130, breakMul: 1.3,
    hitstop: 0.045, shake: 4, zoom: 0.012, clones: 3,
  },
  {
    key: 'KeyP', id: 'lightning', name: '雷葬·天罚', desc: '召雷轰击至多三名敌人',
    type: 'lightning', cooldown: 7.0, windup: 0.22, total: 0.42,
    damage: 38, knockback: 230, launch: -650, breakMul: 3.2,
    hitstop: 0.09, shake: 13, zoom: 0.028, strikes: 3, radius: 640,
  },
  {
    key: 'KeyQ', id: 'nova', name: '残响·时滞', desc: '冲击波击退并迟滞周围敌人',
    type: 'nova', cooldown: 8.0, windup: 0.14, total: 0.30,
    damage: 24, knockback: 560, launch: -220, breakMul: 1.2,
    hitstop: 0.08, shake: 9, zoom: 0.022, radius: 300, slow: 3.2,
  },
];

// ----------------------------------------------------------------------------
// 调色板
// ----------------------------------------------------------------------------
const COLORS = {
  bgTop: '#0b0f1e',
  bgMid: '#111a33',
  bgBot: '#1a1730',
  moon: '#e8ecff',
  mountainFar: '#141a30',
  mountainNear: '#1d2440',
  ground: '#262038',
  groundTop: '#3a3356',
  groundEdge: '#6a5bd8',

  playerBody: '#0e1424',
  playerBodyLit: '#26344f',
  playerScarf: '#ff4d6d',
  playerScarf2: '#ff8f5e',
  blade: '#eaf6ff',
  bladeGlow: '#6ad8ff',
  bladeEdge: '#c9f2ff',

  enemySteel: '#3a4156',
  enemySteelDark: '#232838',
  enemySteelLit: '#59627c',
  enemyJoint: '#161b28',
  enemyEye: '#ff3b3b',
  enemyCore: '#ffb347',
  cannonGlow: '#ff8a3d',

  spark: '#ffe08a',
  sparkHot: '#ffb347',
  slash: '#bfeaff',
  slashHot: '#ffffff',
  blood: '#ff5a5a',
  dust: '#8a86a8',
};
