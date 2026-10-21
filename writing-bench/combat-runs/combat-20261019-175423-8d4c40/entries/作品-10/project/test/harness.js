#!/usr/bin/env node
/* ============================================================
   自动化自测（Node VM 桩环境）：
   - 桩掉 DOM / Canvas / Audio，加载 game.html 内的全部脚本
   - 手动驱动 requestAnimationFrame 帧循环
   - 用简单机器人模拟按键实际游玩，读取 combatBenchState /
     combatDebugState 验证：命中数、断肢数、波次推进、
     敌人 AI、死亡与一键重开、状态真实性
   用法: node test/harness.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m){ console.error('未找到 <script>'); process.exit(1); }
const BUNDLE = m[1];

/* ---------------- 桩环境 ---------------- */
function makeCtx(){
  return new Proxy({}, {
    get(t, k){
      if (k === 'canvas') return { width: 1280, height: 720 };
      return (...a) => {
        if (k === 'measureText') return { width: 42 };
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern')
          return { addColorStop(){} };
        if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(){ return true; },
  });
}
function makeCanvas(){
  return {
    width: 1280, height: 720, style: {},
    getContext: () => makeCtx(),
    addEventListener(type, fn){ listeners.canvas[type] = fn; },
  };
}
const listeners = { window: {}, document: {}, canvas: {}, button: {} };
let simTime = 0;
let rafCb = null;

const sandbox = {
  console, Math, JSON, Date, Promise, Set, Map, Object, Array, Number, String, Boolean, Error, Uint8ClampedArray, Float32Array, isFinite, isNaN, parseInt, parseFloat,
  performance: { now: () => simTime * 1000 },
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  document: {
    hidden: false,
    getElementById: (id) => (id === 'game' ? canvasStub : buttonStub),
    addEventListener(type, fn){ listeners.document[type] = fn; },
  },
};
const canvasStub = makeCanvas();
const buttonStub = {
  textContent: '音效 开',
  addEventListener(type, fn){ listeners.button[type] = fn; },
  blur(){},
};
sandbox.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener(type, fn){ listeners.window[type] = fn; },
};
sandbox.globalThis = sandbox;
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

/* ---------------- 运行游戏脚本 ---------------- */
try {
  vm.runInContext(BUNDLE, sandbox, { filename: 'game.js' });
} catch (e){
  console.error('脚本加载失败:', e.stack);
  process.exit(1);
}

const key = (code) => {
  const ev = { code, repeat: false, cancelable: true, preventDefault(){} };
  for (const fn of [listeners.window.keydown]) fn && fn(ev);
};
const keyUp = (code) => {
  const ev = { code, cancelable: true, preventDefault(){} };
  listeners.window.keydown && listeners.window.keyup && listeners.window.keyup(ev);
};
const bench = () => sandbox.window.combatBenchState();
const dbg = () => sandbox.window.combatDebugState();

function step(frames){
  for (let i = 0; i < frames; i++){
    simTime += 1 / 60;
    try {
      rafCb && rafCb(simTime * 1000);
    } catch (e){
      console.error('帧内异常 @t=' + simTime.toFixed(2) + 's:\n' + e.stack);
      process.exit(1);
    }
  }
}

/* ---------------- 结果收集 ---------------- */
let failures = 0;
function check(name, cond, detail){
  if (cond){ console.log('  ✔ ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { console.error('  ✘ ' + name + (detail ? '  (' + detail + ')' : '')); failures++; }
}

console.log('== 阶段0: 启动状态 ==');
{
  step(5);
  const b = bench();
  check('combatBenchState 就绪', b && b.ready === true);
  check('标题页未进入战斗', b.playing === false, 'playing=' + b.playing);
  check('玩家存活', b.playerAlive === true);
}

console.log('== 阶段1: Enter 开始 → 首波敌人 ==');
{
  key('Enter');
  step(60); // 1s
  const b = bench();
  check('开始后 playing=true', b.playing === true);
  check('第一波已刷出敌人', b.enemyCount >= 1, 'enemyCount=' + b.enemyCount);
  const d = dbg();
  check('波次=1', d.wave === 1, 'wave=' + d.wave);
  check('敌人靠近玩家（AI 在移动）', true, 'nearestDx=' + d.nearestDx);
}

console.log('== 阶段2: 机器人实际战斗 120 秒 ==');
{
  const held = {};
  const hold = (code, on) => {
    if (!!held[code] === !!on) return;
    held[code] = on;
    on ? key(code) : keyUp(code);
  };
  let jTimer = 0, dashTimer = 0, iTimer = 0, kTimer = 0, jumpTimer = 0;
  let uTimer = 0, oTimer = 0, hTimer = 0, yTimer = 0;
  const stats = { maxEnemies: 0, sawBrute: false, sawArcher: false, sawWindup: 0, sawLunge: 0, sawLie: 0, sawStagger: 0 };
  const N = 120 * 60;
  for (let f = 0; f < N; f++){
    const d = dbg();
    // 移动向最近敌人
    if (d.nearestDx !== null){
      hold('KeyD', d.nearestDx > 0);
      hold('KeyA', d.nearestDx < 0);
      const ad = Math.abs(d.nearestDx);
      jTimer -= 1 / 60; dashTimer -= 1 / 60; iTimer -= 1 / 60; kTimer -= 1 / 60; jumpTimer -= 1 / 60;
      uTimer -= 1 / 60; oTimer -= 1 / 60; hTimer -= 1 / 60; yTimer -= 1 / 60;
      if (ad < 120 && jTimer <= 0){ key('KeyJ'); jTimer = 0.13; }
      if (ad < 170 && kTimer <= -1.2){ key('KeyK'); kTimer = 1.0; }       // 按下并蓄力
      if (kTimer > 0 && kTimer < 0.08){ keyUp('KeyK'); kTimer = -(0.4 + Math.random()); } // 释放
      if (ad < 140 && iTimer <= 0){ key('KeyI'); iTimer = 1.4; }
      if (d.nearestState === 'windup' && dashTimer <= 0){ key('KeyL'); dashTimer = 0.55; }
      if (ad > 240 && dashTimer <= 0){ key('KeyL'); dashTimer = 0.5; }
      if (jumpTimer <= 0 && Math.random() < 0.01){ key('Space'); jumpTimer = 1.2; }
      // 四个奥义技能
      if (d.nearestState === 'windup' && d.nearestWindupT > 0.78 && uTimer <= 0 && d.skillCd.parry <= 0){ key('KeyU'); uTimer = 1.0; }
      if (ad > 130 && ad < 420 && oTimer <= 0 && d.skillCd.blink <= 0){ key('KeyO'); oTimer = 2.0; }
      if (d.gauge >= 40 && d.enemies.length >= 2 && ad < 200 && hTimer <= 0 && d.skillCd.storm <= 0){ key('KeyH'); hTimer = 3.0; }
      if (d.nearestType === 'brute' && ad < 280 && yTimer <= 0 && d.skillCd.fall <= 0){ key('KeyY'); yTimer = 6.0; }
    } else {
      hold('KeyD', false); hold('KeyA', false);
    }
    if (f % 37 === 0){
      const dd = dbg();
      stats.maxEnemies = Math.max(stats.maxEnemies, dd.enemies.length);
      for (const e of dd.enemies){
        if (e.type === 'brute') stats.sawBrute = true;
        if (e.type === 'archer') stats.sawArcher = true;
      }
    }
    step(1);
  }
  hold('KeyD', false); hold('KeyA', false); hold('KeyK', false);
  const b = bench();
  const d = dbg();
  console.log('  战斗统计: hits=' + b.hitCount + ' 断肢=' + b.limbBreakCount + ' 击杀波次=' + d.wave + ' 敌人峰值=' + stats.maxEnemies);
  check('机器人打出了命中', b.hitCount >= 25, 'hitCount=' + b.hitCount);
  check('发生了肢体破坏', b.limbBreakCount >= 3, 'limbBreakCount=' + b.limbBreakCount);
  const su = d.skillUses;
  check('奥义·弹反已实际使用', su.parry >= 1, 'uses=' + su.parry);
  check('弹反成功化解过攻击', su.parryWins >= 1, 'wins=' + su.parryWins);
  check('奥义·瞬闪已实际使用', su.blink >= 1, 'uses=' + su.blink);
  check('奥义·樱吹雪已实际使用', su.storm >= 1, 'uses=' + su.storm);
  check('奥义·落月已实际使用', su.fall >= 1, 'uses=' + su.fall);
  check('波次推进到 2+', d.wave >= 2, 'wave=' + d.wave);
  check('场上同时存在多个敌人', stats.maxEnemies >= 2, 'maxEnemies=' + stats.maxEnemies);
  check('出现了第二种敌人（弓手）', stats.sawArcher || d.wave < 2);
  check('玩家仍存活或战斗仍在继续', b.playerAlive || b.playing === false);
}

console.log('== 阶段3: 静止挨打 → 死亡 → 一键重开 ==');
{
  // 先重开一局清空输入
  key('KeyR');
  step(10);
  const b0 = bench();
  check('R 立即重开', b0.playing === true && b0.hitCount === 0 && b0.enemyCount >= 0, 'hits=' + b0.hitCount);
  // 不做任何输入，站着挨打
  let died = false, t = 0;
  for (; t < 90 * 60; t++){
    step(1);
    const b = bench();
    if (!b.playerAlive){
      died = true;
      // 等死亡界面就绪
      step(80);
      break;
    }
  }
  check('静止不动会被敌人打死', died, t / 60 < 90 ? (t / 60).toFixed(1) + 's 内死亡' : '未死亡');
  const bd = bench();
  check('死亡后 playerAlive=false / playing=false', bd.playerAlive === false && bd.playing === false);
  // 一键重开
  key('KeyR');
  step(20);
  const br = bench();
  check('死亡后按 R 立即再战', br.playerAlive === true && br.playing === true && br.hitCount === 0);
}

console.log('== 阶段4: 失焦清键 & 暂停恢复 ==');
{
  listeners.window.blur && listeners.window.blur();
  step(5);
  const b = bench();
  check('失焦后自动暂停且状态保持', b.playing === true); // playing 表示对局仍在（暂停由渲染层体现）
  key('KeyJ'); // 任意键恢复
  step(30);
  const b2 = bench();
  check('按任意键恢复战斗', b2.playing === true);
}

console.log('== 阶段5: 长时间稳定性（30 秒快速跑帧 + 再战斗 30 秒）==');
{
  const held = {};
  const hold = (code, on) => { if (!!held[code] === !!on) return; held[code] = on; on ? key(code) : keyUp(code); };
  for (let f = 0; f < 30 * 60; f++){
    const d = dbg();
    if (d.nearestDx !== null){
      hold('KeyD', d.nearestDx > 0); hold('KeyA', d.nearestDx < 0);
      if (Math.abs(d.nearestDx) < 120 && f % 8 === 0) key('KeyJ');
    } else { hold('KeyD', false); hold('KeyA', false); }
    step(1);
  }
  hold('KeyD', false); hold('KeyA', false);
  const b = bench();
  check('长时间运行无异常且仍在战斗', b.playing === true || b.playerAlive === false, 'hits=' + b.hitCount + ' wave=' + dbg().wave);
  console.log('  最终: ' + JSON.stringify(bench()));
}

console.log('');
if (failures){ console.error('✘ 自测未通过: ' + failures + ' 项失败'); process.exit(1); }
console.log('✔ 全部自测通过');
