'use strict';
/* 弹幕决斗 回放归档 —— 只读。
 * 结构与其余游戏一致，网页上的回放播放器复用同一套读取流程。
 * 任何非 GET 请求返回 405；所有 run / game 路径先过正则，杜绝路径穿越。
 *
 * 存档每 20 个物理帧才记一个快照（1 秒）。播放时用种子与逐窗口输入
 * 在服务端按 20 Hz 重演，得到逐物理帧的位置，避免「每秒端点插值」造成的抽搐。 */
/* 爆破模式 回放归档 —— 只读。
 * 存档本身就是逐物理帧快照（frameMs=50），直接回放，不需要重建。
 * 任何非 GET 请求返回 405；所有 run / game 路径先过正则，杜绝路径穿越。 */
const fs = require('node:fs'), path = require('node:path');

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
module.exports = { handleArena };
