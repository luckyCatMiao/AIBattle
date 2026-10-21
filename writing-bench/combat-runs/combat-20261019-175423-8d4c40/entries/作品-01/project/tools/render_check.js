/* Render real PNG frames using @napi-rs/canvas to inspect visuals without a browser. */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('/tmp/cv/node_modules/@napi-rs/canvas');
const vm = require('vm');

const html = fs.readFileSync('/workspace/game.html', 'utf8');
let js = html.match(/<script>([\s\S]*)<\/script>/)[1];
js = js.replace('  requestAnimationFrame(frame);\n})();',
  '  window.__debug = { world: world, input: input, startGame: startGame, restartGame: restartGame, drawWorld: drawWorld, drawHUD: drawHUD, drawStartHint: drawStartHint };\n  requestAnimationFrame(frame);\n})();');

const W = 960, H = 540;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

function el(extra) {
  return Object.assign({
    style: {}, textContent: '', width: W, height: H,
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H }; },
    getContext() { return ctx; }, focus() {}, blur() {}
  }, extra || {});
}
const els = { stage: el(), app: el(), muteBtn: el(), deathPanel: el(), titlePanel: el() };
const winL = {}, docL = {};
global.window = {
  addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); }, removeEventListener() {},
  devicePixelRatio: 1, innerWidth: W, innerHeight: H,
  AudioContext: undefined, webkitAudioContext: undefined
};
global.document = {
  getElementById(id) { return els[id] || el(); },
  addEventListener(t, f) { (docL[t] = docL[t] || []).push(f); },
  hidden: false, documentElement: el()
};
let TIME = 0;
global.performance = { now: () => TIME };
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
vm.runInThisContext(js, { filename: 'bundle.js' });
const D = global.window.__debug;
const w = D.world;

function save(name) {
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#07040a'; ctx.fillRect(0,0,canvas.width,canvas.height);
  D.drawWorld(ctx, w);
  if (w.playing) { D.drawHUD(ctx, w); }
  fs.writeFileSync('/tmp/shots/' + name + '.png', canvas.toBuffer('image/png'));
}
function frame(dtMs) { TIME += dtMs; w.update(1 / 120); }

// 1 title
w.time = 2; w.playing = false; save('r01_title');
// 2 start
D.startGame();
for (let i = 0; i < 420; i++) frame(16);
save('r02_wave1');
// 3 fight: move player next to an enemy, light combo mid-swing
const e = w.enemies.find(x => !x.dead);
if (e) {
  w.player.x = e.x - 76; w.player.facing = 1;
  w.player.tryAttack('L1', false);
  for (let i = 0; i < 7; i++) frame(16);
  save('r03_light_hit');
  // heavy charged mid-swing
  w.player.x = e.x - 80; w.player.facing = 1;
  w.player.charging = false; w.player.chargeT = 0;
  w.player.lastChargeLevel = 3;
  w.player.tryAttack('H3', true);
  for (let i = 0; i < 16; i++) frame(16);
  save('r04_heavy_hit');
  // sever shockwave moment
  for (let i = 0; i < 12; i++) frame(16);
  save('r05_sever');
}
// 4 telegraph
const e2 = w.enemies.find(x => !x.dead);
if (e2) {
  w.player.x = e2.x - 90; w.player.facing = 1;
  e2.startAttack(e2.typeKey === 'samurai' ? 'samuraiChop' : 'gnawClaw');
  for (let i = 0; i < 16; i++) frame(16);
  save('r06_telegraph');
}
// 5 player charging + dash trail
w.player.x = 600; w.player.facing = 1; w.player.charging = true; w.player.chargeT = 1.25;
save('r07_charge');
w.player.charging = false;
w.spawnEnemy('samurai', 1); w.spawnEnemy('puppet', 1);
for (let i = 0; i < 10; i++) frame(16);
save('r08_mixed_wave');
console.log('rendered frames to /tmp/shots');
