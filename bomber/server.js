'use strict';
/* 泡泡堂 / BLAST BUDDIES — HTTP 服务。
 * 网页、练习电脑与外部程序选手共用同一套规则；本服务只监听本机。
 * 除回放归档（只读）外，任何写操作都需要席位凭据。 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sim = require('./simulation');
const { rules, powerups } = require('./catalog');
const { handleArena } = require('./arena/http');

function createServer() {
  const sessions = new Map(), tokens = new Map();
  const id = () => crypto.randomBytes(12).toString('hex');
  const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  async function body(req) {
    let text = '';
    for await (const part of req) { text += part; if (text.length > 200000) throw Error('请求体过大'); }
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
  const observation = (s, owner) => ({
    ...sim.snapshot(s.game, owner),
    mode: s.mode,
    lastWindow: s.lastWindow || null,
    waiting: s.game.status === 'playing'
      ? s.game.players.filter(p => p.kind !== 'bot' && !s.pending.has(p.id)).map(p => p.id)
      : [],
  });

  // 所有席位到齐后一次性结算：先补齐电脑席位，再让裁判推进整个窗口。
  function commitWindow(s, note) {
    for (const p of s.game.players) if (p.kind === 'bot' && !s.pending.has(p.id)) s.pending.set(p.id, sim.bot(s.game, p));
    const frame = s.game.roundFrames;
    const answers = s.game.players.map(p => s.pending.get(p.id));
    s.pending.clear();
    sim.advanceWindow(s.game, answers);
    s.lastWindow = { frame, note: String(note || '').slice(0, 500), advanced: s.game.roundFrames - frame };
  }

  const server = http.createServer(async (req, res) => { try {
    const url = new URL(req.url, 'http://127.0.0.1'), parts = url.pathname.split('/').filter(Boolean);
    if (handleArena(req, res, url)) return;
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: '跨站请求被拒绝' });
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, game: 'bomber', version: 1 });
    if (req.method === 'GET' && url.pathname === '/api/catalog') return json(res, 200, { rules, powerups });

    if (req.method === 'POST' && url.pathname === '/api/matches') {
      const b = await body(req);
      let players = b.players;
      if (!players) players = [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }];
      if (!Array.isArray(players) || players.length < rules.minPlayers || players.length > rules.maxPlayers) {
        throw Error(`泡泡堂对战需要 ${rules.minPlayers}–${rules.maxPlayers} 名选手`);
      }
      if (players.some(p => !p || typeof p.name !== 'string' || !['human', 'api', 'bot'].includes(p.kind))) {
        throw Error(`请提供 ${rules.minPlayers}–${rules.maxPlayers} 名有效选手`);
      }
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
      const s = { game, mode, pending: new Map(), touched: Date.now(), inputs: new Map() };
      sessions.set(key, s);
      const seats = game.players.filter(p => p.kind !== 'bot').map(p => {
        const token = crypto.randomBytes(24).toString('hex');
        tokens.set(token, { match: key, player: p.id, bucket: 0, last: Date.now() });
        return { player: p.id, token };
      });
      return json(res, 201, { match: key, seats, state: observation(s, seats[0]?.player ?? null) });
    }

    if (parts[0] === 'api' && parts[1] === 'matches' && parts[2]) {
      const s = sessions.get(parts[2]);
      if (!s) return json(res, 404, { error: '对局不存在；重启服务后请新建' });
      s.touched = Date.now();

      if (req.method === 'GET' && parts.length === 3) return json(res, 200, observation(s, req.headers.authorization ? auth(req, parts[2]).player : null));

      // 同步决策窗口：双方各提交 20 帧输入。
      if (req.method === 'POST' && parts[3] === 'decisions') {
        const seat = auth(req, parts[2]), b = await body(req);
        if (s.game.status !== 'playing') throw Error('对局已结束');
        if (s.mode === 'local') throw Error('真人练习局请使用 /step');
        if (s.pending.has(seat.player)) return json(res, 409, { error: '该席位已提交本窗口' });
        const inputs = b.inputs ?? b.frames;
        if (!Array.isArray(inputs) || inputs.length > rules.decisionFrames) throw Error(`一个决策窗口最多 ${rules.decisionFrames} 帧输入`);
        s.pending.set(seat.player, sim.submitWindow(s.game, seat.player, inputs));
        const need = s.game.players.filter(p => p.kind !== 'bot' && !s.pending.has(p.id));
        if (!need.length) commitWindow(s, b.note);
        return json(res, 200, { accepted: true, frame: s.game.roundFrames, round: s.game.round, waiting: need.map(p => p.id), status: s.game.status, winner: s.game.winner });
      }

      // 真人练习局：客户端按 60 fps 渲染、按固定节拍提交输入，服务端用实时时钟推进。
      if (req.method === 'POST' && parts[3] === 'step') {
        const seat = auth(req, parts[2]), b = await body(req);
        if (s.game.status !== 'playing') throw Error('对局已结束');
        if (s.mode !== 'local') throw Error('仅真人练习局接受逐帧输入');
        const f = s.game.fighters[seat.player];
        if (!f || !f.alive) throw Error('该席位当前没有在场角色');
        // 只保留最新一条：实时推进下，迟到的输入没有意义。
        s.inputs.set(seat.player, sim.normalizeInput(b.input || { dir: 'N', btn: null }));
        s.touched = Date.now();
        return json(res, 200, { accepted: true, frame: s.game.roundFrames });
      }
      if (req.method === 'GET' && parts[3] === 'catalog') return json(res, 200, { rules, powerups });
    }

    const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && files[url.pathname]) {
      const [name, mime] = files[url.pathname], file = path.join(__dirname, 'public', name);
      if (!fs.existsSync(file)) return json(res, 404, { error: '页面资源尚未就绪' });
      res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(file));
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) { json(res, e.status || 400, { error: e.message }); } });

  // 真人练习局由实时时钟以 20 Hz 推进。外部程序对战走 lockstep，不经过这个时钟。
  let last = performance.now(), acc = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    acc += Math.min((now - last) / 1000, 0.2);
    last = now;
    while (acc >= sim.DT) {
      for (const s of sessions.values()) {
        if (s.mode !== 'local' || s.game.status !== 'playing') continue;
        if (Date.now() - (s.touched || 0) > 30000) continue;   // 无人操作就停住，不空转
        const inputs = s.game.players.map(() => null);
        for (const p of s.game.players) {
          inputs[p.id] = p.kind === 'bot'
            ? sim.bot(s.game, p)[0]
            : (s.inputs.get(p.id) || { dir: 'N', btn: null });
        }
        advanceLocal(s, inputs);
      }
      acc -= sim.DT;
    }
  }, 25);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return server;
}

// 本地模式单帧推进：双方各一条输入。
function advanceLocal(s, inputs) {
  for (let owner = 0; owner < s.game.players.length; owner++) {
    const f = s.game.fighters[owner];
    if (!f || !f.alive) continue;
    const raw = inputs[owner];
    f.inputHistory.push(raw ? raw : { dir: 'N', btn: null });
    if (f.inputHistory.length > 8) f.inputHistory.shift();
    f.held = raw || { dir: 'N', btn: null };
  }
  sim.step(s.game);
}

if (require.main === module) {
  const port = Number(process.env.BOMB_PORT || 8797);
  createServer().listen(port, '127.0.0.1', () => console.log(`AIBattle Blast Buddies: http://127.0.0.1:${port}`));
}
module.exports = { createServer };
