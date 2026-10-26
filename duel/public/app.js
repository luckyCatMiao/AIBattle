'use strict';
/* 无尽弹墙对决 · 前端
 * 两种模式：
 *   1) 本地对战：POST /api/input 每 50ms 推进一帧（输入由服务端与练习电脑合并）
 *   2) 回放：?replay=<gameId|latest>&run=<runName>，读 /api/arena/*
 */
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  const W = 40, H = 30;
  let TILE = canvas.width / W;
  const COLORS = ['#5aa9ff', '#ff9f5a'];

  const S = { match: null, state: null, last: null, keys: new Set(), aim: null, timer: null, busy: false };
  const R = { enabled: false, runs: [], run: null, meta: null, data: null, id: null, index: 0, playing: false, speed: 1, clock: 0, frameMs: 50, lastTs: 0 };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ==================== 渲染 ==================== */
  function draw(state) {
    if (!state) { ctx.fillStyle = '#070b0c'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    const ts = canvas.width / state.map.width;
    TILE = ts;
    ctx.fillStyle = '#070b0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 墙
    const tiles = state.map.tiles;
    ctx.fillStyle = '#1e2b2e';
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (tiles[y * state.map.width + x] !== 1) continue;
        ctx.fillRect(x * ts, y * ts, ts + 0.5, ts + 0.5);
      }
    }
    ctx.strokeStyle = '#2a3a3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

    // 球员
    for (const p of state.players || []) {
      const c = COLORS[p.index];
      const cx = p.x * ts, cy = p.y * ts, r = 0.45 * ts;
      if (!p.alive) {
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
        continue;
      }
      const cooling = p.cooldown > 0 ? p.cooldown / 24 : 0;
      ctx.globalAlpha = 0.25 + 0.75 * (1 - cooling);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const fl = Math.hypot(p.fx, p.fy) || 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p.fx / fl * r * 1.9, cy + p.fy / fl * r * 1.9); ctx.stroke();
    }

    // 子弹
    for (const b of state.bullets || []) {
      const c = COLORS[b.owner] || '#fff';
      const bx = b.x * ts, by = b.y * ts;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = c + '66';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx - b.vx / sp * ts * 0.55, by - b.vy / sp * ts * 0.55); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(2, 0.22 * ts), 0, Math.PI * 2); ctx.fill();
    }

    // 结束提示
    if (state.status === 'finished') {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
      ctx.fillStyle = '#e0c873';
      ctx.font = '600 22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      const txt = state.winner === null || state.winner === undefined ? '平局' : `${state.players[state.winner]?.name || '?'} 获胜`;
      ctx.fillText(txt, canvas.width / 2, canvas.height / 2 - 4);
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#8fa394';
      ctx.fillText(state.reason || '', canvas.width / 2, canvas.height / 2 + 22);
      ctx.textAlign = 'left';
    }
    renderCards(state);
  }

  function renderCards(state) {
    $('timeLeft').textContent = (state.timeLeft ?? 0).toFixed(1) + 's';
    $('bulletCount').textContent = String((state.bullets || []).length);
    const res = state.status === 'finished'
      ? (state.winner === null || state.winner === undefined ? '平局' : `${state.players[state.winner]?.name} 胜`)
      : '进行中';
    $('result').textContent = res;
    const log = state.events || [];
    $('log').innerHTML = log.slice(-14).map(e => `<div>${e.t.toFixed(1)}s ${esc(e.text || e.type)}</div>`).join('');
  }

  /* ==================== 本地对战 ==================== */
  const MOVE_KEYS = { KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R' };
  const AIM_KEYS = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' };

  function currentInput() {
    let mx = 0, my = 0;
    for (const [code, d] of Object.entries(MOVE_KEYS)) if (S.keys.has(code)) {
      if (d === 'U') my -= 1; if (d === 'D') my += 1; if (d === 'L') mx -= 1; if (d === 'R') mx += 1;
    }
    const dir = vecToDir(mx, my);
    let ax = 0, ay = 0;
    for (const [code, d] of Object.entries(AIM_KEYS)) if (S.keys.has(code)) {
      if (d === 'U') ay -= 1; if (d === 'D') ay += 1; if (d === 'L') ax -= 1; if (d === 'R') ax += 1;
    }
    const aim = (ax || ay) ? vecToDir(ax, ay) : null;
    return { dir, aim, fire: S.keys.has('Space') };
  }

  function vecToDir(x, y) {
    if (!x && !y) return 'N';
    const D = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], UL: [-1, -1], UR: [1, -1], DL: [-1, 1], DR: [1, 1] };
    let best = 'N', bestDot = -Infinity;
    const l = Math.hypot(x, y);
    for (const [k, [dx, dy]] of Object.entries(D)) {
      const dl = Math.hypot(dx, dy);
      const dot = (x / l) * (dx / dl) + (y / l) * (dy / dl);
      if (dot > bestDot) { bestDot = dot; best = k; }
    }
    return best;
  }

  async function newMatch() {
    const res = await fetch('/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json();
    S.match = data.id;
    S.state = data.state;
    draw(S.state);
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(tick, 50);
  }

  async function tick() {
    if (R.enabled || !S.match || S.busy) return;
    if (S.state && S.state.status !== 'playing') return;
    S.busy = true;
    try {
      const res = await fetch('/api/input', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match: S.match, input: currentInput() }),
      });
      if (res.ok) { S.state = await res.json(); draw(S.state); }
    } catch {} finally { S.busy = false; }
  }

  /* ==================== 回放 ==================== */
  function replayState() { return R.data?.frames?.[Math.min(R.index, (R.data?.frames?.length || 1) - 1)] || null; }

  async function loadRuns() {
    try {
      const d = await (await fetch('/api/arena/runs')).json();
      R.runs = d.runs || [];
      $('runs').innerHTML = R.runs.length
        ? R.runs.map(r => `<button data-run="${r.run}" class="${r.run === R.run ? 'on' : ''}">${r.run}<br><small>${esc((r.labels && Object.values(r.labels).join(' vs ')) || '')} · ${r.games} 局 · ${esc(r.phase || '')}</small></button>`).join('')
        : '<small>还没有比赛系列</small>';
      for (const b of $('runs').querySelectorAll('button')) b.onclick = () => selectRun(b.dataset.run);
      if (!R.run && R.runs.length) await selectRun(R.runs[0].run);
    } catch (e) { $('runs').innerHTML = `<small>${esc(e.message)}</small>`; }
  }

  async function selectRun(run) {
    R.run = run;
    try { R.meta = await (await fetch(`/api/arena?run=${encodeURIComponent(run)}`)).json(); } catch { R.meta = { games: [] }; }
    const games = R.meta.games || [];
    $('games').innerHTML = games.map(g => `<button data-g="${g.id}" class="${g.id === R.id ? 'on' : ''}">${g.id}</button>`).join('') || '<small>暂无对局</small>';
    for (const b of $('games').querySelectorAll('button')) b.onclick = () => loadGame(b.dataset.g);
    for (const b of $('runs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.run === run);
    const latest = games[games.length - 1];
    if (latest && (!R.id || !games.some(g => g.id === R.id))) await loadGame(latest.id);
  }

  async function loadGame(id) {
    R.id = id; R.playing = false; R.index = 0; R.clock = 0;
    $('replayInfo').textContent = '正在载入回放…';
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}&full=1`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw Error(e.error || '回放读取失败'); }
      R.data = await res.json();
      // 新存档只在顶层存一份地图；旧存档每帧自带 map。两种都要能放。
      if (R.data.map) {
        for (const f of R.data.frames || []) { f.map = R.data.map; f.rules = R.data.rules; }
      }
      R.frameMs = Number(R.data.frameMs) || 50;
      $('seek').max = String(Math.max(0, (R.data.frames?.length || 1) - 1));
      $('seek').value = '0';
      $('replayInfo').textContent = `${id} · ${(R.data.frames || []).length} 帧`;
      draw(replayState());
      for (const b of $('games').querySelectorAll('button')) b.classList.toggle('on', b.dataset.g === id);
    } catch (e) { $('replayInfo').textContent = e.message; }
  }

  function advance(dt) {
    if (!R.playing || !R.data) return;
    R.clock += dt * R.speed;
    const step = Math.floor(R.clock / R.frameMs);
    if (step <= 0) return;
    R.clock -= step * R.frameMs;
    const last = R.data.frames.length - 1;
    R.index = Math.min(last, R.index + step);
    if (R.index >= last) R.playing = false;
    $('seek').value = String(R.index);
    $('play').textContent = R.playing ? '暂停' : '播放';
    draw(replayState());
  }

  /* ==================== 主循环 ==================== */
  function loop(ts) {
    if (R.enabled) advance(ts - (R.lastTs || ts));
    R.lastTs = ts;
    requestAnimationFrame(loop);
  }

  async function enterReplay(gameId, run) {
    R.enabled = true;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    R.run = run || null;
    await loadRuns();
    if (!gameId || gameId === 'latest') return;
    if (R.meta && (R.meta.games || []).some(g => g.id === gameId)) await loadGame(gameId);
  }

  function bindUI() {
    $('newMatch').onclick = () => { if (R.enabled) location.href = location.pathname; else newMatch(); };
    $('play').onclick = () => { R.playing = !R.playing; $('play').textContent = R.playing ? '暂停' : '播放'; };
    $('seek').oninput = e => { R.index = Number(e.target.value); R.playing = false; R.clock = 0; $('play').textContent = '播放'; draw(replayState()); };
    for (const b of document.querySelectorAll('.speeds button')) b.onclick = () => {
      R.speed = Number(b.dataset.s);
      for (const x of document.querySelectorAll('.speeds button')) x.classList.toggle('on', x === b);
    };
    addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      S.keys.add(e.code);
    });
    addEventListener('keyup', e => S.keys.delete(e.code));
    addEventListener('blur', () => S.keys.clear());
  }

  async function init() {
    bindUI();
    requestAnimationFrame(loop);
    const url = new URL(location.href);
    if (url.searchParams.has('replay')) {
      await enterReplay(url.searchParams.get('replay'), url.searchParams.get('run'));
    } else {
      await newMatch();
    }
  }

  init().catch(e => { $('replayInfo').textContent = '初始化失败：' + e.message; });
  window.__duel = { S, R };
})();
