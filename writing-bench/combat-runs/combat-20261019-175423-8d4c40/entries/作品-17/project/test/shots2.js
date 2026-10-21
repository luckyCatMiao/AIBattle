/* 截图：Brute/Leaper/断肢碎片特写 */
'use strict';
const { boot } = require('./shots');
const app = boot();
const g = app.game;

app.frames(5);
app.tap('Enter');
app.frames(80);

const Puppet = g.enemies[0].constructor;
g.enemies.length = 0;
const brute = new Puppet(g, 1020, 'brute');
const leaper = new Puppet(g, 1160, 'leaper');
const sword = new Puppet(g, 860, 'swordsman');
for (const e of [brute, leaper, sword]) { e.y = 600; e.state = 'chase'; e.vy = 0; }
g.enemies.push(brute, leaper, sword);
g.player.x = 950; g.player.y = 600; g.player.facing = 1;
g.camX = 1000;

app.frames(3);
app.snap('20-enemy-types');

// Brute 前兆（举锤 + 闪光）
brute.state = 'windup'; brute.stateT = brute.cfg.windup - 0.06;
app.frames(1);
app.snap('21-brute-windup');

// 满蓄力重斩打在 Brute 身上 → 断肢飞溅
g.player.x = 940; g.player.facing = 1;
g.player.state = 'idle'; g.player.currentAtk = null;
app.key('KeyK', 'keydown');
app.frames(45); // 蓄满
app.key('KeyK', 'keyup');
app.frames(5); // 释放动作中，命中发生
app.snap('22-charged-hit-brute');
app.frames(3);
app.snap('23-limb-debris');
app.frames(12);
app.snap('24-debris-settle');

// Leaper 扑击旋转
leaper.state = 'windup'; leaper.stateT = 0;
app.frames(30); // 蓄力完成跳跃
leaper.state = 'leap'; leaper.stateT = 0.15; leaper.vy = -400; leaper.y = 480; leaper.leapVx = -200;
app.frames(2);
app.snap('25-leaper-spin');

console.log('done2');
