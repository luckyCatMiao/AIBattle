/* 3V3 足球 — Canvas 2D 客户端。
 * 服务端 20 Hz 推进；本页负责本地输入、快照轮询、回放播放与 60 fps 绘制。 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const TILE = 24, TAU = Math.PI * 2;
  const TEAM_COLORS = ['#6fc8ff', '#ff8a7a'];
  const teamColor = team => TEAM_COLORS[team] || '#dfe7f5';

  let W = 44, H = 26;
  function setDims(w, h) {
    if (w && h && (w !== W || h !== H)) {
      W = w; H = h; cv.width = W * TILE; cv.height = H * TILE;
      SCENE.key = '';
    }
  }

  const S = {
    catalog: null, match: null, token: null, player: 0, mode: 'local',
    state: null, prevState: null, poll: 50, busy: false,
    keys: new Set(), mouse: { x: W / 2, y: H / 2, active: false },
    inputAt: 0, banner: null, bannerUntil: 0, log: [], events: new Set(),
    lastFrame: 0, lastTs: 0,
  };
  const R = {
    enabled: false, runs: [], run: null, meta: null, data: null, id: null,
    index: 0, playing: false, speed: 1, clock: 0, loading: false, loadingText: '',
    ticket: 0, error: '', frameMs: 50,
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pulse = (t, p) => (Math.sin((t / p) * TAU - Math.PI / 2) + 1) / 2;

  function toast(msg, error = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }

  async function api(route, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token ?? S.token;
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(route, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: `服务器返回 ${res.status}` }));
    if (!res.ok || data.error) throw Error(data.error || `请求失败 (${res.status})`);
    return data;
  }

  /* ==================== 静态球场 ==================== */
  const SCENE = { key: '', canvas: null };
  function sceneLayer(st) {
    const key = `${W}x${H}:${st?.id || ''}`;
    if (SCENE.canvas && SCENE.key === key) return SCENE.canvas;
    const off = document.createElement('canvas');
    off.width = W * TILE; off.height = H * TILE;
    paintPitch(off.getContext('2d'));
    SCENE.key = key; SCENE.canvas = off;
    return off;
  }

  function paintPitch(c) {
    const w = W * TILE, h = H * TILE;
    c.fillStyle = '#0d1f13'; c.fillRect(0, 0, w, h);

    // 草皮条纹
    const stripe = TILE * 2;
    for (let x = 0, i = 0; x < w; x += stripe, i++) {
      c.fillStyle = i % 2 ? '#1a5c34' : '#17522e';
      c.fillRect(x, 0, stripe, h);
    }
    // 轻微纵向渐变与暗角
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    const L = TILE, R = (W - 1) * TILE, T = TILE, B = (H - 1) * TILE;
    c.strokeStyle = 'rgba(235,255,240,.72)'; c.lineWidth = 2;
    c.strokeRect(L, T, R - L, B - T);

    // 中线与中圈
    c.beginPath(); c.moveTo(w / 2, T); c.lineTo(w / 2, B); c.stroke();
    c.beginPath(); c.arc(w / 2, h / 2, TILE * 3, 0, TAU); c.stroke();
    c.beginPath(); c.arc(w / 2, h / 2, 3, 0, TAU); c.fillStyle = 'rgba(235,255,240,.8)'; c.fill();

    // 禁区与小禁区
    const boxW = TILE * 7, boxH = TILE * 12;
    c.strokeRect(L, (h - boxH) / 2, boxW, boxH);
    c.strokeRect(R - boxW, (h - boxH) / 2, boxW, boxH);
    const smallW = TILE * 3, smallH = TILE * 6;
    c.strokeRect(L, (h - smallH) / 2, smallW, smallH);
    c.strokeRect(R - smallW, (h - smallH) / 2, smallW, smallH);

    // 角球弧
    for (const [x, y, a] of [[L, T, 0], [R, T, Math.PI / 2], [R, B, Math.PI], [L, B, -Math.PI / 2]]) {
      c.beginPath(); c.arc(x, y, TILE, a, a + Math.PI / 2); c.stroke();
    }

    // 球门与球网（在边墙的球门高度内）
    const gTop = 10 * TILE, gBottom = 16 * TILE;
    for (const side of [0, 1]) {
      const gx = side === 0 ? 0 : (W - 1) * TILE;
      c.fillStyle = 'rgba(8,20,12,.82)';
      c.fillRect(gx, gTop, TILE, gBottom - gTop);
      c.strokeStyle = side === 0 ? TEAM_COLORS[0] : TEAM_COLORS[1];
      c.lineWidth = 3;
      c.strokeRect(gx + 1, gTop, TILE - 2, gBottom - gTop);
      c.strokeStyle = 'rgba(235,255,240,.35)'; c.lineWidth = 1;
      for (let y = gTop + 6; y < gBottom; y += 7) {
        c.beginPath(); c.moveTo(gx + 2, y); c.lineTo(gx + TILE - 2, y); c.stroke();
      }
      for (let x = gx + 6; x < gx + TILE; x += 7) {
        c.beginPath(); c.moveTo(x, gTop + 2); c.lineTo(x, gBottom - 2); c.stroke();
      }
    }

    // 四周压暗
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  /* ==================== 动态绘制 ==================== */
  function drawUnits(c, st, positions, t) {
    const units = st.units || [];
    // 先画没有球的，再画持球者
    const sorted = units.slice().sort((a, b) => (a.hasBall ? 1 : 0) - (b.hasBall ? 1 : 0));
    for (const u of sorted) {
      const p = positions?.units?.get(u.id) || u;
      const X = p.x * TILE, Y = p.y * TILE, R0 = 9.2;
      const col = teamColor(u.team);
      c.save();
      // 影子
      c.fillStyle = 'rgba(0,0,0,.42)';
      c.beginPath(); c.ellipse(X + 1, Y + 8, 9.5, 3.6, 0, 0, TAU); c.fill();

      // 身体
      const g = c.createRadialGradient(X - 3, Y - 4, 1, X, Y, R0);
      g.addColorStop(0, '#eaf2ee'); g.addColorStop(.35, col); g.addColorStop(1, '#122018');
      c.fillStyle = g; c.beginPath(); c.arc(X, Y, R0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(6,14,9,.9)'; c.lineWidth = 1.4; c.stroke();

      // 朝向
      const fa = Math.atan2(p.facing.y, p.facing.x);
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.beginPath();
      c.moveTo(X + Math.cos(fa) * (R0 + 2.4), Y + Math.sin(fa) * (R0 + 2.4));
      c.lineTo(X + Math.cos(fa + 2.5) * (R0 - 2.6), Y + Math.sin(fa + 2.5) * (R0 - 2.6));
      c.lineTo(X + Math.cos(fa - 2.5) * (R0 - 2.6), Y + Math.sin(fa - 2.5) * (R0 - 2.6));
      c.closePath(); c.fill();

      // 编号
      c.font = '800 9px "Segoe UI",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#0b1710'; c.fillText(String((u.index ?? 0) + 1), X, Y + .5);

      // 持球环
      if (u.hasBall) {
        c.strokeStyle = `rgba(255,224,130,${(.65 + pulse(t, .7) * .3).toFixed(3)})`;
        c.lineWidth = 2; c.beginPath(); c.arc(X, Y, R0 + 4, 0, TAU); c.stroke();
      }
      // 本地模式标出你控制的球员
      if (!R.enabled && S.mode === 'local' && u.team === 0 && u.index === 0) {
        c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.6;
        c.setLineDash([4, 3]); c.beginPath(); c.arc(X, Y, R0 + 6, 0, TAU); c.stroke(); c.setLineDash([]);
      }
      // 踢球冷却
      if (u.kickCd > 0) {
        c.strokeStyle = 'rgba(255,224,130,.9)'; c.lineWidth = 1.8; c.lineCap = 'round';
        c.beginPath(); c.arc(X, Y, R0 + 4, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(u.kickCd / .35, 0, 1)); c.stroke();
      }
      c.restore();
    }
  }

  function drawBall(c, b, st, t) {
    if (!b) return;
    const X = b.x * TILE, Y = b.y * TILE, R0 = 5.2;
    c.save();
    // 影子
    c.fillStyle = 'rgba(0,0,0,.4)';
    c.beginPath(); c.ellipse(X + 1, Y + 6, 6, 2.4, 0, 0, TAU); c.fill();
    // 运动拖尾
    const sp = Math.hypot(b.vx || 0, b.vy || 0);
    if (sp > .4) {
      const l = clamp(sp * .045, .4, 1.6) * TILE;
      const n = Math.hypot(b.vx, b.vy) || 1;
      const g = c.createLinearGradient(X, Y, X - b.vx / n * l, Y - b.vy / n * l);
      g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = g; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(X, Y); c.lineTo(X - b.vx / n * l, Y - b.vy / n * l); c.stroke();
    }
    // 球
    const g = c.createRadialGradient(X - 2, Y - 2, .5, X, Y, R0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.7, '#e8ece8'); g.addColorStop(1, '#9aa99c');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, R0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(20,30,22,.75)'; c.lineWidth = 1; c.stroke();
    // 黑色块
    c.fillStyle = 'rgba(25,35,28,.8)';
    c.beginPath(); c.arc(X, Y, 1.7, 0, TAU); c.fill();
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + t * .4;
      c.beginPath(); c.arc(X + Math.cos(a) * 3.2, Y + Math.sin(a) * 3.2, 1, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawAim(c, st) {
    if (R.enabled || S.mode !== 'local' || !S.mouse.active) return;
    const u = (st.units || []).find(x => x.team === 0 && x.index === 0);
    if (!u) return;
    const X = u.x * TILE, Y = u.y * TILE;
    const mx = S.mouse.x * TILE, my = S.mouse.y * TILE;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.2; c.setLineDash([4, 5]);
    c.beginPath(); c.moveTo(X, Y); c.lineTo(mx, my); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath(); c.arc(mx, my, 3, 0, TAU); c.fill();
    c.restore();
  }

  function drawEvents(c, st) {
    for (const e of st.events || []) {
      if (e.frame < (st.frame || 0) - 3) continue;
      if (e.type === 'goal') {
        const a = 1 - clamp((st.frame - e.frame) / 3, 0, 1);
        c.save(); c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(W * TILE / 2, H * TILE / 2, 10, W * TILE / 2, H * TILE / 2, 260);
        g.addColorStop(0, `rgba(255,220,130,${.18 * a})`); g.addColorStop(1, 'rgba(255,220,130,0)');
        c.fillStyle = g; c.fillRect(0, 0, W * TILE, H * TILE);
        c.restore();
      }
    }
  }

  function drawHud(c, st, t) {
    const names = (st.players || []).map(p => p.name);
    c.save();
    // 中央比分
    c.fillStyle = 'rgba(6,14,9,.78)';
    pill(c, W * TILE / 2 - 128, 12, 256, 54, 10); c.fill();
    c.strokeStyle = 'rgba(126,231,135,.22)'; c.lineWidth = 1; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '700 12px "Segoe UI",sans-serif';
    c.fillStyle = teamColor(0); c.fillText(names[0] || 'A', W * TILE / 2 - 78, 28);
    c.fillStyle = teamColor(1); c.fillText(names[1] || 'B', W * TILE / 2 + 78, 28);
    c.font = '800 26px "Segoe UI",sans-serif'; c.fillStyle = '#f2f7f3';
    c.fillText(`${st.score?.[0] ?? 0} : ${st.score?.[1] ?? 0}`, W * TILE / 2, 44);
    c.textBaseline = 'alphabetic'; c.textAlign = 'start';

    // 时间
    c.fillStyle = 'rgba(6,14,9,.78)';
    pill(c, W * TILE - 176, 12, 164, 40, 9); c.fill();
    c.fillStyle = '#8fa394'; c.font = '600 11px "Segoe UI",sans-serif';
    c.fillText(st.golden ? '金球剩余' : (st.half === 1 ? '上半场' : '下半场'), W * TILE - 164, 30);
    c.fillStyle = st.golden ? '#e0c873' : ((st.timeLeft ?? 0) <= 15 ? '#e0c873' : '#e9f0ea');
    c.font = '800 19px "Segoe UI",sans-serif'; c.textAlign = 'right';
    c.fillText(`${(st.timeLeft ?? 0).toFixed(1)}s`, W * TILE - 24, 39);
    c.textAlign = 'start';

    if (st.freeze > 0 && st.status === 'playing') {
      c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '700 16px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText('开球', W * TILE / 2, 92); c.textAlign = 'start';
    }
    c.restore();
  }

  function pill(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }

  function drawStage(c, st, positions, t) {
    if (!st) {
      c.clearRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#070d09'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#8fa394'; c.font = '600 15px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText(R.loading ? (R.loadingText || '正在载入回放…') : '暂无对局', cv.width / 2, cv.height / 2);
      c.textAlign = 'start'; return;
    }
    if (st.map?.width && st.map?.height) setDims(st.map.width, st.map.height);
    c.clearRect(0, 0, W * TILE, H * TILE);
    c.drawImage(sceneLayer(st), 0, 0);
    drawAim(c, st);
    drawUnits(c, st, positions, t);
    drawBall(c, positions?.ball || st.ball, st, t);
    drawEvents(c, st);
    drawHud(c, st, t);

    if (S.banner && performance.now() < S.bannerUntil) {
      const left = (S.bannerUntil - performance.now()) / 900;
      c.save(); c.globalAlpha = clamp(left, 0, 1);
      c.font = '800 32px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.96)'; c.shadowColor = 'rgba(126,231,135,.9)'; c.shadowBlur = 26;
      c.fillText(S.banner, W * TILE / 2, H * TILE / 2 - 8);
      c.restore(); c.textAlign = 'start';
    }
    if (st.status === 'finished') {
      const X = W * TILE / 2, Y = H * TILE / 2;
      c.fillStyle = 'rgba(5,12,7,.7)'; c.fillRect(0, 0, W * TILE, H * TILE);
      c.save(); c.textAlign = 'center';
      c.font = '800 38px "Segoe UI",sans-serif';
      c.fillStyle = st.winner === null ? '#e0c873' : teamColor(st.winner);
      c.fillText(st.winner === null ? '平 局' : `${st.players?.[st.winner]?.name || '?'} 获胜`, X, Y - 6);
      c.font = '600 15px "Segoe UI",sans-serif'; c.fillStyle = '#c3d3c7';
      c.fillText(`${st.score?.[0] ?? 0} : ${st.score?.[1] ?? 0} · ${st.reason || ''}`, X, Y + 26);
      c.restore(); c.textAlign = 'start';
    }
  }

  /* ==================== 本地输入 ==================== */
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], UL: [-1, -1], UR: [1, -1], DL: [-1, 1], DR: [1, 1] };
  function readMove() {
    const k = S.keys;
    const up = k.has('KeyW'), down = k.has('KeyS'), left = k.has('KeyA'), right = k.has('KeyD');
    if (up && left) return 'UL'; if (up && right) return 'UR';
    if (down && left) return 'DL'; if (down && right) return 'DR';
    if (up) return 'U'; if (down) return 'D'; if (left) return 'L'; if (right) return 'R';
    return 'N';
  }
  function ownUnit() {
    return (S.state?.units || []).find(u => u.team === 0 && u.index === 0) || null;
  }
  function readAim() {
    const u = ownUnit();
    if (!u || !S.mouse.active) return null;
    return Math.atan2(S.mouse.y - u.y, S.mouse.x - u.x) * 180 / Math.PI;
  }
  async function sendInput() {
    if (S.mode !== 'local' || R.enabled || !S.match || S.state?.status !== 'playing') return;
    api(`/api/matches/${S.match}/step`, {
      input: { dir: readMove(), aim: readAim(), kick: S.keys.has('Space') },
    }, S.token).catch(() => {});
  }

  async function fetchState() {
    if (!S.match) return;
    try {
      const next = await api(`/api/matches/${S.match}`, undefined, S.token);
      if (S.state && S.state.id === next.id) S.prevState = S.state;
      S.state = next;
      handleEvents(next);
      S.lastTs = performance.now();
    } catch { /* 网络抖动静默重试 */ }
  }

  function handleEvents(st) {
    for (const e of st.events || []) {
      if (S.events.has(e.id)) continue;
      S.events.add(e.id);
      if (e.type === 'goal') {
        S.banner = e.text || '进球！'; S.bannerUntil = performance.now() + 1600;
        S.log.push({ t: e.t, text: e.text, type: 'goal' });
      } else if (['half', 'golden', 'end'].includes(e.type)) {
        S.banner = e.text || ''; S.bannerUntil = performance.now() + 1800;
        S.log.push({ t: e.t, text: e.text || e.type, type: 'end' });
      } else if (e.type === 'kickoff' || e.type === 'tackle') {
        S.log.push({ t: e.t, text: e.text || '抢断', type: e.type });
      }
      if (S.log.length > 60) S.log.shift();
    }
    if (S.events.size > 900) S.events = new Set([...S.events].slice(-300));
  }

  async function createLocalMatch() {
    const res = await api('/api/matches', {
      mode: 'local', seed: Math.floor(Math.random() * 1e6),
      players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }],
    }, '');
    S.match = res.match;
    S.token = res.seats[0]?.token || null;
    S.player = 0; S.mode = 'local';
    S.state = res.state; S.prevState = null;
    S.log = []; S.events.clear(); S.banner = null; S.bannerUntil = 0;
  }

  /* ==================== 侧栏 ==================== */
  const lastHtml = new Map();
  function setHtml(id, html) {
    if (lastHtml.get(id) === html) return false;
    lastHtml.set(id, html);
    $(id).innerHTML = html;
    return true;
  }

  function unitRow(u, st) {
    return `<div class="unitrow${u.hasBall ? ' ball' : ''}">
      <span class="idx" style="color:${teamColor(u.team)}">${(u.index ?? 0) + 1}</span>
      <span class="un">${esc(u.name || '')}</span>
      <span class="tag">${u.hasBall ? '持球' : (u.kickCd > 0 ? '冷却 ' + u.kickCd.toFixed(1) + 's' : '')} · ${u.kicks || 0} 踢</span>
    </div>`;
  }

  function renderSide() {
    const st = R.enabled ? replayState() : S.state;
    if (!st) {
      setHtml('matchCard', '<h3>对局</h3><small>等待服务端…</small>');
      for (const id of ['timeCard', 'teamCard', 'enemyCard', 'statsCard', 'logCard', 'legend']) setHtml(id, '');
      return;
    }
    const pl = st.players || [];

    setHtml('matchCard', `<h3>对局</h3>
      <div class="scoreboard">${pl.map((p, i) => `<div class="prow">
        <span class="dot" style="background:${teamColor(i)}"></span><span class="nm">${esc(p.name || '')}</span>
        <span class="wins">${st.score?.[i] ?? 0}</span></div>`).join('')}</div>
      <div class="row"><span class="k">阶段</span><span class="v">${st.status === 'finished' ? '已结束' : st.golden ? '金球' : st.half === 1 ? '上半场' : '下半场'}</span></div>
      ${st.reason ? `<div class="row"><span class="k">结算</span><span class="v" style="color:#e0c873">${esc(st.reason)}</span></div>` : ''}`);

    const left = st.timeLeft ?? 0;
    setHtml('timeCard', `<h3>${st.golden ? '金球倒计时' : '比赛时间'}</h3>
      ${st.status === 'playing' ? `<div class="row"><span class="k">剩余</span><span class="v timebig ${left <= 10 ? 'danger' : left <= 25 ? 'soon' : ''}">${left.toFixed(1)}s</span></div>` : ''}
      <div class="floodbar"><i style="width:${(clamp(left / (st.golden ? 20 : 60), 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">半场</span><span class="v">${st.half} / 2</span></div>
      <div class="row"><span class="k">开球冻结</span><span class="v">${(st.freeze ?? 0).toFixed(1)}s</span></div>`);

    const own = (st.units || []).filter(u => u.team === 0);
    const other = (st.units || []).filter(u => u.team === 1);
    setHtml('teamCard', `<h3>${esc(pl[0]?.name || '队伍 1')}</h3>${own.map(u => unitRow(u, st)).join('')}`);
    setHtml('enemyCard', `<h3>${esc(pl[1]?.name || '队伍 2')}</h3>${other.map(u => unitRow(u, st)).join('')}`);

    const stats = st.stats || [];
    setHtml('statsCard', `<h3>比赛数据</h3>
      <div class="row"><span class="k">踢球 / 射门</span><span class="v">${stats[0]?.kicks ?? 0} : ${stats[1]?.kicks ?? 0}</span></div>
      <div class="row"><span class="k">控球帧</span><span class="v">${stats[0]?.possession ?? 0} : ${stats[1]?.possession ?? 0}</span></div>
      <div class="row"><span class="k">球速</span><span class="v">${Math.hypot(st.ball?.vx || 0, st.ball?.vy || 0).toFixed(1)} 格/秒</span></div>`);

    const logs = (st === S.state ? S.log : replayLog()).slice(-14).reverse();
    setHtml('logCard', `<h3>战况</h3><div class="log">${logs.length
      ? logs.map(l => `<div class="${l.type === 'goal' ? 'goal' : l.type === 'end' ? 'end' : ''}"><i>${l.t != null ? l.t.toFixed(1) + 's' : ''}</i><span>${esc(l.text)}</span></div>`).join('')
      : '<div><i></i><span style="color:#8fa394">等待开球…</span></div>'}</div>`);

    setHtml('legend', R.enabled
      ? '<b>回放</b> 拖动进度条跳转 · 播放/暂停 · 0.5×–4× 变速<br>逐物理帧回放（20 Hz）'
      : '<b>移动</b> W A S D · <b>瞄准</b> 鼠标方向 · <b>踢球</b> 空格<br><b>规则</b> 每局 1–6 人/队 · 120 秒 · 平局进入金球');
  }

  /* ==================== 主循环 ==================== */
  function loop(ts) {
    const t = ts / 1000;
    if (R.enabled) {
      replayAdvance(ts - S.lastFrame);
      renderSide();
      drawStage(ctx, replayState(), replayPositions(), t);
    } else {
      if (S.mode === 'local' && ts - S.inputAt >= 33) { S.inputAt = ts; sendInput(); }
      renderSide();
      if (S.state) {
        const a = clamp((performance.now() - S.lastTs) / S.poll, 0, 1);
        drawStage(ctx, S.state, S.prevState ? blend(S.prevState, S.state, a) : null, t);
      } else drawStage(ctx, null, null, t);
    }
    S.lastFrame = ts;
    requestAnimationFrame(loop);
  }

  /* ==================== 回放 ==================== */
  function blend(prev, st, a) {
    if (!prev) return null;
    const units = new Map();
    const prevUnits = new Map((prev.units || []).map(u => [u.id, u]));
    for (const u of st.units || []) {
      const p = prevUnits.get(u.id);
      units.set(u.id, p
        ? { ...u, x: lerp(p.x, u.x, a), y: lerp(p.y, u.y, a), facing: u.facing }
        : u);
    }
    const pb = prev.ball, b = st.ball;
    const ball = pb && b ? { ...b, x: lerp(pb.x, b.x, a), y: lerp(pb.y, b.y, a) } : b;
    return { units, ball };
  }
  const replayState = () => R.data?.frames?.[clamp(R.index, 0, (R.data?.frames?.length || 1) - 1)] || null;
  const replayFrameMs = () => Number(R.frameMs) > 0 ? Number(R.frameMs) : 50;
  const replayAlpha = () => (!R.playing || !R.data) ? 0 : clamp(R.clock / replayFrameMs(), 0, 1);
  function replayPositions() {
    const frames = R.data?.frames;
    if (!frames || !frames.length) return null;
    const i = clamp(R.index, 0, frames.length - 1);
    if (i + 1 >= frames.length) return null;
    return blend(frames[i], frames[i + 1], replayAlpha());
  }
  function replayAdvance(dt) {
    if (!R.playing || !R.data) return;
    const frameMs = replayFrameMs();
    R.clock += dt * (R.speed || 1);
    const step = Math.floor(R.clock / frameMs);
    if (step <= 0) return;
    R.clock -= step * frameMs;
    const last = R.data.frames.length - 1;
    R.index = Math.min(last, R.index + step);
    if (R.index >= last) R.playing = false;
    const seek = $('rSeek'); if (seek) seek.value = String(R.index);
    const rf = $('rf'); if (rf) rf.textContent = String(R.index);
    if (!R.playing) renderReplayPanel();
  }
  function replayLog() {
    const st = replayState();
    if (!st) return [];
    return (st.events || []).filter(e => ['goal', 'half', 'golden', 'end', 'kickoff', 'tackle'].includes(e.type))
      .slice(-14).map(e => ({ t: e.t, text: e.text || e.type, type: e.type }));
  }

  async function loadRuns() {
    try {
      const r = await api('/api/arena/runs');
      R.runs = r.runs || [];
      if (!R.run) R.run = r.activeRun || R.runs[0]?.run || null;
      renderRuns(); await loadRunMeta();
    } catch (e) { R.error = e.message; renderRuns(); }
  }
  function renderRuns() {
    $('runCard').innerHTML = `<h3>比赛系列</h3><div class="runs">${R.runs.length ? R.runs.map(r => {
      const labels = r.labels ? Object.values(r.labels).join(' vs ') : '';
      return `<button data-run="${esc(r.run)}" class="${R.run === r.run ? 'on' : ''}">${esc(r.run)}<small>${esc(labels)} · ${r.games} 局 · ${esc(r.phase || '')}${r.completed ? ' · 已完成' : ''}</small></button>`;
    }).join('') : `<small style="color:#8fa394">${esc(R.error || '还没有已归档的系列赛。')}</small>`}</div>`;
    for (const el of $('runCard').querySelectorAll('.runs button')) el.onclick = () => {
      R.run = el.dataset.run; R.data = null; R.id = null; R.index = 0; R.playing = false;
      renderRuns(); loadRunMeta();
    };
  }
  async function loadRunMeta() {
    if (!R.run) { renderGameList(); return; }
    try { R.meta = await api(`/api/arena?run=${encodeURIComponent(R.run)}`); } catch { R.meta = null; }
    renderGameList();
  }
  function renderGameList() {
    const gs = R.meta?.games || [];
    $('gameCard').innerHTML = `<h3>对局</h3>${gs.length
      ? `<div class="games">${gs.map(g => `<button data-g="${esc(g.id)}" class="${R.id === g.id ? 'on' : ''}">${esc(g.id)}${g.technicalFailure ? ' ⚠' : ''}</button>`).join('')}</div>`
      : '<small style="color:#8fa394">暂无对局</small>'}`;
    for (const el of $('gameCard').querySelectorAll('.games button')) el.onclick = () => loadGame(el.dataset.g);
  }
  async function loadGame(id) {
    R.id = id; R.loading = true; R.loadingText = '正在载入回放…'; R.error = '';
    renderGameList(); renderReplayPanel();
    const ticket = ++R.ticket;
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}`);
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).error || '回放读取失败');
      const reader = res.body?.getReader();
      let text = '';
      if (reader) {
        const dec = new TextDecoder(); let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (ticket !== R.ticket) return;
          if (done) break;
          got += value.length; R.loadingText = `正在载入回放… ${(got / 1048576).toFixed(1)} MB`;
          text += dec.decode(value, { stream: true });
        }
        text += dec.decode();
      } else text = await res.text();
      if (ticket !== R.ticket) return;
      R.data = JSON.parse(text);
      for (const f of R.data.frames || []) {
        f.map = R.data.map; f.rules = R.data.rules;
      }
      R.frameMs = Number(R.data?.frameMs) > 0 ? Number(R.data.frameMs) : 50;
      R.index = 0; R.playing = false; R.clock = 0;
      renderGameList();
    } catch (e) { R.error = e.message; }
    finally { if (ticket === R.ticket) R.loading = false; }
    renderReplayPanel();
  }

  function roundLogHtml(st) {
    const score = st.score || [0, 0];
    return `<div class="rounds"><div><span class="win">最终比分</span><span>${score[0]} : ${score[1]}</span><em>${esc(st.reason || '')}</em></div></div>`;
  }

  function renderReplayPanel() {
    const d = R.data;
    if (!d) {
      $('replayCard').innerHTML = `<h3>回放</h3><div class="transport">
        <button disabled>播放</button><input type="range" disabled min="0" max="0" value="0"><div class="speeds">
        ${[0.5, 1, 2, 4].map(s => `<button disabled>${s}×</button>`).join('')}</div></div>
        <small style="color:#8fa394">${esc(R.loading ? R.loadingText : (R.error || '选择左侧一局开始播放'))}</small>`;
      $('scoreCard').innerHTML = ''; return;
    }
    const last = Math.max(0, d.frames.length - 1);
    const labels = R.meta?.labels || {};
    const nameOf = i => labels[d.seats?.[i]] || d.seats?.[i] || `#${i}`;
    const finalSt = d.final || ({ winner: d.winner, reason: d.reason, players: [] });
    const st = replayState() || finalSt;
    $('replayCard').innerHTML = `<h3>回放 ${esc(d.id)}</h3>
      ${d.technicalFailure ? `<div class="row"><span class="k">技术中断</span><span class="v" style="color:#e38978">${esc(d.technicalFailure)}</span></div>` : ''}
      <div class="transport">
        <button id="rPlay">${R.playing ? '暂停' : '播放'}</button>
        <input type="range" id="rSeek" min="0" max="${last}" value="${R.index}">
        <div class="speeds">${[0.5, 1, 2, 4].map(s => `<button data-s="${s}" class="${R.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
      </div>
      <div class="row"><span class="k">帧</span><span class="v"><span id="rf">${R.index}</span> / ${last}</span></div>
      <div class="row"><span class="k">模拟时间</span><span class="v">${((st.frame || 0) / 20).toFixed(1)}s · ${st.golden ? '金球' : st.half === 1 ? '上半场' : '下半场'}</span></div>
      <div class="row"><span class="k">结果</span><span class="v" style="color:#e0c873">${d.winner === null || d.winner === undefined ? '平局' : esc(nameOf(d.winner)) + ' 胜'}</span></div>
      <div class="row"><span class="k">比分</span><span class="v">${d.scores?.[d.seats?.[0]] ?? 0} : ${d.scores?.[d.seats?.[1]] ?? 0}</span></div>`;
    $('rPlay').onclick = () => { R.playing = !R.playing; renderReplayPanel(); };
    $('rSeek').oninput = e => { R.index = Number(e.target.value); R.playing = false; R.clock = 0; $('rf').textContent = String(R.index); };
    for (const b of $('replayCard').querySelectorAll('.speeds button')) b.onclick = () => { R.speed = Number(b.dataset.s); renderReplayPanel(); };

    const results = R.meta?.results || [];
    const tally = {};
    for (const r of results) if (r.winner) tally[r.winner] = (tally[r.winner] || 0) + 1;
    const ids = Object.keys(R.meta?.models || {});
    $('scoreCard').innerHTML = `<h3>比分与逐局</h3>
      ${ids.length ? `<div style="display:flex;justify-content:space-around;font-size:18px;font-weight:700">
        ${ids.map(i => `<span style="color:${teamColor(d.seats?.[0] === i ? 0 : 1)}">${esc(labels[i] || i)} <b>${tally[i] || 0}</b></span>`).join('')}
      </div><div class="row"><span class="k">系列场数</span><span class="v">${results.length}</span></div>` : ''}
      <div class="sep"></div>${roundLogHtml(st)}`;
  }

  /* ==================== 模式与启动 ==================== */
  async function enterWatch(runId, skipLatest = false) {
    if (R.enabled) return;
    R.enabled = true; S.keys.clear(); S.banner = null; S.bannerUntil = 0;
    $('setupCard').style.display = 'none'; lastHtml.clear();
    drawStage(ctx, null, null, 0); renderReplayPanel();
    try { await loadRuns(); } catch (e) { toast(e.message, true); }
    if (runId && (R.runs || []).some(r => r.run === runId) && R.run !== runId) {
      R.run = runId; R.data = null; R.id = null; R.index = 0; R.playing = false;
      renderRuns(); await loadRunMeta();
    }
    const games = R.meta?.games || [];
    const latest = games[games.length - 1];
    if (latest && !skipLatest) await loadGame(latest.id);
  }
  async function enterLocal() {
    R.enabled = false; R.data = null; R.id = null; R.playing = false; R.error = '';
    $('setupCard').style.display = '';
    lastHtml.clear();
    $('runCard').innerHTML = ''; $('gameCard').innerHTML = ''; $('scoreCard').innerHTML = '';
    await createLocalMatch();
  }

  function wireInput() {
    const tracked = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    addEventListener('keydown', e => {
      if (tracked.has(e.code) || e.code === 'Space') { e.preventDefault(); S.keys.add(e.code); }
    });
    addEventListener('keyup', e => {
      if (tracked.has(e.code) || e.code === 'Space') { e.preventDefault(); S.keys.delete(e.code); }
    });
    addEventListener('blur', () => S.keys.clear());
    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      S.mouse = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, active: true };
    });
    cv.addEventListener('mouseleave', () => { S.mouse.active = false; });
  }

  async function init() {
    try {
      S.catalog = await api('/api/catalog');
      setDims(S.catalog?.rules?.width, S.catalog?.rules?.height);
    } catch { S.catalog = null; }
    $('meta').textContent = `· ${W}×${H} 格 · 1–6 人/队 · 20 Hz · 120 秒 + 金球`;
    wireInput();
    for (const b of $('modes').querySelectorAll('button')) b.onclick = () => {
      for (const o of $('modes').querySelectorAll('button')) o.classList.toggle('on', o === b);
      if (b.dataset.mode === 'watch') { if (!R.enabled) enterWatch(); }
      else if (R.enabled) enterLocal();
    };
    $('newMatch').onclick = () => enterLocal().catch(e => toast(e.message, true));
    requestAnimationFrame(loop);
    const params = new URLSearchParams(location.search);
    const replayParam = params.get('replay');
    if (replayParam) {
      for (const o of $('modes').querySelectorAll('button')) o.classList.toggle('on', o.dataset.mode === 'watch');
      await enterWatch(params.get('run'), !!(replayParam && replayParam !== 'latest'));
      const wanted = replayParam === 'latest' ? null : replayParam;
      if (wanted && (R.meta?.games || []).some(g => g.id === wanted)) await loadGame(wanted);
      R.playing = true; R.clock = 0; renderReplayPanel();
      const at = Number(params.get('frame'));
      if (Number.isFinite(at) && at > 0 && R.data?.frames?.length) {
        R.index = clamp(Math.floor(at), 0, R.data.frames.length - 1);
        R.playing = false; R.clock = 0; renderReplayPanel();
      }
    } else {
      await createLocalMatch();
    }
    setInterval(() => {
      if (R.enabled || S.busy) return;
      S.busy = true; fetchState().finally(() => { S.busy = false; });
    }, S.poll);
  }
  init().catch(e => toast('初始化失败：' + e.message, true));
  window.__soccer = { S, R };
})();
