'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createGame, place, ascii } = require('./game');
const ROOT = __dirname;
const DATA = process.env.AIBATTLE_DATA || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8787);
fs.mkdirSync(DATA, { recursive: true });
const stateFile = path.join(DATA, 'state.json');
let db = { games: [], tournaments: [], credentials: {}, revision: 0 };
if (fs.existsSync(stateFile)) db = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const uid = () => crypto.randomBytes(8).toString('hex');
function save() {
  db.revision++;
  const tmp = stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, stateFile);
}
function credential(playerId, scope, scopeId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.credentials[token] = { playerId, scope, scopeId };
  return token;
}
function standings(t) {
  return t.players.map(p => {
    const gs = db.games.filter(g => g.tournamentId === t.id && g.status === 'finished');
    const wins = gs.filter(g => g.winner === p.id).length;
    const draws = gs.filter(g => !g.winner).length;
    return { ...p, played: gs.length, wins, losses: gs.length - wins - draws, draws,
      blackWins: gs.filter(g => g.black.id === p.id && g.winner === p.id).length,
      whiteWins: gs.filter(g => g.white.id === p.id && g.winner === p.id).length,
      score: wins + draws * 0.5, winRate: gs.length ? wins / gs.length : null };
  });
}
function publicTournament(t) { return { ...t, standings: standings(t) }; }
function startRound(t) {
  const round = t.gameIds.length + 1;
  const swap = (round - 1) % 2;
  const game = createGame({ id: uid(), black: t.players[swap], white: t.players[1 - swap], tournamentId: t.id, round });
  t.gameIds.push(game.id); t.currentGameId = game.id; db.games.push(game);
}
function finishGame(game) {
  fs.writeFileSync(path.join(DATA, `game-${game.id}.json`), JSON.stringify(game, null, 2));
  if (!game.tournamentId) return;
  const t = db.tournaments.find(t => t.id === game.tournamentId);
  if (t.gameIds.length < t.rounds) startRound(t);
  else {
    t.status = 'finished'; t.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(DATA, `tournament-${t.id}.json`), JSON.stringify({
      ...publicTournament(t), games: db.games.filter(g => g.tournamentId === t.id),
      protocol: '15x15 freestyle; >=5 wins; no forbidden moves; empty board; alternating colors; open strategy: direct reasoning, authored programs, or hybrids allowed equally; transport helper does no analysis; repeated games from one agent session are not independent model trials',
    }, null, 2));
  }
}
function auth(token) {
  const c = typeof token === 'string' && Object.hasOwn(db.credentials, token) ? db.credentials[token] : null;
  if (!c) throw Object.assign(new Error('无效的玩家凭据'), { status: 401 });
  return c;
}
function agentState(c) {
  const t = c.scope === 'tournament' ? db.tournaments.find(t => t.id === c.scopeId) : null;
  const g = db.games.find(g => g.id === (t ? t.currentGameId : c.scopeId));
  if (!g) throw new Error('对局不存在');
  const current = g.turn === 1 ? g.black.id : g.white.id;
  return {
    playerId: c.playerId, matchId: g.id, round: g.round, tournamentId: t?.id || null,
    seriesStatus: t?.status || null, rounds: t?.rounds || 1,
    standings: t ? standings(t) : null,
    status: g.status, yourColor: g.black.id === c.playerId ? 'black' : 'white',
    yourSymbol: g.black.id === c.playerId ? 'X' : 'O',
    yourTurn: g.status === 'playing' && current === c.playerId,
    ply: g.moves.length, turn: g.turn === 1 ? 'black' : 'white', winner: g.winner,
    boardText: ascii(g), board: g.board, moves: g.moves,
    rules: 'Freestyle Gomoku. 15x15. Black starts. Five or more consecutive stones wins. No forbidden moves. x=0..14 maps A..O; y=0..14 maps rows 1..15 from top. X=black O=white. Choose your own strategy: direct reasoning, authored algorithms, or a hybrid. Only submit legal moves for your assigned player.',
  };
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16384) throw Object.assign(new Error('请求过大'), { status: 413 });
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw Object.assign(new Error('无效 JSON'), { status: 400 }); }
}
const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/training') {
      const file = path.join(ROOT, 'training', 'status.json');
      if (!fs.existsSync(file)) return send(200, null);
      try {
        const status = JSON.parse(fs.readFileSync(file, 'utf8'));
        const visible = ['at', 'event', 'iteration', 'cycles', 'player', 'game', 'ply', 'matchId', 'winner', 'plies'];
        return send(200, Object.fromEntries(visible.filter(key => key in status).map(key => [key, status[key]])));
      } catch { return send(200, null); }
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return send(200, {
      revision: db.revision,
      games: db.games.map(g => ({ id: g.id, black: g.black, white: g.white, status: g.status, round: g.round, tournamentId: g.tournamentId, winner: g.winner, ply: g.moves.length, createdAt: g.createdAt })),
      tournaments: db.tournaments.map(publicTournament),
    });
    if (req.method === 'GET' && url.pathname.startsWith('/api/games/')) {
      const g = db.games.find(g => g.id === url.pathname.split('/')[3]);
      return g ? send(200, g) : send(404, { error: '对局不存在' });
    }
    if (req.method === 'GET' && url.pathname === '/api/agent/state') {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      return send(200, agentState(auth(token)));
    }
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) return send(403, { error: '跨站请求被拒绝' });
      const b = await readJson(req);
      if (url.pathname === '/api/games') {
        const black = { id: uid(), name: String(b.black || '黑棋 · 真人').slice(0, 60), kind: 'human' };
        const white = { id: uid(), name: String(b.white || '白棋 · 真人').slice(0, 60), kind: 'human' };
        const game = createGame({ id: uid(), black, white }); db.games.push(game);
        const tokens = { black: credential(black.id, 'game', game.id), white: credential(white.id, 'game', game.id) };
        save(); return send(201, { game, tokens });
      }
      if (url.pathname === '/api/tournaments') {
        if (!Array.isArray(b.players) || b.players.length !== 2 || !b.players.every(p => typeof p.name === 'string' && p.name.trim())) throw new Error('请提供两名选手');
        if (!Number.isInteger(b.rounds) || b.rounds < 2 || b.rounds > 100 || b.rounds % 2) throw new Error('局数需为 2 到 100 的偶数，以便交换黑白');
        const t = { id: uid(), players: b.players.map(p => ({ id: uid(), name: p.name.slice(0, 60), kind: 'model' })),
          rounds: b.rounds, gameIds: [], status: 'playing', createdAt: new Date().toISOString(), finishedAt: null };
        db.tournaments.push(t); startRound(t);
        const credentials = t.players.map(p => ({ ...p, token: credential(p.id, 'tournament', t.id) }));
        save(); return send(201, { tournament: publicTournament(t), credentials });
      }
      if (url.pathname === '/api/move') {
        const c = auth(req.headers.authorization?.replace(/^Bearer /, ''));
        const g = db.games.find(g => g.id === b.matchId);
        if (!g) throw new Error('对局不存在');
        if (c.scope === 'game' && c.scopeId !== g.id) throw new Error('凭据不属于本局');
        if (c.scope === 'tournament') {
          const t = db.tournaments.find(t => t.id === c.scopeId);
          if (t.currentGameId !== g.id || t.id !== g.tournamentId) throw new Error('请读取当前比赛');
        }
        place(g, { playerId: c.playerId, x: b.x, y: b.y, ply: b.ply, note: b.note });
        if (g.status === 'finished') finishGame(g);
        save(); return send(200, { accepted: true, move: g.moves.at(-1), status: g.status, winner: g.winner });
      }
      return send(404, { error: '接口不存在' });
    }
    const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, mime] = files[url.pathname];
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(ROOT, 'public', file)));
    }
    send(404, { error: 'Not found' });
  } catch (e) { send(e.status || 400, { error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`AIBattle Gomoku: http://127.0.0.1:${PORT}`));
