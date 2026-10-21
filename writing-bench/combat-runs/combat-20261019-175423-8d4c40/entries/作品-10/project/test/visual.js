#!/usr/bin/env node
/* ============================================================
   视觉自测：node-canvas 渲染真实画面
   - 用「会闪避」的机器人实际游玩
   - 关键时刻截图存 test/shots/
   - 像素探针断言：角色/木偶/刀光/HUD/月/断肢 确实画在屏幕上
   用法: node test/visual.js   (需 /tmp/node_modules/canvas)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas } = require('/tmp/node_modules/canvas');

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const BUNDLE = html.match(/<script>([\s\S]*)<\/script>/)[1];

const listeners = { window: {}, document: {}, canvas: {}, button: {} };
let simTime = 0, rafCb = null;
const realCanvas = createCanvas(1280, 720);
realCanvas.style = {};
realCanvas.addEventListener = (t, f) => { listeners.canvas[t] = f; };
const buttonStub = { textContent: '', addEventListener(t, f){ listeners.button[t] = f; }, blur(){} };

const sandbox = {
  console, Math, JSON, Date, Promise, Set, Map, Object, Array, Number, String, Boolean, Error, Uint8ClampedArray, Float32Array, isFinite, isNaN, parseInt, parseFloat,
  performance: { now: () => simTime * 1000 },
  setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  document: { hidden: false, getElementById: (id) => (id === 'game' ? realCanvas : buttonStub), addEventListener(t, f){ listeners.document[t] = f; } },
};
sandbox.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener(t, f){ listeners.window[t] = f; } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(BUNDLE, sandbox, { filename: 'game.js' });

const key = (code) => listeners.window.keydown({ code, repeat: false, cancelable: true, preventDefault(){} });
const keyUp = (code) => listeners.window.keyup && listeners.window.keyup({ code, cancelable: true, preventDefault(){} });
const bench = () => sandbox.window.combatBenchState();
const dbg = () => sandbox.window.combatDebugState();
const rctx = realCanvas.getContext('2d');

const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
function shot(name){
  fs.writeFileSync(path.join(SHOTS, name + '.png'), realCanvas.toBuffer('image/png'));
  console.log('  截图: ' + name + '.png');
}
function step(frames){
  for (let i = 0; i < frames; i++){
    simTime += 1 / 60;
    try { rafCb && rafCb(simTime * 1000); }
    catch (e){ console.error('帧异常: ' + e.stack); process.exit(1); }
  }
}
function pixels(x, y, w, h){
  x = Math.round(Math.max(0, Math.min(1280 - w, x)));
  y = Math.round(Math.max(0, Math.min(720 - h, y)));
  const img = rctx.getImageData(x, y, w, h).data;
  const out = [];
  for (let i = 0; i < img.length; i += 4) out.push([img[i], img[i + 1], img[i + 2]]);
  return out;
}
function countIn(x, y, w, h, pred){
  let n = 0;
  for (const p of pixels(x, y, w, h)) if (pred(p[0], p[1], p[2])) n++;
  return n;
}
function w2s(d, wx, wy){
  const s = d.vs * d.zoom;
  return [Math.round(d.CW / 2 + (wx - d.camX) * s), Math.round(d.CH / 2 + (wy - d.camY) * s)];
}

let failures = 0;
function check(name, cond, detail){
  if (cond) console.log('  ✔ ' + name + (detail ? '  (' + detail + ')' : ''));
  else { console.error('  ✘ ' + name + (detail ? '  (' + detail + ')' : '')); failures++; }
}

/* 会闪避的机器人（同 harness 阶段2），死亡自动重开 */
const held = {};
const hold = (code, on) => { if (!!held[code] === !!on) return; held[code] = on; on ? key(code) : keyUp(code); };
let jT = 0, dT = 0, iT = 0, kT = 0, sT = 0;
let uT = 0, oT = 0, hT = 0, yT = 0, skillIntent = 0;
let peakHits = 0, peakLb = 0, maxWaveSeen = 1;
const skillSeen = { parry: 0, blink: 0, storm: 0, fall: 0, parryWins: 0 };
const pendingShots = [];   // {frames, name}
function botFrame(dt){
  const d = dbg();
  peakHits = Math.max(peakHits, bench().hitCount);
  peakLb = Math.max(peakLb, bench().limbBreakCount);
  maxWaveSeen = Math.max(maxWaveSeen, d.wave);
  const su = d.skillUses;
  if (su){
    if (su.parryWins > skillSeen.parryWins){ skillSeen.parryWins = su.parryWins; pendingShots.push({ frames: 5, name: '09_parry_riposte' }); }
    if (su.blink > skillSeen.blink){ skillSeen.blink = su.blink; pendingShots.push({ frames: 10, name: '10_blink_strike' }); }
    if (su.storm > skillSeen.storm){ skillSeen.storm = su.storm; pendingShots.push({ frames: 26, name: '11_storm' }); }
    if (su.fall > skillSeen.fall){ skillSeen.fall = su.fall; pendingShots.push({ frames: 58, name: '12_fall_impact' }); }
  }
  if (d.dead){
    hold('KeyD', false); hold('KeyA', false); hold('KeyK', false);
    key('KeyR');
    return dbg();
  }
  if (d.nearestDx !== null){
    hold('KeyD', d.nearestDx > 0);
    hold('KeyA', d.nearestDx < 0);
    const ad = Math.abs(d.nearestDx);
    jT -= dt; dT -= dt; iT -= dt; kT -= dt; sT -= dt;
    uT -= dt; oT -= dt; hT -= dt; yT -= dt;
    if (skillIntent > 0){
      // 技能意图窗口：暂停普攻键，让技能从空档/取消窗口中生效
      skillIntent -= dt;
    } else {
      if (ad < 120 && jT <= 0){ key('KeyJ'); jT = 0.13; }
      if (ad < 170 && kT <= -1.2){ key('KeyK'); kT = 1.0; }
      if (kT > 0 && kT < 0.08){ keyUp('KeyK'); kT = -(0.4 + Math.random()); }
      if (ad < 140 && iT <= 0){ key('KeyI'); iT = 1.4; }
    }
    if (d.nearestState === 'windup' && dT <= 0){ key('KeyL'); dT = 0.55; }
    if (ad > 240 && dT <= 0){ key('KeyL'); dT = 0.5; }
    if (sT <= 0 && Math.random() < 0.008){ key('Space'); sT = 1.2; }
    // 奥义（按下即进入意图窗口）
    if (d.nearestState === 'windup' && d.nearestWindupT > 0.78 && uT <= 0 && d.skillCd.parry <= 0){ key('KeyU'); uT = 1.0; skillIntent = 0.4; }
    if (ad > 130 && ad < 420 && oT <= 0 && d.skillCd.blink <= 0){ key('KeyO'); oT = 2.0; skillIntent = 0.4; }
    if (d.gauge >= 40 && d.enemies.length >= 2 && ad < 200 && hT <= 0 && d.skillCd.storm <= 0){ key('KeyH'); hT = 3.0; skillIntent = 0.6; }
    if (ad < 280 && yT <= 0 && d.skillCd.fall <= 0 && (d.nearestType === 'brute' || d.enemies.length >= 2)){ key('KeyY'); yT = 7.0; skillIntent = 0.6; }
  } else {
    hold('KeyD', false); hold('KeyA', false);
  }
  return d;
}
function play(frames){
  for (let i = 0; i < frames; i++){
    botFrame(1 / 60);
    step(1);
    for (let k = pendingShots.length - 1; k >= 0; k--){
      if (--pendingShots[k].frames <= 0){
        shot(pendingShots[k].name);
        pendingShots.splice(k, 1);
      }
    }
  }
}

