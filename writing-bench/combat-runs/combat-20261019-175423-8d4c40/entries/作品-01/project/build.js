#!/usr/bin/env node
/* Build: concatenate src modules into one self-contained offline game.html */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'game.html');

const order = ['util.js', 'audio.js', 'fx.js', 'player.js', 'enemy.js', 'world.js', 'render.js', 'hud.js', 'main.js'];

let js = '';
for (const f of order) {
  const p = path.join(SRC, f);
  if (!fs.existsSync(p)) { console.error('missing', f); process.exit(1); }
  js += '\n/* ===== ' + f + ' ===== */\n' + fs.readFileSync(p, 'utf8') + '\n';
}

const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>绯月 · 断刃 — 横版斩击试炼</title>
<style>
${css}
</style>
</head>
<body>
<div id="app">
  <canvas id="stage" width="960" height="540" aria-label="绯月断刃 战斗场景"></canvas>
  <div id="overlay">
    <div id="titlePanel">
      <div class="kanji">绯月 <span>·</span> 断刃</div>
      <div class="sub">CRIMSON MOON · BROKEN BLADE</div>
      <div class="rule"></div>
      <div class="prompt">按 <b>Enter</b> 或 点击画面 开始</div>
      <div class="controls-title">操 作</div>
      <div class="keys">
        <div><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd><span>移动</span></div>
        <div><kbd>Space</kbd><span>跳跃</span></div>
        <div><kbd>J</kbd><span>轻斩 · 四段连击，四段挑空</span></div>
        <div><kbd>K</kbd><span>按住蓄力 · 重斩，破肢体</span></div>
        <div><kbd>L</kbd><span>瞬步闪避（带无敌帧）</span></div>
        <div><kbd>I</kbd><span>弹反 · 精准架开</span></div>
        <div><kbd>R</kbd><span>重新开始</span></div>
        <div><kbd>1</kbd><span>月轮斩 · 360° 刀轮</span></div>
        <div><kbd>2</kbd><span>影袭 · 瞬身斩痕引爆</span></div>
        <div><kbd>3</kbd><span>刃雨 · 灵刃天降</span></div>
        <div><kbd>4</kbd><span>千刃一闪 · 终式</span></div>
      </div>
      <div class="tip">挑空后跳起追击 · 空中按 K 下劈 · 弹反红玉 · 技能 1-4 有冷却，随时可用</div>
    </div>
    <div id="deathPanel" class="hidden">
      <div class="dead-title">败 北</div>
      <div class="dead-sub">斩击已尽，绯月未落</div>
      <div class="dead-prompt">按 <b>R</b> 或 <b>Enter</b> 重新踏阵</div>
    </div>
  </div>
  <button id="muteBtn" title="静音 / 取消静音">♪ 音效 开</button>
</div>
<script>
(function(){
"use strict";
${js}
})();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log('built', OUT, (html.length / 1024).toFixed(1) + ' KB');
