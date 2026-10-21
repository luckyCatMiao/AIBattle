/* 铁拳谱 / IRON CODEX — 角色、招式与帧数据目录。
 * 本文件是纯数据：没有规则逻辑，没有内置控制器。裁判读取它，网页展示它，选手可以随意阅读与离线测试。
 *
 * 设计原则（请先读这一段，它决定了这款游戏在比什么）：
 *  1. 六名角色的「身体」完全相同：同样 1000 点生命、同样的行走速度、同样的跳跃弧线、同样的投技范围、
 *     同样的倒地与受身规则。角色的个性全部来自招式帧数据与三个必杀技，而不是体质差异。
 *  2. 克制关系尽量小：没有属性相克、没有体型优势、没有对特定角色的额外伤害。六人的总火力预算接近，
 *     并且都给了一个可以远程骚扰的手段，所以不存在「某角色无解远程压制」这类天生对局。
 *  3. 每个人都有攻有守：rushdown 也有一个高风险的凹招，重装也有远程手段。弱的不是角色，是用角色的人。
 *  4. 因此胜负几乎只取决于「怎么用」：距离、时机、确认、取消、防御、反击、资源管理。
 *     好操作可以让任意一个角色打赢另外五个。
 */

'use strict';

// 模拟频率。一次决策窗口 15 帧 = 0.75 秒。
const rules = {
  hz: 20,                    // 每秒物理帧数
  decisionFrames: 15,        // 每个决策窗口推进的物理帧数
  stage: { width: 1280, ground: 500, wallLeft: 60, wallRight: 1220 },
  health: 1000,
  rounds: 3,                 // 每场对局三局两胜（一局 = 双方当前出场的两个角色单挑）
  timer: 60,                 // 每局秒数，超时按剩余生命判定
  meterMax: 100,             // 气槽上限
  meterStart: 0,
  guardMax: 120,             // 防御槽：归零则防御崩解
  guardRegen: 0.12,          // 每帧恢复（不处于防御硬直时）
  comboScale: [1.0, 0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30], // 第 n 段伤害倍率，之后取末位
  minScale: 0.30,
  throwScale: 0.45,          // 投技在连段中的修正
  teamSize: 3,
  pushbox: { w: 56, h: 110 },
  airdash: false,
  // 起跳后到落地的帧数（跳跃弧线固定，六人一致）
  jumpFrames: 34,
  jumpHeight: 132,
  jumpForward: 210,
  jumpBackward: 150,
  dashFrames: 14,
  dashDistance: 150,
  backdashFrames: 18,
  backdashDistance: 120,
  backdashInvuln: [1, 6],    // 后跳无敌帧区间（含）
  wakeupInvuln: [1, 6],      // 倒地起身无敌帧
  turnFacing: true,
  standing: 'stand',
};

// 招式通用默认值。角色条目只写差异，裁判在装配时补齐。
// chip=0：普通技被防御时不削血，只有必杀技与超必杀带削防伤害。
const moveDefaults = {
  kind: 'strike',
  startup: 5, active: 3, recovery: 8,
  damage: 50, chip: 0, hitstun: 11, blockstun: 7,
  guard: 'mid',              // mid = 站防/蹲防皆可；low = 必须蹲防；overhead = 必须站防
  hitbox: { x: 70, y: -20, w: 74, h: 40 },
  pushback: 22, hitstop: 4, guardPushback: 16,
  meterGain: 8, meterGainOnBlock: 3, meterGainOnHitAsVictim: 5,
  cancelable: true, air: false, sound: 'hit',
};

// 逐招补全：缺省字段从上面继承。这样角色表可以只写「哪里不一样」。
function complete(base, extra) {
  const merged = { ...base, ...extra };
  merged.hitbox = { ...base.hitbox, ...(extra.hitbox || {}) };
  return merged;
}