console.log('== 视觉与像素采样 ==');

/* 1. 标题 */
step(40);
{
  shot('01_title');
  const bright = countIn(0, 0, 1280, 720, (r, g, b) => r > 180 && g > 170);
  check('标题画面有高亮元素（标题字/月）', bright > 300, 'bright=' + bright);
}

/* 开始并接近敌人 */
key('Enter');
play(90);

/* 2. 连斩刀光帧（进入判定帧后采样，朝向正确一侧） */
{
  let got = false;
  for (let i = 0; i < 900 && !got; i++){
    const d = botFrame(1 / 60);
    step(1);
    if ((d.pmove === 'l1' || d.pmove === 'l2' || d.pmove === 'l3') && d.pmoveT > 0.09){
      shot('02_light_slash');
      const dd = dbg();
      const [ax, ay] = w2s(dd, dd.px + dd.pfacing * 62, dd.py - 46);
      const glow = countIn(ax - 46, ay - 46, 92, 92, (r, g, b) => (r > 200 && g > 90) || (r > 210 && b > 210));
      check('攻击时刀光可见', glow > 6, 'glowPx=' + glow + ' facing=' + dd.pfacing + ' move=' + dd.pmove + '/' + dd.pmoveT);
      got = true;
    }
  }
  check('成功捕获出招帧', got);
  play(20);
}

