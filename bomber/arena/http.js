'use strict';
/* 泡泡堂 回放归档 —— 只读。
 * 结构与其余游戏一致，网页上的回放播放器复用同一套读取流程。
 * 任何非 GET 请求返回 405；所有 run / game 路径先过正则，杜绝路径穿越。
 *
 * 存档每 20 个物理帧才记一个快照（1 秒）。播放时用种子与逐窗口输入
 * 在服务端按 20 Hz 重演，得到逐物理帧的位置，避免「每秒端点插值」造成的抽搐。 */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const sim = require('../simulation');
const FULL_CACHE = new Map();
const FULL_CACHE_LIMIT = 12;

// 用存档里的 seeds/names/windows 重建逐物理帧快照。与裁判使用同一份 simulation.js。
function reconstructFrames(record) {
  if (!Array.isArray(record.windows)) return null;
  const names = Array.isArray(record.names) && record.names.length ? record.names : ['A', 'B'];
  const game = sim.createMatch({
    id: record.id, seed: record.seed,
    players: names.map(name => ({ name: String(name), kind: 'api' })),
  });
  const frames = [structuredClone(sim.snapshot(game))];
  const neutral = { dir: 'N', btn: null };
  for (const window of record.windows) {
    const inputs = window.inputs || [];
    for (let i = 0; i < sim.rules.decisionFrames && game.status === 'playing'; i++) {
      for (let owner = 0; owner < game.players.length; owner++) {
        const fighter = game.fighters[owner];
        if (!fighter || !fighter.alive) continue;
        const frame = inputs[owner] && inputs[owner][i] ? inputs[owner][i] : neutral;
        fighter.inputHistory.push(frame);
        if (fighter.inputHistory.length > 8) fighter.inputHistory.shift();
        fighter.held = frame;
      }
      sim.step(game);
      // roundLog 等数组在 snapshot 里是活引用，必须深拷贝，否则早帧会被后续回合改写。
      frames.push(structuredClone(sim.snapshot(game)));
    }
  }
  // 起点必须逐字段一致；非技术中断的对局，终点也必须一致。
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (record.frames && record.frames[0] && !same(frames[0], record.frames[0])) {
    const a = JSON.stringify(frames[0]), b = JSON.stringify(record.frames[0]);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    throw Error(`回放重建的起始快照与存档不一致（第 ${i} 字节：${a.slice(Math.max(0, i - 30), i + 60)} | ${b.slice(Math.max(0, i - 30), i + 60)}）`);
  }
  if (!record.technicalFailure && record.final && !same(frames[frames.length - 1], record.final)) {
    throw Error('回放重建的终局快照与存档不一致');
  }
  return frames;
}

function fullReplay(file, record) {
  const key = file + ':' + (fs.statSync(file).mtimeMs || 0);
  if (FULL_CACHE.has(key)) return FULL_CACHE.get(key);
  const frames = reconstructFrames(record);
  if (!frames) return null;
  const body = zlib.gzipSync(Buffer.from(JSON.stringify({
    ...record, frames, frameMs: Math.round(1000 / sim.rules.hz), reconstructed: true,
  }), 'utf-8'));
  if (FULL_CACHE.size >= FULL_CACHE_LIMIT) FULL_CACHE.delete(FULL_CACHE.keys().next().value);
  FULL_CACHE.set(key, body);
  return body;
}

function handleArena(req, res, url, control = path.join(__dirname, 'control')) {
  if (!url.pathname.startsWith('/api/arena')) return false;
  const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  if (req.method !== 'GET') { json(405, { error: '回放归档是只读的' }); return true; }

  if (url.pathname === '/api/arena/runs') {
    let activeRun = null;
    try { activeRun = JSON.parse(fs.readFileSync(path.join(control, 'status.json'), 'utf8')).run; } catch {}
    const runs = [];
    if (fs.existsSync(control)) for (const dir of fs.readdirSync(control, { withFileTypes: true })) {
      if (!dir.isDirectory() || !/^run-\d{8}-\d{6}$/.test(dir.name)) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(control, dir.name, 'status.json'), 'utf8'));
        runs.push({ run: dir.name, models: s.models, labels: s.labels, phase: s.phase, completed: s.completed, updated: s.updated, games: (s.games || []).length, setup_note: s.setup_note });
      } catch {}
    }
    runs.sort((a, b) => b.run.localeCompare(a.run));
    json(200, { activeRun, runs });
    return true;
  }

  let state;
  const selected = url.searchParams.get('run');
  if (selected && !/^run-\d{8}-\d{6}$/.test(selected)) { json(400, { error: '无效的比赛系列' }); return true; }
  try { state = JSON.parse(fs.readFileSync(path.join(control, ...(selected ? [selected, 'status.json'] : ['status.json'])), 'utf8')); }
  catch {
    if (selected) { json(404, { error: '比赛系列不存在' }); return true; }
    state = { phase: '等待比赛开始', models: {}, reasoning_effort: 'medium', games: [], results: [], ready: [], completed: false };
  }
  if (url.pathname === '/api/arena') { json(200, state); return true; }
  if (!/^run-\d{8}-\d{6}$/.test(state.run || '')) { json(404, { error: '回放尚未生成' }); return true; }

  const run = path.join(control, state.run), parts = url.pathname.split('/');
  if (parts[3] === 'games' && parts.length === 5 && /^r\d+-g\d+$/.test(parts[4]) && (state.games || []).some(g => g.id === parts[4])) {
    const file = path.join(run, parts[4] + '.json.gz');
    if (!fs.existsSync(file)) { json(404, { error: '回放尚未保存' }); return true; }
    // full=1：用种子与逐窗口输入重演，返回 20 Hz 的逐物理帧快照。
    if (url.searchParams.get('full') === '1') {
      try {
        const record = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
        const body = fullReplay(file, record);
        if (!body) { json(404, { error: '该回放没有可重建的逐帧输入' }); return true; }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Encoding': 'gzip', 'Content-Length': body.length, 'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch (error) {
        json(500, { error: '逐帧回放重建失败：' + error.message });
      }
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return true;
  }
  if (parts[3] === 'reviews' && parts.length === 5 && Object.hasOwn(state.models || {}, parts[4])) {
    const who = parts[4], post = path.join(run, `postmatch-${who}.md`), sections = [];
    for (let round = 1; round <= (state.round || 1); round++) {
      const file = path.join(run, `round-${round}`, who, 'review.md');
      if (fs.existsSync(file)) sections.push(`## 第 ${round} 轮 · 复盘与策略迭代\n\n` + fs.readFileSync(file, 'utf8'));
    }
    if (!sections.length && !fs.existsSync(post)) { json(404, { error: '选手尚未提交中文说明' }); return true; }
    let text = `# ${state.models[who]} · 策略自述\n\n以下由参赛模型自行撰写，不代表裁判认可全部判断。\n\n` + sections.join('\n\n---\n\n');
    if (fs.existsSync(post)) text += '\n\n---\n\n# 赛后复盘\n\n' + fs.readFileSync(post, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
    return true;
  }
  json(404, { error: '回放资源不存在' });
  return true;
}
module.exports = { handleArena, reconstructFrames };
