#!/usr/bin/env node
/* ============================================================
   构建脚本：将 src/ 下按序拼接的源码打包为单文件 game.html
   用法: node build.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'game.html');

const FILES = fs.readdirSync(SRC_DIR)
  .filter(f => f.endsWith('.js'))
  .sort();

let bundle = '';
for (const f of FILES){
  const code = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
  bundle += '\n/* ===== ' + f + ' ===== */\n' + code + '\n';
}

// 校验拼接体语法（去掉 IIFE 包装后直接检查整体）
{
  const wrapped = '(function(){\n' + bundle + '\n})();';
  new Function(wrapped.replace(/^'use strict';/m, ''));
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="color-scheme" content="dark">
<title>斩骸夜行 · 木偶讨伐试炼</title>
<style>
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #05060c; }
canvas { display: block; width: 100vw; height: 100vh; outline: none; touch-action: none; }
#muteBtn {
  position: fixed; top: 10px; right: 12px; z-index: 10;
  background: rgba(10,12,24,0.72); color: #cfd4ea;
  border: 1px solid rgba(160,170,210,0.35); border-radius: 999px;
  font: 12px/1 "Songti SC","STSong","SimSun",Georgia,serif;
  padding: 7px 14px; cursor: pointer; letter-spacing: 2px;
  user-select: none; -webkit-user-select: none;
}
#muteBtn:hover { background: rgba(30,34,58,0.88); }
</style>
</head>
<body>
<canvas id="game"></canvas>
<button id="muteBtn" title="切换音效">音效 开</button>
<script>
${bundle}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('打包完成: ' + OUT + '  (' + kb + ' KB, 源文件: ' + FILES.join(', ') + ')');