/* ---------- 六名角色 ----------
 * 每人的规格：4 个普通技（轻拳/重拳/轻腿/重腿）+ 3 个必杀技 + 1 个超必杀。
 * motion 使用下面的指令文法。N = 中立，F = 面向对手方向，B = 背对方向，U = 上，D = 下。
 * 按钮：LP / HP / LK / HK。G 用于防御（按住 B 或 DB 同样可以防御）。
 *
 * 费用：special 消耗 0；super 消耗 100 气并清空气槽。
 * invuln 用 [起, 止] 帧区间表示，起点从招式第 1 帧算。
 */

const characters = {

  /* ==== 1. 均衡 · Aegis 铁律 ====
   * 教学型角色：波动拳 + 升龙 + 突进，三件套齐全，没有短板也没有尖刺。
   * 打赢它的办法不是选一个克制它的人，而是把距离和时机做得比用它的人更好。 */
  aegis: {
    id: 'aegis', name: '铁律 · Aegis', archetype: '均衡', color: '#76bcce', rune: '❖',
    speed: 5, jumpForward: rules.jumpForward, jumpBackward: rules.jumpBackward,
    normals: {
      lp: complete(moveDefaults, { name: '直拳', startup: 4, active: 3, recovery: 6, damage: 58, hitstun: 11, blockstun: 7, hitbox: { x: 72, y: -54, w: 78, h: 34 } }),
      hp: complete(moveDefaults, { name: '铁贯手', startup: 12, active: 4, recovery: 22, damage: 128, hitstun: 18, blockstun: 11, pushback: 34, hitstop: 7, hitbox: { x: 78, y: -58, w: 104, h: 40 }, cancelWindow: [11, 26] }),
      lk: complete(moveDefaults, { name: '侧踢', startup: 5, active: 3, recovery: 8, damage: 66, hitstun: 12, blockstun: 8, hitbox: { x: 76, y: -18, w: 86, h: 32 } }),
      hk: complete(moveDefaults, { name: '回旋踵落', startup: 14, active: 4, recovery: 23, damage: 140, hitstun: 19, blockstun: 12, guard: 'mid', pushback: 38, hitstop: 8, hitbox: { x: 84, y: -66, w: 108, h: 62 }, cancelWindow: [13, 28] }),
    },
    specials: {
      fireball: { name: '铁律弹', motion: 'qcf', button: 'LP', startup: 12, recovery: 24, meterGain: 12,
        projectile: { speed: 9, damage: 92, chip: 12, hitstun: 16, blockstun: 10, hitstop: 6, w: 40, h: 32, life: 110, color: '#8fe6ff' } },
      uppercut: { name: '裂空上击', motion: 'dp', button: 'HP', startup: 6, active: 10, recovery: 32, damage: 134, chip: 18, hitstun: 22, blockstun: 12,
        hitbox: { x: 34, y: -140, w: 96, h: 180 }, knockup: 15, invuln: [1, 8], hitstop: 8, meterGain: 14, launcher: true, cancelable: false },
      rush: { name: '铁律突进', motion: 'qcb', button: 'LK', startup: 10, active: 6, recovery: 26, damage: 106, chip: 14, hitstun: 18, blockstun: 10,
        hitbox: { x: 84, y: -56, w: 112, h: 44 }, knockup: 6, hitstop: 7, meterGain: 12, travel: { frames: 8, distance: 216 }, launcher: true, cancelable: false },
    },
    super: { name: '绝律 · 三重天', motion: 'qcf', button: 'HP', cost: 100, startup: 10, active: 26, recovery: 26, damage: 292, chip: 40, hitstun: 24, blockstun: 14,
      hitbox: { x: 80, y: -140, w: 150, h: 190 }, hits: 6, hitstop: 5, knockup: 22, invuln: [1, 12], meterGain: 0, cinematic: 20, launcher: true, cancelable: false },
  },

  /* ==== 2. 突进 · Vex 疾影 ====
   * 最快的正面压制：冲刺、空踏、贴脸轻拳连段。代价是手短、血线薄、凹招只能靠突进无敌帧。 */
  vex: {
    id: 'vex', name: '疾影 · Vex', archetype: '突进', color: '#e38978', rune: '✦',
    speed: 5.8, jumpForward: rules.jumpForward + 40, jumpBackward: rules.jumpBackward,
    normals: {
      lp: complete(moveDefaults, { name: '刺拳', startup: 3, active: 3, recovery: 5, damage: 50, hitstun: 10, blockstun: 6, pushback: 16, hitbox: { x: 64, y: -52, w: 66, h: 30 } }),
      hp: complete(moveDefaults, { name: '双掌推', startup: 9, active: 4, recovery: 22, damage: 116, hitstun: 17, blockstun: 10, pushback: 30, hitbox: { x: 70, y: -56, w: 92, h: 38 }, cancelWindow: [9, 24] }),
      lk: complete(moveDefaults, { name: '低扫', startup: 4, active: 3, recovery: 9, damage: 58, hitstun: 11, blockstun: 7, guard: 'low', hitbox: { x: 68, y: -14, w: 80, h: 30 } }),
      hk: complete(moveDefaults, { name: '旋身踢', startup: 12, active: 4, recovery: 24, damage: 138, hitstun: 18, blockstun: 11, pushback: 34, hitbox: { x: 76, y: -60, w: 100, h: 56 }, cancelWindow: [12, 26] }),
    },
    specials: {
      dash: { name: '疾影突', motion: 'qcb', button: 'LK', startup: 7, active: 5, recovery: 18, damage: 88, chip: 10, hitstun: 16, blockstun: 9,
        hitbox: { x: 80, y: -54, w: 100, h: 42 }, invuln: [1, 6], travel: { frames: 7, distance: 260 }, hitstop: 6, meterGain: 12, cancelable: false },
      dive: { name: '踏空斩', motion: 'qcf', button: 'HK', airOnly: true, startup: 6, active: 10, recovery: 12, damage: 120, chip: 14, hitstun: 18, blockstun: 10,
        hitbox: { x: 40, y: -30, w: 88, h: 70 }, knockup: 8, hitstop: 7, meterGain: 12, cancelable: false },
      dart: { name: '影针', motion: 'qcf', button: 'LP', startup: 8, recovery: 18, meterGain: 12,
        projectile: { speed: 14, damage: 60, chip: 6, hitstun: 12, blockstun: 7, hitstop: 4, w: 26, h: 18, life: 140, color: '#ffb3a1' } },
    },
    super: { name: '疾影 · 百裂', motion: 'qcf', button: 'HP', cost: 100, startup: 6, active: 30, recovery: 20, damage: 280, chip: 36, hitstun: 22, blockstun: 13,
      hitbox: { x: 66, y: -120, w: 128, h: 160 }, hits: 8, hitstop: 3, invuln: [1, 10], travel: { frames: 12, distance: 290 }, meterGain: 0, cinematic: 18, cancelable: false },
  },

  /* ==== 3. 远距离 · Kestrel 长弓 ====
   * 手长、箭多、把你钉在屏幕另一头。近身只有 3 帧轻拳和一个风险极大的凹招。 */
  kestrel: {
    id: 'kestrel', name: '长弓 · Kestrel', archetype: '远距离', color: '#99bb6f', rune: '➶',
    speed: 4.4, jumpForward: rules.jumpForward - 20, jumpBackward: rules.jumpBackward + 20,
    normals: {
      lp: complete(moveDefaults, { name: '短弓柄', startup: 3, active: 3, recovery: 5, damage: 52, hitstun: 10, blockstun: 6, pushback: 14, hitbox: { x: 60, y: -52, w: 60, h: 30 } }),
      hp: complete(moveDefaults, { name: '弓身横扫', startup: 11, active: 4, recovery: 21, damage: 132, hitstun: 17, blockstun: 11, pushback: 32, hitbox: { x: 86, y: -56, w: 116, h: 40 }, cancelWindow: [12, 26] }),
      lk: complete(moveDefaults, { name: '踩踏', startup: 4, active: 3, recovery: 8, damage: 62, hitstun: 11, blockstun: 7, guard: 'low', hitbox: { x: 70, y: -16, w: 82, h: 30 } }),
      hk: complete(moveDefaults, { name: '高踢', startup: 13, active: 4, recovery: 23, damage: 152, hitstun: 19, blockstun: 12, guard: 'overhead', pushback: 36, hitbox: { x: 88, y: -74, w: 118, h: 58 }, cancelWindow: [14, 30] }),
    },
    specials: {
      arrow: { name: '穿云箭', motion: 'qcf', button: 'LP', startup: 11, recovery: 20, meterGain: 12,
        projectile: { speed: 12, damage: 96, chip: 13, hitstun: 16, blockstun: 10, hitstop: 5, w: 46, h: 22, life: 150, color: '#d6ef9a' } },
      lanceshot: { name: '贯石枪', motion: 'qcb', button: 'HP', startup: 15, active: 6, recovery: 26, damage: 144, chip: 16, hitstun: 20, blockstun: 12,
        hitbox: { x: 100, y: -60, w: 150, h: 44 }, knockup: 5, hitstop: 7, meterGain: 12, cancelable: false },
      rise: { name: '倒跃射', motion: 'dp', button: 'HK', startup: 7, active: 4, recovery: 30, damage: 112, chip: 12, hitstun: 18, blockstun: 10,
        hitbox: { x: 30, y: -150, w: 90, h: 170 }, knockup: 12, invuln: [1, 7], hitstop: 7, meterGain: 12, launcher: true, cancelable: false },
    },
    super: { name: '长弓 · 万矢', motion: 'qcf', button: 'HP', cost: 100, startup: 9, active: 40, recovery: 24, damage: 300, chip: 38, hitstun: 22, blockstun: 13,
      hitbox: { x: 84, y: -130, w: 180, h: 170 }, hits: 7, hitstop: 4, invuln: [1, 11], meterGain: 0, cinematic: 18, cancelable: false },
  },

  /* ==== 4. 重装 · Torv 磐岩 ====
   * 一格护甲、一次抓投、一记震地。走得慢、起手久，但每一次正确读对都能换回一条命。 */
  torv: {
    id: 'torv', name: '磐岩 · Torv', archetype: '重装', color: '#bea0dd', rune: '⬟',
    speed: 3.9, jumpForward: rules.jumpForward - 50, jumpBackward: rules.jumpBackward - 20,
    normals: {
      lp: complete(moveDefaults, { name: '掌击', startup: 5, active: 3, recovery: 7, damage: 68, hitstun: 12, blockstun: 7, pushback: 20, hitbox: { x: 74, y: -56, w: 80, h: 36 } }),
      hp: complete(moveDefaults, { name: '岩锤', startup: 15, active: 5, recovery: 26, damage: 158, hitstun: 20, blockstun: 13, pushback: 40, hitstop: 9, hitbox: { x: 82, y: -62, w: 112, h: 46 }, cancelWindow: [15, 30] }),
      lk: complete(moveDefaults, { name: '胫撞', startup: 7, active: 3, recovery: 11, damage: 76, hitstun: 13, blockstun: 8, guard: 'low', hitbox: { x: 76, y: -16, w: 88, h: 32 } }),
      hk: complete(moveDefaults, { name: '落磐', startup: 18, active: 5, recovery: 30, damage: 172, hitstun: 21, blockstun: 14, pushback: 44, hitstop: 10, hitbox: { x: 88, y: -80, w: 118, h: 72 }, cancelWindow: [18, 34] }),
    },
    specials: {
      grab: { name: '磐岩抓', motion: 'hcb', button: 'HP', kind: 'throw', startup: 7, recovery: 30, damage: 178, hitstun: 40,
        range: 74, meterGain: 16, unblockable: true, hardKnockdown: true, cancelable: false, whiffRecovery: 44 },
      lariat: { name: '铁肘横扫', motion: 'qcb', button: 'LK', startup: 13, active: 5, recovery: 26, damage: 132, chip: 16, hitstun: 19, blockstun: 12,
        hitbox: { x: 74, y: -64, w: 128, h: 54 }, armor: [4, 13], pushback: 38, hitstop: 8, meterGain: 14, cancelable: false },
      quake: { name: '震地', motion: 'dp', button: 'HK', startup: 18, recovery: 36, meterGain: 14,
        projectile: { speed: 5, damage: 110, chip: 16, hitstun: 20, blockstun: 12, hitstop: 7, w: 70, h: 40, life: 120, low: true, color: '#d9c6f5' } },
    },
    super: { name: '磐岩 · 万钧', motion: 'qcf', button: 'HP', cost: 100, startup: 8, active: 6, recovery: 34, damage: 340, chip: 44, hitstun: 30, blockstun: 16,
      hitbox: { x: 70, y: -90, w: 120, h: 110 }, invuln: [1, 14], armor: [1, 20], knockup: 20, hardKnockdown: true, hitstop: 10, meterGain: 0, cinematic: 20, launcher: true, cancelable: false },
  },

  /* ==== 5. 奇诡 · Nyx 幻缚 ====
   * 不擅长正面硬拼，靠位置、延迟爆炸和瞬移让对手打空气。判定区间偏窄，用不熟就是自杀。 */
  nyx: {
    id: 'nyx', name: '幻缚 · Nyx', archetype: '奇诡', color: '#e0b873', rune: '◈',
    speed: 4.8, jumpForward: rules.jumpForward, jumpBackward: rules.jumpBackward + 30,
    normals: {
      lp: complete(moveDefaults, { name: '指刺', startup: 4, active: 3, recovery: 5, damage: 56, hitstun: 10, blockstun: 6, pushback: 15, hitbox: { x: 66, y: -54, w: 68, h: 30 } }),
      hp: complete(moveDefaults, { name: '缠丝手', startup: 10, active: 4, recovery: 19, damage: 124, hitstun: 18, blockstun: 10, pushback: 26, hitbox: { x: 78, y: -58, w: 100, h: 42 }, cancelWindow: [10, 24] }),
      lk: complete(moveDefaults, { name: '绊足', startup: 5, active: 3, recovery: 10, damage: 60, hitstun: 12, blockstun: 7, guard: 'low', hitbox: { x: 72, y: -14, w: 86, h: 28 } }),
      hk: complete(moveDefaults, { name: '幻崩踢', startup: 12, active: 4, recovery: 21, damage: 138, hitstun: 18, blockstun: 11, pushback: 32, hitbox: { x: 80, y: -62, w: 104, h: 58 }, cancelWindow: [12, 26] }),
    },
    specials: {
      teleport: { name: '移位', motion: 'qcf', button: 'LP', kind: 'move', startup: 9, recovery: 14, invuln: [1, 9],
        teleport: { distance: 330, toBehind: false }, meterGain: 8, cancelable: false },
      bomb: { name: '缚雷', motion: 'qcb', button: 'LP', startup: 14, recovery: 26, meterGain: 14,
        projectile: { speed: 0, damage: 140, chip: 0, hitstun: 22, blockstun: 0, hitstop: 8, w: 56, h: 56, life: 70, fuse: 34, arc: { height: 190, frames: 30, distance: 320 }, unblockable: true, color: '#ffd894' } },
      ghost: { name: '幻影坠', motion: 'dp', button: 'HK', airOnly: true, startup: 8, active: 8, recovery: 16, damage: 108, chip: 12, hitstun: 18, blockstun: 10,
        hitbox: { x: 36, y: -34, w: 92, h: 84 }, knockup: 10, hitstop: 7, meterGain: 12, cancelable: false },
    },
    super: { name: '幻缚 · 虚界', motion: 'qcf', button: 'HP', cost: 100, startup: 9, active: 30, recovery: 26, damage: 300, chip: 40, hitstun: 26, blockstun: 14,
      hitbox: { x: 76, y: -150, w: 160, h: 200 }, hits: 5, hitstop: 5, invuln: [1, 12], teleport: { distance: 90, toBehind: true }, knockup: 18, meterGain: 0, cinematic: 20, launcher: true, cancelable: false },
  },

  /* ==== 6. 架式 · Sable 静水 ====
   * 反手角色：格挡架式能吃掉一次攻击并反打，风压制中距离，凹招只有架式成功了才成立。
   * 上限最高、下限最低——用得对不对，全看对人心的判断。 */
  sable: {
    id: 'sable', name: '静水 · Sable', archetype: '架式', color: '#78c5ab', rune: '≈',
    speed: 4.9, jumpForward: rules.jumpForward, jumpBackward: rules.jumpBackward,
    normals: {
      lp: complete(moveDefaults, { name: '推掌', startup: 4, active: 3, recovery: 6, damage: 56, hitstun: 11, blockstun: 7, pushback: 18, hitbox: { x: 70, y: -54, w: 74, h: 32 } }),
      hp: complete(moveDefaults, { name: '断水掌', startup: 11, active: 4, recovery: 21, damage: 126, hitstun: 18, blockstun: 11, pushback: 30, hitbox: { x: 80, y: -58, w: 102, h: 42 }, cancelWindow: [11, 26] }),
      lk: complete(moveDefaults, { name: '拂胫', startup: 5, active: 3, recovery: 9, damage: 62, hitstun: 12, blockstun: 7, guard: 'low', hitbox: { x: 72, y: -16, w: 84, h: 30 } }),
      hk: complete(moveDefaults, { name: '镜返踢', startup: 13, active: 4, recovery: 23, damage: 140, hitstun: 19, blockstun: 12, pushback: 34, hitbox: { x: 82, y: -64, w: 106, h: 60 }, cancelWindow: [13, 28] }),
    },
    specials: {
      parry: { name: '静水架式', motion: 'qcb', button: 'LP', kind: 'stance', startup: 4, stance: 22, recovery: 10,
        parryWindow: 16, channelDamage: 0.40, riposte: { startup: 6, active: 4, recovery: 24, damage: 140, hitstun: 22, blockstun: 12, hitbox: { x: 86, y: -62, w: 118, h: 52 }, hitstop: 8, hardKnockdown: true, knockup: 13, launcher: true },
        meterGain: 0, meterOnParry: 20, cancelable: false },
      wind: { name: '逆风掌', motion: 'qcf', button: 'LP', startup: 11, recovery: 22, meterGain: 12,
        projectile: { speed: 7, damage: 84, chip: 10, hitstun: 16, blockstun: 10, hitstop: 5, w: 56, h: 48, life: 120, wind: 34, color: '#a9f0dd' } },
      counter: { name: '静水·升', motion: 'dp', button: 'HP', startup: 6, active: 8, recovery: 32, damage: 128, chip: 16, hitstun: 22, blockstun: 12,
        hitbox: { x: 32, y: -140, w: 94, h: 176 }, invuln: [1, 7], knockup: 16, hitstop: 8, meterGain: 14, launcher: true, cancelable: false },
    },
    super: { name: '静水 · 万返', motion: 'qcf', button: 'HP', cost: 100, startup: 7, active: 24, recovery: 32, damage: 240, chip: 32, hitstun: 26, blockstun: 14,
      hitbox: { x: 74, y: -140, w: 145, h: 190 }, hits: 4, hitstop: 6, invuln: [1, 16], reflect: 20, knockup: 20, meterGain: 0, cinematic: 20, launcher: true, cancelable: false },
  },
};

