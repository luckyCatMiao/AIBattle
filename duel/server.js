'use strict';
/* 无尽弹墙对决 · HTTP 服务。
 * 网页上的本地对战（人 vs 练习电脑）与回放归档共用这一个进程，只监听本机。 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sim = require('./simulation');
const { rules } = require('./catalog');
const { handleArena } = require('./arena/http');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function createServer() {
  const matches = new Map();

  function createLocal(seed) {
    const id = crypto.randomBytes(8).toString('hex');
    const game = sim.createMatch({ id, seed: seed ?? (Date.now() % 100000), players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }] });
    matches.set(id, { game, createdAt: Date.now(), lastInput: { dir: 'N', aim: null, fire: false } });
    if (matches.size > 40) {
      const oldest = [...matches.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) matches.delete(oldest[0]);
    }
    return { id, state: sim.snapshot(game, 0) };
  }

  function stepOne(entry, humanInput) {
    const g = entry.game;
    if (g.status !== 'playing') return;
    // 人类这一帧的输入 + 练习电脑的输入，一起推进 1 个物理帧。
    const human = sim.normalizeInput(humanInput || {});
    const botInput = sim.bot(g, 1);
    for (let owner = 0; owner < 2; owner++) {
      const p = g.players[owner];
      const f = owner === 0 ? human : botInput;
      p.held = f;
      p.inputHistory.push(f);
      if (p.inputHistory.length > 8) p.inputHistory.shift();
    }
    sim.step(g);
  }

  const json = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (handleArena(req, res, url)) return;

      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, game: 'duel', version: 1 });
      if (req.method === 'GET' && url.pathname === '/api/catalog') return json(res, 200, { rules });

      if (req.method === 'POST' && url.pathname === '/api/matches') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const b = body ? JSON.parse(body) : {};
        return json(res, 200, createLocal(b.seed));
      }

      if (req.method === 'POST' && url.pathname === '/api/input') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const b = JSON.parse(body || '{}');
        const entry = matches.get(b.match);
        if (!entry) return json(res, 404, { error: '对局不存在或已过期' });
        if (entry.game.status === 'playing') {
          if (b.input) entry.lastInput = b.input;
          stepOne(entry, entry.lastInput);
        }
        return json(res, 200, sim.snapshot(entry.game, 0));
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        const entry = matches.get(url.searchParams.get('match'));
        if (!entry) return json(res, 404, { error: '对局不存在或已过期' });
        return json(res, 200, sim.snapshot(entry.game, 0));
      }

      // 静态文件
      let rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      json(res, 500, { error: String(e && e.message || e) });
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.DUEL_PORT || 8817);
  createServer().listen(port, '127.0.0.1', () => console.log(`AIBattle Duel: http://127.0.0.1:${port}`));
}
module.exports = { createServer };
