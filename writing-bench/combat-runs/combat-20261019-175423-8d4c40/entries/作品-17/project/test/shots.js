/* 截图工具：用软件光栅化器渲染真实游戏帧到 PNG */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Raster } = require('./raster');

function boot() {
  const raster = new Raster(1280, 720);
  const listeners = { window: {}, canvas: {}, document: {}, muteBtn: {} };
  const addL = s => (t, f) => { (s[t] = s[t] || []).push(f); };
  const fire = (s, t, e) => (s[t] || []).forEach(f => f(e));
  const canvasEl = { width: 1280, height: 720, style: {}, getContext: () => raster, addEventListener: addL(listeners.canvas) };
  let rafCb = null;
  const clock = { now: 0 };
  const windowObj = { innerWidth: 1280, innerHeight: 720, addEventListener: addL(listeners.window) };
  const sandbox = {
    window: windowObj,
    document: { getElementById: id => id === 'game' ? canvasEl : { addEventListener: addL(listeners.muteBtn) }, addEventListener: addL(listeners.document), hidden: false },
    performance: { now: () => clock.now },
    requestAnimationFrame: cb => { rafCb = cb; },
    console,
  };
  vm.createContext(sandbox);
  const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], sandbox, { filename: 'bundle.js' });

  return {
    game: windowObj.__game,
    raster,
    frames(n) {
      for (let i = 0; i < n; i++) {
        clock.now += 16.67;
        const cb = rafCb; rafCb = null;
        cb(clock.now);
      }
    },
    key(c, t) { fire(listeners.window, t, { code: c, repeat: false, preventDefault() {} }); },
    tap(c, h = 4) { this.key(c, 'keydown'); this.frames(h); this.key(c, 'keyup'); this.frames(2); },
    snap(name) {
      const out = path.join(__dirname, 'shots', name + '.png');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, raster.toPNG());
      console.log('saved', out);
    },
  };
}

module.exports = { boot };

// 直接运行：生成一组关键画面
if (require.main === module) {
  const app = boot();
  const { game } = app;

  app.frames(30);
  app.snap('01-title');

  app.tap('Enter');
  app.frames(100); // 敌人落地
  app.snap('02-wave-start');

  // 把敌人拉到玩家面前，打一整套
  const g = game;
  const e = g.enemies[0];
  g.player.x = 900; g.player.y = 600;
  g.enemies.forEach((en, i) => { en.x = 830 + i * 130; en.y = 600; en.state = 'chase'; en.vx = 0; });

  app.key('KeyJ', 'keydown'); app.frames(6); // atk1 激活中
  app.snap('03-atk1-active');
  app.key('KeyJ', 'keyup'); app.frames(3);

  // 连击
  app.key('KeyJ', 'keydown'); app.frames(5); app.snap('04-atk2'); app.key('KeyJ', 'keyup'); app.frames(4);
  app.key('KeyJ', 'keydown'); app.frames(8); app.snap('05-atk3'); app.key('KeyJ', 'keyup'); app.frames(10);

  // 蓄力斩（满蓄力释放瞬间）
  app.key('KeyK', 'keydown'); app.frames(30); app.snap('06-charging'); app.frames(15);
  app.key('KeyK', 'keyup'); app.frames(6); app.snap('07-charged-release');

  // 冲刺
  app.tap('KeyL', 3); app.snap('08-dash');
  app.frames(20);

  // 挑空 + 空连
  app.tap('KeyI', 3); app.frames(6); app.snap('09-launcher');
  app.key('KeyJ', 'keydown'); app.frames(6); app.snap('10-air-combo'); app.key('KeyJ', 'keyup');
  app.frames(30);

  // 死亡画面
  g.player.hp = 1;
  g.player.takeHit(50, 1, 300, 200, g);
  app.frames(80);
  app.snap('11-death');
  console.log('done');
}