/* ---------- 指令文法 ----------
 * 每一物理帧，选手提交 {dir, btn}：
 *   dir: 'N' 中立 | 'F' 前（朝对手）| 'B' 后 | 'U' 上 | 'D' 下 | 'UF' 前上 | 'UB' 后上 | 'DF' 前下 | 'DB' 后下
 *   btn: null | 'LP' | 'HP' | 'LK' | 'HK' | 'G'（防御）
 * 按住 B 或 DB 即视为防御（蹲防为 DB，可防下段但不能防 overhead）。
 *
 * 必杀技为「方向序列 + 按钮」：
 *   qcf = ↓ ↓F F        （波动）
 *   qcb = ↓ ↓B B        （反向波动）
 *   dp  = F ↓ ↓F        （升龙）
 *   hcb = F ↓F ↓ ↓B B   （半圆后）
 * 最后一个方向与按钮必须同帧按下。序列允许在 10 帧内完成，中间可以夹入任意方向帧。
 * 例：qcf + HP 可以写成 D, D, F, F+HP 或 D, DF, F+HP（四帧，每帧一个方向）。
 */

// 方向归一化：把所有输入折算成「相对朝向」的键。裁判内部只用这套键。
const directionKeys = ['N', 'F', 'B', 'U', 'D', 'UF', 'UB', 'DF', 'DB'];
const buttons = ['LP', 'HP', 'LK', 'HK', 'G'];