/* 3. 玩家与敌人绘制存在 */
{
  const d = dbg();
  const [pxs, pys] = w2s(d, d.px, d.py);
  const robe = countIn(pxs - 24, pys - 100, 48, 100, (r, g, b) => r > 185 && g > 185 && b > 200);
  check('玩家白袍绘制在屏幕上', robe > 8, 'robePx=' + robe + ' @' + pxs + ',' + pys);
  if (d.nearestDx !== null){
    const ex = d.px + d.nearestDx;
    const [exs, eys] = w2s(d, ex, 560);
    const wood = countIn(exs - 26, eys - 90, 52, 90, (r, g, b) => r > 60 && r < 170 && g > 35 && g < 130 && b < 100 && r > b + 20);
    check('木偶棕色躯体绘制在屏幕上', wood > 10, 'woodPx=' + wood + ' @' + exs + ',' + eys);
  }
  // 月亮
  const moon = countIn(1280 * 0.72 - 30, 720 * 0.2 - 30, 60, 60, (r, g, b) => r > 200 && g > 195 && b > 170);
  check('月亮绘制', moon > 300, 'moonPx=' + moon);
  // 地面暗色
  const [gxs, gys] = w2s(d, d.px, 585);
  const groundDark = countIn(gxs - 40, gys, 80, 30, (r, g, b) => r + g + b < 200);
  check('地面绘制（暗色）', groundDark > 200, 'darkPx=' + groundDark);
  // HUD 血条
  const hp = countIn(20, 20, 268, 17, (r, g, b) => r > 150 && g < 140);
  check('HUD 血条绘制', hp > 60, 'hpPx=' + hp);
}

/* 4. 蓄力（可能被受击打断，重试数次） */
{
  let ok = false;
  for (let attempt = 0; attempt < 6 && !ok; attempt++){
    // 等待落地且不在攻击中
    for (let i = 0; i < 90; i++){ const d = dbg(); if (!d.pair && !d.pmove && !d.pcharging){ break; } step(1); }
    key('KeyK');
    for (let i = 0; i < 56; i++) step(1);
    const d = dbg();
    if (d.pcharging){
      shot('03_charge_full');
      check('进入蓄力状态', true, 'chargeT=' + d.pchargeT);
      const [cxs, cys] = w2s(d, d.px, d.py - 80);
      const aura = countIn(cxs - 50, cys - 50, 100, 100, (r, g, b) => (b > 150 && r < 200) || (r > 200 && g > 80));
      check('蓄力剑气特效可见', aura > 4, 'auraPx=' + aura);
      ok = true;
      keyUp('KeyK');
      play(18);
      shot('04_crescent');
    } else {
      keyUp('KeyK');
      play(45); // 被打断则稍作战斗再试
    }
  }
  if (!ok) check('进入蓄力状态', false, '6次尝试均被打断');
}

/* 5. 战斗直到断肢 */
{
  const lb0 = bench().limbBreakCount;
  let frames = 0;
  for (; frames < 60 * 45; frames++){
    botFrame(1 / 60);
    step(1);
    if (bench().limbBreakCount > lb0) break;
  }
  const b = bench();
  check('战斗中触发断肢', b.limbBreakCount > lb0, 'limb=' + b.limbBreakCount + ' hits=' + b.hitCount);
  step(2);
  const d = dbg();
  shot('05_limb_break');
  check('断肢实体存在', d.debris > 0, 'debris=' + d.debris);
  {
    // 取离镜头中心最近的一块断肢采样
    let best = null, bd = 1e9;
    for (const dp of (d.debrisList || [])){
      const dist = Math.abs(dp.x - d.camX);
      if (dist < bd){ bd = dist; best = dp; }
    }
    if (best){
      const [dxs, dys] = w2s(d, best.x, best.y);
      const chip = countIn(dxs - 16, dys - 16, 32, 32, (r, g, b) => r > 60 && r < 190 && g > 35 && b < 120);
      check('断肢碎片绘制在屏幕上', chip > 3, 'chipPx=' + chip + ' @' + dxs + ',' + dys);
    } else check('断肢碎片绘制在屏幕上', false, '无断肢数据');
  }
}

