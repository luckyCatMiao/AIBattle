#!/usr/bin/env node
// ============================================================================
// build.js — 将 src/ 下的源码打包为单个离线 game.html
// 用法：node build.js
// ============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'game.html');

const FILES = [
  'config.js',
  'util.js',
  'audio.js',
  'input.js',
  'effects.js',
  'entities.js',
  'render.js',
  'game.js',
  'main.js',
];

const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');

let js = '';
for (const f of FILES) {
  const p = path.join(SRC, f);
  const code = fs.readFileSync(p, 'utf8');
  js += '\n// ===================== ' + f + ' =====================\n' + code + '\n';
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>影刃 · 机关残响</title>
<style>
${css}
</style>
</head>
<body>
<div id="stage">
  <canvas id="game"></canvas>
  <button id="muteBtn" title="静音开关">🔊</button>

  <div id="overlay">
    <div id="menuPanel" class="panel">
      <h1 class="title">影刃 · <span class="accent">机关残响</span></h1>
      <p class="subtitle">横版动作战斗试玩 · 斩断傀儡的肢体</p>
      <div class="controls">
        <div class="ctrl"><span class="key">A / D</span><span class="desc">或 <b>← →</b> 移动</span></div>
        <div class="ctrl"><span class="key">Space</span><span class="desc"><b>跳跃</b>（可变高度）</span></div>
        <div class="ctrl"><span class="key">J</span><span class="desc"><b>轻斩</b> · 三段连击</span></div>
        <div class="ctrl"><span class="key">K</span><span class="desc"><b>重斩</b> · 长按蓄力</span></div>
        <div class="ctrl"><span class="key">L</span><span class="desc"><b>冲刺 / 闪避</b>（无敌帧）</span></div>
        <div class="ctrl"><span class="key">I</span><span class="desc"><b>挑空斩</b> · 打浮空起手</span></div>
        <div class="ctrl"><span class="key">空中 J / K</span><span class="desc"><b>空连斩 / 坠斩</b></span></div>
        <div class="ctrl"><span class="key">U</span><span class="desc"><b>一闪·居合</b> · 疾冲贯穿</span></div>
        <div class="ctrl"><span class="key">O</span><span class="desc"><b>影舞·分身斩</b> · 残影绞杀</span></div>
        <div class="ctrl"><span class="key">P</span><span class="desc"><b>雷葬·天罚</b> · 召雷轰击</span></div>
        <div class="ctrl"><span class="key">Q</span><span class="desc"><b>残响·时滞</b> · 冲击波+迟滞</span></div>
        <div class="ctrl"><span class="key">R</span><span class="desc"><b>重新开始</b> · <b>Enter</b> 开始</span></div>
      </div>
      <button id="startBtn" class="btn">Enter · 开始战斗</button>
      <p class="hint">鼠标仅用于开始与静音 · 首次点击或按键启用音效</p>
    </div>

    <div id="overPanel" class="panel hidden">
      <h1 class="gameover-title">败 北</h1>
      <p class="stats">本局命中 <b id="statHits">0</b> 次 · 斩断肢体 <b id="statLimbs">0</b> 个</p>
      <button id="againBtn" class="btn">R / Enter · 再来一局</button>
      <p class="hint">按 R 或 Enter 立即重开</p>
    </div>
  </div>
</div>

<script>
(function () {
'use strict';
${js}
})();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('build ok ->', OUT, '(' + (html.length / 1024).toFixed(1) + ' KB)');