// 解析一条 motion 字符串为方向键数组。
function parseMotion(motion) {
  return {
    qcf: ['D', 'DF', 'F'],
    qcb: ['D', 'DB', 'B'],
    dp: ['F', 'D', 'DF'],
    hcb: ['F', 'DF', 'D', 'DB', 'B'],
  }[motion] || null;
}

// 合法的方向/按钮集合，供裁判做输入校验。
function isDirection(v) { return v === null || v === undefined || directionKeys.includes(v); }
function isButton(v) { return v === null || v === undefined || buttons.includes(v); }

/* ---------- 平衡自检 ----------
 * 这个函数在启动时被裁判调用一次：如果六名角色的总火力预算差距过大，直接报错。
 * 有它才能保证「没有角色天生更强」这句话不是靠人肉感觉维持的。
 *
 * 度量方式：把每个招式的伤害折算成「每秒可兑现的输出」，再按可达距离加权——
 * 手长的招可以在更安全的距离收益，所以同样的帧数下价值更高。
 * 条件招式（架式反击要靠对方打进来才成立）按折扣计入，否则会把反手角色的预算虚高。 */
function auditBalance() {
  const reach = m => (m.hitbox ? m.hitbox.x + m.hitbox.w / 2 : 0);
  const REACH_BONUS = 1.25;      // 判定中心超过 95 像素视为长手
  const CONDITIONAL = 0.6;       // 需要对方配合才成立的招式
  const budgets = {};
  for (const c of Object.values(characters)) {
    let power = 0;
    for (const m of Object.values(c.normals)) {
      const fps = m.startup + m.active + m.recovery;
      power += (m.damage / fps) * 10 * (reach(m) > 95 ? REACH_BONUS : 1);
    }
    for (const m of Object.values(c.specials)) {
      const frames = (m.startup || 8) + (m.recovery || 20);
      const raw = m.damage || m.projectile?.damage || m.riposte?.damage || 0;
      const weight = m.kind === 'stance' ? CONDITIONAL : 1;
      const distant = (m.projectile && (m.projectile.speed > 0 || m.projectile.arc)) || reach(m) > 95;
      power += (raw / frames) * 8 * weight * (distant ? REACH_BONUS : 1);
    }
    power += (c.super.damage || 0) / 40 * 3;
    budgets[c.id] = Math.round(power * 10) / 10;
  }
  const values = Object.values(budgets), low = Math.min(...values), high = Math.max(...values);
  return { budgets, low, high, spread: Math.round((high / low - 1) * 1000) / 10 };
}

module.exports = { rules, moveDefaults, characters, directionKeys, buttons, parseMotion, isDirection, isButton, auditBalance };