/* 6. 空中追击 */
{
  let got = false;
  for (let i = 0; i < 60 * 90 && !got; i++){
    botFrame(1 / 60);
    step(1);
    const d = dbg();
    if (d.pair && (d.pmove === 'a1' || d.pmove === 'a2' || d.pmove === 'a3' || (d.pmove === 'launch' && d.pmoveT > 0.06))){
      shot('06_air_juggle');
      got = true;
    }
  }
  check('空中连击发生', got);
}

/* 6.5 四奥义施放采样（截图已由 botFrame 检测排队） */
{
  let tries = 0;
  while ((skillSeen.parryWins < 1 || skillSeen.blink < 1 || skillSeen.storm < 1 || skillSeen.fall < 1) && tries < 60 * 110){
    play(1);
    tries++;
  }
  play(40); // 清空剩余截图队列
  check('奥义·弹反成功化解并截图', skillSeen.parryWins >= 1, 'wins=' + skillSeen.parryWins);
  check('奥义·瞬闪已施放并截图', skillSeen.blink >= 1, 'uses=' + skillSeen.blink);
  check('奥义·樱吹雪已施放并截图', skillSeen.storm >= 1, 'uses=' + skillSeen.storm);
  check('奥义·落月已施放并截图', skillSeen.fall >= 1, 'uses=' + skillSeen.fall);
  // 死亡遮罩会压暗 HUD，先确保存活再采样
  for (let i = 0; i < 400 && dbg().dead; i++){ key('KeyR'); play(1); }
  play(2);
  const dd2 = dbg();
  const chips = countIn(16, 720 - 98, 236, 46, (r, g, b) => r > 150 && g > 140 && b > 130);
  check('技能栏已绘制在左下角', chips > 40, 'chipPx=' + chips + ' dead=' + dd2.dead + ' state=' + dd2.state + ' wave=' + dd2.waveState);
}

/* 7. 推进到重锤傀儡 */
{
  let saw = false, maxWave = 1;
  for (let i = 0; i < 60 * 240; i++){
    botFrame(1 / 60);
    step(1);
    const d = dbg();
    maxWave = Math.max(maxWave, d.wave);
    if (d.nearestType === 'brute'){ saw = true; break; }
    if (i === 60 * 200) console.log('    (200s 仍未见到重锤, wave=' + d.wave + ')');
  }
  const d = dbg();
  check('波次推进中出现重锤傀儡', saw, 'maxWave=' + maxWave + ' 当前wave=' + d.wave);
  if (saw){
    // 等它前摇并截图
    let w = false;
    for (let i = 0; i < 60 * 70 && !w; i++){
      botFrame(1 / 60);
      step(1);
      const dd = dbg();
      if (dd.nearestType === 'brute' && (dd.nearestState === 'windup' || dd.nearestState === 'attack')){ shot('07_brute_fight'); w = true; }
    }
    check('捕获重锤攻击帧', w);
  }
  const hitsBefore = bench().hitCount;
  play(360);
  shot('08_hud_combat');
  const b = bench();
  console.log('  战斗统计: hits峰值=' + peakHits + ' 断肢峰值=' + peakLb + ' 波次峰值=' + maxWaveSeen + ' hp=' + dbg().hp);
  check('全程持续命中', peakHits > 20, 'peakHits=' + peakHits);
  check('断肢多次发生', peakLb > 3, 'peakLb=' + peakLb);
}

console.log('');
if (failures){ console.error('✘ 视觉自测未通过: ' + failures + ' 项'); process.exit(1); }
console.log('✔ 视觉自测全部通过');
