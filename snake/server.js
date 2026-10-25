'use strict';
/* 贪吃蛇对战 — HTTP 服务。
 * 网页、本地练习与外部程序选手共用同一套规则；本服务只监听本机。 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sim = require('./simulation');
const { rules } = require('./catalog');
const { handleArena } = require('./arena/http');

function createServer() {
  const sessions = new Map(), tokens = new Map();
  const id = () => crypto.randomBytes(12).toString('hex');
  const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  async function body(req) {
    let text = '';
    for await (const part of req) { text += part; if (text.length > 400000) throw Error('请求体过大'); }
    const b = JSON.parse(text || '{}');
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error('请求体应为对象');
    return b;
  }
  function auth(req, match) {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const seat = tokens.get(token);
    if (!seat || seat.match !== match) throw Object.assign(Error('席位凭据无效'), { status: 401 });
    return seat;
  }

  const observation = (s, seat) => ({
    ...(seat == null ? sim.snapshot(s.game) : sim.view(s.game, seat.player)),
    mode: s.mode,
    waiting: s.game.players.filter(p => p.kind !== 'bot' && !s.pending.has(p.id)).map(p => p.id),
  });

  function botWindowInputs(s, team) {
    const frames = [];
    // 练习电脑按每个 tick 重新决策，提交时把它展开成逐帧方向。
    for (let i = 0; i < rules.decisionFrames; i++) {
      const snake = s.game.snakes[team];
      const dir = sim.botInput(s.game, snake).dir;
      frames.push([{ dir }]);
    }
    return frames;
  }

  function fillBotAnswer(s) {
    if (s.game.status !== 'playing') return;
    for (const p of s.game.players) {
      if (p.kind === 'bot' && !s.pending.has(p.id)) s.pending.set(p.id, sim.submitWindow(s.game, p.id, botWindowInputs(s, p.id)));
    }
  }

  function commitWindow(s, note) {
    fillBotAnswer(s);
    if (!s.pending.has(0) || !s.pending.has(1)) return false;
    const frame = s.game.frame;
    const answers = [s.pending.get(0), s.pending.get(1)];
    s.pending.clear();
    sim.advanceWindow(s.game, answers);
    s.lastWindow = { frame, note: String(note || '').slice(0, 500), advanced: s.game.frame - frame };
    return true;
  }

  const server = http.createServer(async (req, res) => { try {
    const url = new URL(req.url, 'http://127.0.0.1'), parts = url.pathname.split('/').filter(Boolean);
    if (handleArena(req, res, url)) return;
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: '跨站请求被拒绝' });
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, game: 'snake', version: 1 });
    if (req.method === 'GET' && url.pathname === '/api/catalog') return json(res, 200, { rules });

    if (req.method === 'POST' && url.pathname === '/api/matches') {
      const b = await body(req);
      let players = b.players;
      if (!players) players = [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }];
      if (!Array.isArray(players) || players.length !== 2) throw Error('贪吃蛇必须是两名选手');
      if (players.some(p => !p || typeof p.name !== 'string' || !['human', 'api', 'bot'].includes(p.kind))) throw Error('请提供 2 名有效选手');
      if (players[0].kind === 'bot') throw Error('房主必须是 human 或 api');
      const mode = b.mode ?? 'lockstep';
      if (!['lockstep', 'local'].includes(mode)) throw Error('mode 为 lockstep 或 local');
      if (sessions.size >= 16) {
        const old = [...sessions].find(([, s]) => s.game.status === 'finished');
        if (!old) return json(res, 409, { error: '对局房间已满，请结束旧对局或重启服务' });
        sessions.delete(old[0]);
        for (const [t, s] of tokens) if (s.match === old[0]) tokens.delete(t);
      }
      const key = id();
      const game = sim.createMatch({ id: key, players, seed: b.seed ?? 1 });
      const s = { game, mode, pending: new Map(), touched: Date.now(), inputs: new Map(), lastWindow: null };
      sessions.set(key, s);
      const seats = game.players.filter(p => p.kind !== 'bot').map(p => {
        const token = crypto.randomBytes(24).toString('hex');
        tokens.set(token, { match: key, player: p.id, bucket: 0, last: Date.now() });
        return { player: p.id, token };
      });
      return json(res, 201, { match: key, seats, state: observation(s, seats[0] ? { player: seats[0].player } : null) });
    }

    if (parts[0] === 'api' && parts[1] === 'matches' && parts[2]) {
      const s = sessions.get(parts[2]);
      if (!s) return json(res, 404, { error: '对局不存在；重启服务后请新建' });
      s.touched = Date.now();

      if (req.method === 'GET' && parts.length === 3) {
        const seat = req.headers.authorization ? auth(req, parts[2]) : null;
        return json(res, 200, observation(s, seat));
      }

      if (req.method === 'POST' && parts[3] === 'decisions') {
        const seat = auth(req, parts[2]), b = await body(req);
        if (s.game.status !== 'playing') throw Error('对局已结束');
        if (s.mode === 'local') throw Error('真人练习局请使用 /step');
        if (s.pending.has(seat.player)) return json(res, 409, { error: '该席位已提交本窗口' });
        const inputs = b.inputs ?? b.frames;
        if (!Array.isArray(inputs)) throw Error('inputs 必须是数组');
        s.pending.set(seat.player, sim.submitWindow(s.game, seat.player, inputs));
        if (!s.game.players.some(p => p.kind !== 'bot' && !s.pending.has(p.id))) commitWindow(s, b.note);
        return json(res, 200, {
          accepted: true, frame: s.game.frame, phase: s.game.phase,
          waiting: s.game.players.filter(p => p.kind !== 'bot' && !s.pending.has(p.id)).map(p => p.id),
          state: observation(s, seat),
        });
      }

      if (req.method === 'POST' && parts[3] === 'step') {
        const seat = auth(req, parts[2]), b = await body(req);
        if (s.game.status !== 'playing') throw Error('对局已结束');
        if (s.mode !== 'local') throw Error('仅真人练习局接受逐帧输入');
        if (seat.player !== 0) throw Error('本地对局只有 0 号席位可操作');
        s.inputs.set(0, sim.normalizeUnitInput(b.input || {}));
        return json(res, 200, { accepted: true, frame: s.game.frame });
      }
    }

    const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
    if (req.method === 'GET' && files[url.pathname]) {
      const [name, mime] = files[url.pathname], file = path.join(__dirname, 'public', name);
      if (!fs.existsSync(file)) return json(res, 404, { error: '页面资源尚未就绪' });
      res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(file));
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) { json(res, e.status || 400, { error: e.message }); } });

  // 本地对局：真实时钟 20 Hz。练习电脑每个 tick（4 帧）重新决策一次。
  let last = performance.now(), acc = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    acc += Math.min((now - last) / 1000, 0.2);
    last = now;
    while (acc >= sim.DT) {
      for (const s of sessions.values()) {
        if (s.mode !== 'local' || s.game.status !== 'playing') continue;
        if (Date.now() - (s.touched || 0) > 30000) continue;
        advanceLocal(s);
      }
      acc -= sim.DT;
    }
  }, 25);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return server;
}

const botWant = new WeakMap();
function advanceLocal(s) {
  const g = s.game;
  for (const snake of g.snakes) {
    if (snake.team === 0) {
      const input = s.inputs.get(0);
      if (input && input.dir) snake.wantDir = input.dir;
    } else {
      if (g.frame % rules.tickFrames === 0 || !botWant.has(snake)) botWant.set(snake, sim.botInput(g, snake).dir);
      const dir = botWant.get(snake);
      if (dir) snake.wantDir = dir;
    }
  }
  sim.step(g);
}

if (require.main === module) {
  const port = Number(process.env.SNAKE_PORT || 8811);
  createServer().listen(port, '127.0.0.1', () => console.log(`AIBattle Snake: http://127.0.0.1:${port}`));
}
module.exports = { createServer };
