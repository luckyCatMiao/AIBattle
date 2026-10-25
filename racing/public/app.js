/* 俯视角赛车 — Canvas 2D 客户端。
 * 服务端 20 Hz 推进；本页负责本地输入、状态轮询、回放播放与 60 fps 绘制。 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const TILE = 16, TAU = Math.PI * 2;
  const TEAM_COLORS = ['#6fc8ff', '#ff9a6b'];
  const teamColor = team => TEAM_COLORS[team] || '#e9eef6';

  let W = 64, H = 44;
  function setDims(w, h) {
    // 画布固定为 1024×704，镜头跟随车辆；地图本身可以远大于一屏。
    if (w && h && (w !== W || h !== H)) { W = w; H = h; SCENE.key = ''; S.cam.init = false; }
  }

  const S = {
    catalog: null, match: null, token: null, mode: 'local',
    state: null, prevState: null, poll: 50, busy: false,
    keys: new Set(), inputAt: 0, banner: null, bannerUntil: 0,
    log: [], events: new Set(), lastTs: 0, lastFrame: 0,
    trails: new Map(),
    cam: { x: 0, y: 0, t: 0, init: false },
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
  const normAngle = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

  function toast(msg, error = false) {
    const el = $('toast'); el.textContent = msg; el.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }
  async function api(route, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token ?? S.token; if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: `服务器返回 ${res.status}` }));
    if (!res.ok || data.error) throw Error(data.error || `请求失败 (${res.status})`);
    return data;
  }

  /* ==================== 静态赛道 ==================== */
  const SCENE = { key: '', canvas: null };
  function sceneLayer(st) {
    const key = `${st.track?.seed || 0}:${st.track?.width}x${st.track?.height}:${st.track?.points?.length || 0}`;
    if (SCENE.canvas && SCENE.key === key) return SCENE.canvas;
    const off = document.createElement('canvas'); off.width = W * TILE; off.height = H * TILE;
    paintTrack(off.getContext('2d'), st.track);
    SCENE.key = key; SCENE.canvas = off; return off;
  }

  function hash2(x, y) {
    let h = Math.imul(x + 0x9e37, 374761393) ^ Math.imul(y + 0x85eb, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function paintTrack(c, track) {
    const w = W * TILE, h = H * TILE;
    c.fillStyle = '#12301c'; c.fillRect(0, 0, w, h);
    // 草地纹理
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = hash2(x, y);
      c.fillStyle = `rgba(${30 + n * 18 | 0},${70 + n * 28 | 0},${40 + n * 18 | 0},.55)`;
      c.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    const tiles = track?.tiles || [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x];
      if (t === 2) { c.fillStyle = '#080c10'; c.fillRect(x * TILE, y * TILE, TILE, TILE); continue; }
      if (t !== 0) continue;
      const n = hash2(x + 37, y + 91);
      c.fillStyle = `rgb(${54 + n * 10 | 0},${58 + n * 10 | 0},${64 + n * 10 | 0})`;
      c.fillRect(x * TILE, y * TILE, TILE, TILE);
      c.fillStyle = 'rgba(255,255,255,.018)';
      c.fillRect(x * TILE, y * TILE, TILE, 2);
    }
    // 路缘：路面与草地相邻的边画红白相间路肩，让赛道边界一眼可辨。
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== 0) continue;
      const road = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && tiles[yy * W + xx] === 0;
      c.fillStyle = (x + y) % 2 ? 'rgba(226,86,74,.55)' : 'rgba(232,239,248,.42)';
      if (!road(x - 1, y)) c.fillRect(x * TILE, y * TILE, 2, TILE);
      if (!road(x + 1, y)) c.fillRect((x + 1) * TILE - 2, y * TILE, 2, TILE);
      if (!road(x, y - 1)) c.fillRect(x * TILE, y * TILE, TILE, 2);
      if (!road(x, y + 1)) c.fillRect(x * TILE, (y + 1) * TILE - 2, TILE, 2);
    }
    // 中心线
    if (track?.points?.length) {
      c.save(); c.strokeStyle = 'rgba(240,246,255,.30)'; c.lineWidth = 2; c.setLineDash([9, 9]);
      c.beginPath();
      track.points.forEach((p, i) => { if (i === 0) c.moveTo(p.x * TILE, p.y * TILE); else c.lineTo(p.x * TILE, p.y * TILE); });
      c.closePath(); c.stroke(); c.setLineDash([]);
      // 起点格子线
      const sx = track.start.x * TILE, sy = track.start.y * TILE, a = track.start.angle;
      const half = (track.halfWidth || 4) * TILE;
      c.translate(sx, sy); c.rotate(a);
      for (let i = -half, k = 0; i < half; i += 8, k++) {
        c.fillStyle = k % 2 ? '#e8eef7' : '#1a2028';
        c.fillRect(0, i, 6, Math.min(8, half - i));
        c.fillStyle = k % 2 ? '#1a2028' : '#e8eef7';
        c.fillRect(-6, i, 6, Math.min(8, half - i));
      }
      c.restore();
    }
    // 边界压暗
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  /* ==================== 动态绘制 ==================== */
  function drawCar(c, car, t) {
    const X = car.x * TILE, Y = car.y * TILE;
    const col = teamColor(car.team);
    const speed = car.speed || Math.hypot(car.vx || 0, car.vy || 0);
    c.save();
    c.translate(X, Y); c.rotate(car.angle);
    // 影子
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(1, 3, 12, 7, 0, 0, TAU); c.fill();
    // 喷火
    if (car.boosting) {
      const fl = 8 + Math.sin(t * 30) * 3;
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(-10, 0, -10 - fl, 0);
      g.addColorStop(0, 'rgba(255,244,180,.95)'); g.addColorStop(.5, 'rgba(255,140,60,.8)'); g.addColorStop(1, 'rgba(255,80,30,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-8, -4); c.lineTo(-10 - fl, 0); c.lineTo(-8, 4); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-8, -5); c.lineTo(-8 - fl * .7, -2); c.lineTo(-8, -1); c.closePath(); c.fill();
      c.restore();
    }
    // 车轮
    c.fillStyle = '#080c10';
    c.fillRect(-7, -7, 5, 3); c.fillRect(-7, 4, 5, 3);
    c.fillRect(4, -7, 5, 3); c.fillRect(4, 4, 5, 3);
    // 车身
    const g = c.createLinearGradient(-10, -6, 10, 6);
    g.addColorStop(0, col); g.addColorStop(1, '#1a2430');
    c.fillStyle = g;
    if (c.roundRect) { c.beginPath(); c.roundRect(-10, -6, 20, 12, 4); c.fill(); } else c.fillRect(-10, -6, 20, 12);
    c.strokeStyle = 'rgba(4,8,12,.9)'; c.lineWidth = 1.2; c.stroke();
    // 挡风玻璃与车头
    c.fillStyle = 'rgba(225,240,255,.72)'; c.fillRect(2, -4, 4, 8);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(8, -2, 2, 4);
    // 漂移侧滑条
    if (car.drifting) { c.fillStyle = 'rgba(255,210,110,.75)'; c.fillRect(-10, -7.5, 8, 1.6); c.fillRect(-10, 5.9, 8, 1.6); }
    c.restore();
    // 编号/名字
    c.save(); c.font = '700 9px "Segoe UI",sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(4,8,12,.75)'; c.fillText(String(car.team + 1), X, Y + 1);
    c.restore();
    // 速度线
    if (speed > 10) {
      c.save(); c.globalAlpha = clamp((speed - 10) / 10, 0, .6); c.strokeStyle = '#dff4ff'; c.lineWidth = 1;
      const f = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
      for (let i = -1; i <= 1; i += 2) {
        const px = X - f.x * 12 - f.y * i * 5, py = Y - f.y * 12 + f.x * i * 5;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - f.x * 12, py - f.y * 12); c.stroke();
      }
      c.restore();
    }
  }

  function drawTrails(c, st, t) {
    for (const car of st.cars || []) {
      let arr = S.trails.get(car.id);
      if (!arr) { arr = []; S.trails.set(car.id, arr); }
      if (car.drifting || (car.offRoad && (car.speed || 0) > 3)) {
        arr.push({ x: car.x, y: car.y, a: 1, drift: car.drifting });
        if (arr.length > 26) arr.shift();
      }
      for (const p of arr) p.a *= .94;
      for (const p of arr) {
        if (p.a < .04) continue;
        c.fillStyle = p.drift ? `rgba(40,44,52,${p.a * .6})` : `rgba(90,70,40,${p.a * .35})`;
        c.beginPath(); c.arc(p.x * TILE, p.y * TILE, 2.2, 0, TAU); c.fill();
      }
    }
  }

  function drawHud(c, st, t) {
    const allCars = st.cars || [];
    const order = [...allCars].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
      if (a.finished) return -1; if (b.finished) return 1;
      return (b.progress || 0) - (a.progress || 0);
    });
    // 回放里没有“你的车”，HUD 跟随当前领先者。
    const mine = R.enabled ? (order[0] || null) : (allCars.find(x => x.team === 0) || null);
    c.save();
    c.fillStyle = 'rgba(6,10,16,.75)'; pill(c, 12, 12, 250, 58, 9); c.fill();
    c.strokeStyle = 'rgba(111,200,255,.2)'; c.lineWidth = 1; c.stroke();
    c.font = '700 12px "Segoe UI",sans-serif'; c.fillStyle = '#e9eef6';
    c.fillText(`第 ${Math.min((mine?.lap ?? 0) + 1, st.laps || 3)} / ${st.laps || 3} 圈`, 26, 32);
    const pos = mine ? order.findIndex(x => x.id === mine.id) + 1 : 0;
    c.fillStyle = '#8f9bb0'; c.font = '600 10px "Segoe UI",sans-serif';
    c.fillText(R.enabled ? `领先 ${mine?.name || '—'}` : `名次 ${pos} / ${allCars.length}`, 26, 47);
    c.fillStyle = '#e9eef6'; c.font = '700 11px "Segoe UI",sans-serif';
    c.fillText(`极速 ${(mine?.speed ?? 0).toFixed(1)} · 漂移 ${Math.round((mine?.driftCharge ?? 0) * 100)}%`, 26, 63);

    // 喷火能量条
    c.fillStyle = 'rgba(6,10,16,.75)'; pill(c, cv.width - 210, 12, 198, 44, 9); c.fill();
    c.fillStyle = '#8f9bb0'; c.font = '600 10px "Segoe UI",sans-serif';
    c.fillText('喷火能量', cv.width - 198, 29);
    c.fillStyle = '#141c26'; pill(c, cv.width - 198, 35, 174, 8, 4); c.fill();
    c.fillStyle = '#ffd166'; pill(c, cv.width - 198, 35, 174 * clamp(mine?.boostEnergy ?? 0, 0, 1), 8, 4); c.fill();

    if (st.phase === 'countdown') {
      c.textAlign = 'center'; c.font = '800 64px "Segoe UI",sans-serif';
      c.fillStyle = 'rgba(255,255,255,.92)'; c.shadowColor = 'rgba(111,200,255,.9)'; c.shadowBlur = 24;
      const n = Math.ceil(st.countdownLeft || 0);
      c.fillText(n > 0 ? String(n) : 'GO', cv.width / 2, cv.height / 2 + 20);
      c.shadowBlur = 0; c.textAlign = 'start';
    }
    c.restore();
  }

  function pill(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  const ZOOM = 2.1;
  function focusCar(st, positions) {
    const cars = st?.cars || [];
    if (!cars.length) return null;
    const pick = !R.enabled ? (cars.find(c => c.team === 0) || cars[0])
      : [...cars].sort((a, b) => {
        if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
        return (b.progress || 0) - (a.progress || 0);
      })[0];
    return positions?.cars?.get(pick.id) || pick;
  }
  function updateCamera(st, positions, t) {
    const target = focusCar(st, positions);
    const tx = target ? target.x * TILE : W * TILE / 2;
    const ty = target ? target.y * TILE : H * TILE / 2;
    if (!S.cam.init) { S.cam.x = tx; S.cam.y = ty; S.cam.init = true; }
    else {
      const dt = clamp(t - (S.cam.t || t), 0, 0.05);
      const k = 1 - Math.exp(-10 * Math.max(dt, 0.001));
      S.cam.x += (tx - S.cam.x) * k;
      S.cam.y += (ty - S.cam.y) * k;
    }
    S.cam.t = t;
    const halfW = cv.width / (2 * ZOOM), halfH = cv.height / (2 * ZOOM);
    const worldW = W * TILE, worldH = H * TILE;
    S.cam.x = worldW <= halfW * 2 ? worldW / 2 : clamp(S.cam.x, halfW, worldW - halfW);
    S.cam.y = worldH <= halfH * 2 ? worldH / 2 : clamp(S.cam.y, halfH, worldH - halfH);
  }
  function drawMinimap(c, st) {
    const mw = 196, mh = Math.round(mw * H / W);
    const x = cv.width - mw - 14, y = cv.height - mh - 14;
    c.save();
    c.fillStyle = 'rgba(6,10,16,.8)'; pill(c, x - 6, y - 6, mw + 12, mh + 12, 8); c.fill();
    c.strokeStyle = 'rgba(111,200,255,.22)'; c.lineWidth = 1; c.stroke();
    c.drawImage(sceneLayer(st), x, y, mw, mh);
    const focus = focusCar(st);
    const cp = st.track?.checkpoints?.[focus?.nextCp];
    if (cp) {
      c.fillStyle = 'rgba(255,209,102,.95)';
      c.beginPath(); c.arc(x + cp.x / W * mw, y + cp.y / H * mh, 2.6, 0, TAU); c.fill();
    }
    for (const car of st.cars || []) {
      c.fillStyle = teamColor(car.team);
      c.beginPath(); c.arc(x + car.x / W * mw, y + car.y / H * mh, 3.2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = 1; c.stroke();
    }
    const halfW = cv.width / (2 * ZOOM), halfH = cv.height / (2 * ZOOM);
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.strokeRect(
      x + (S.cam.x - halfW) / W / TILE * mw, y + (S.cam.y - halfH) / H / TILE * mh,
      (halfW * 2) / W / TILE * mw, (halfH * 2) / H / TILE * mh);
    c.restore();
  }

  function drawStage(c, st, positions, t) {
    if (!st) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = '#070b10'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#8f9bb0'; c.font = '600 15px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText(R.loading ? (R.loadingText || '正在载入回放…') : '暂无对局', cv.width / 2, cv.height / 2); c.textAlign = 'start'; return;
    }
    if (st.track?.width && st.track?.height) setDims(st.track.width, st.track.height);
    updateCamera(st, positions, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#070b10'; c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(ZOOM, 0, 0, ZOOM, cv.width / 2 - S.cam.x * ZOOM, cv.height / 2 - S.cam.y * ZOOM);
    c.drawImage(sceneLayer(st), 0, 0);
    drawTrails(c, st, t);
    const cars = st.cars || [];
    const order = [...cars].sort((a, b) => (a.team === 0 ? 1 : 0) - (b.team === 0 ? 1 : 0));
    for (const car of order) {
      const p = positions?.cars?.get(car.id) || car;
      drawCar(c, p, t);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    drawHud(c, st, t);
    drawMinimap(c, st);

    if (S.banner && performance.now() < S.bannerUntil) {
      const left = (S.bannerUntil - performance.now()) / 900;
      c.save(); c.globalAlpha = clamp(left, 0, 1);
      c.font = '800 30px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.96)'; c.shadowColor = 'rgba(111,200,255,.9)'; c.shadowBlur = 26;
      c.fillText(S.banner, cv.width / 2, cv.height / 2 - 8); c.restore(); c.textAlign = 'start';
    }
    if (st.status === 'finished') {
      const X = cv.width / 2, Y = cv.height / 2;
      c.fillStyle = 'rgba(5,9,14,.72)'; c.fillRect(0, 0, cv.width, cv.height);
      c.save(); c.textAlign = 'center';
      c.font = '800 38px "Segoe UI",sans-serif';
      c.fillStyle = st.winner === null ? '#e0c873' : teamColor(st.winner);
      c.fillText(st.winner === null ? '平 局' : `${st.players?.[st.winner]?.name || '?'} 获胜`, X, Y - 6);
      c.font = '600 15px "Segoe UI",sans-serif'; c.fillStyle = '#c3ccd9';
      c.fillText(st.reason || '', X, Y + 28);
      c.font = '600 13px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
      c.fillText((st.cars || []).map(car => `${car.name} · ${car.lap} 圈`).join('   '), X, Y + 54);
      c.restore(); c.textAlign = 'start';
    }
  }

  /* ==================== 本地输入 ==================== */
  function throttle() { return S.keys.has('KeyW') || S.keys.has('ArrowUp') ? 1 : (S.keys.has('KeyS') || S.keys.has('ArrowDown') ? -1 : 0); }
  function steer() { return S.keys.has('KeyA') || S.keys.has('ArrowLeft') ? -1 : (S.keys.has('KeyD') || S.keys.has('ArrowRight') ? 1 : 0); }
  async function sendInput() {
    if (S.mode !== 'local' || R.enabled || !S.match || S.state?.status !== 'playing') return;
    api(`/api/matches/${S.match}/step`, {
      input: { throttle: throttle(), steer: steer(), drift: S.keys.has('Space'), boost: S.keys.has('ShiftLeft') || S.keys.has('ShiftRight') },
    }, S.token).catch(() => {});
  }
  async function fetchState() {
    if (!S.match) return;
    try {
      const next = await api(`/api/matches/${S.match}`, undefined, S.token);
      if (S.state && S.state.id === next.id) S.prevState = S.state;
      S.state = next; handleEvents(next); S.lastTs = performance.now();
    } catch {}
  }
  function handleEvents(st) {
    for (const e of st.events || []) {
      if (S.events.has(e.id)) continue;
      S.events.add(e.id);
      if (['lap', 'collision', 'finish', 'go', 'drift', 'collision'].includes(e.type)) {
        if (e.text) S.log.push({ t: e.t, text: e.text, type: e.type });
        if (e.type === 'lap' || e.type === 'finish') { S.banner = e.text || ''; S.bannerUntil = performance.now() + 1400; }
      }
      if (S.log.length > 60) S.log.shift();
    }
    if (S.events.size > 900) S.events = new Set([...S.events].slice(-300));
  }
  async function createLocalMatch() {
    const res = await api('/api/matches', {
      mode: 'local', seed: Math.floor(Math.random() * 1e9),
      players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }],
    }, '');
    S.match = res.match; S.token = res.seats[0]?.token || null; S.mode = 'local';
    S.state = res.state; S.prevState = null; S.log = []; S.events.clear(); S.trails.clear(); S.cam.init = false;
    S.banner = null; S.bannerUntil = 0;
  }

  /* ==================== 侧栏 ==================== */
  const lastHtml = new Map();
  function setHtml(id, html) {
    if (lastHtml.get(id) === html) return false;
    lastHtml.set(id, html); $(id).innerHTML = html; return true;
  }
  function progressText(car, length) {
    if (!car) return '—';
    const L = Number(length) || 0, p = car.progress ?? 0;
    if (!L) return `${p.toFixed(0)} 格`;
    return `${Math.floor(p / L)} 圈 ${Math.round(p % L)} / ${L.toFixed(0)} 格`;
  }
  function carRow(car, mine = false) {
    return `<div class="carrow${mine ? ' me' : ''}">
      <span class="idx" style="color:${teamColor(car.team)}">${car.team + 1}</span>
      <span class="un">${esc(car.name || '')}</span>
      <span class="lap">${car.lap} 圈</span>
      <span class="sp">${(car.speed || 0).toFixed(1)} 格/s</span>
    </div>`;
  }
  function renderSide() {
    const st = R.enabled ? replayState() : S.state;
    if (!st) {
      setHtml('matchCard', '<h3>对局</h3><small>等待服务端…</small>');
      for (const id of ['timeCard', 'carCard', 'rivalCard', 'statsCard', 'logCard', 'legend']) setHtml(id, '');
      return;
    }
    const cars = st.cars || [];
    const mine = cars.find(c => c.team === 0);
    const rival = cars.find(c => c.team === 1);
    const order = [...cars].sort((a, b) => (b.progress || 0) - (a.progress || 0));
    const pos = mine ? order.findIndex(c => c.id === mine.id) + 1 : 0;

    setHtml('matchCard', `<h3>对局</h3>
      <div class="scoreboard">${(st.players || []).map((p, i) => `<div class="prow">
        <span class="dot" style="background:${teamColor(i)}"></span><span class="nm">${esc(p.name || '')}</span>
        <span class="wins">${(cars.find(c => c.team === i)?.lap ?? 0)}</span></div>`).join('')}</div>
      <div class="row"><span class="k">赛道</span><span class="v">${st.track?.length ? st.track.length.toFixed(0) + ' 格' : '—'} · 半宽 ${st.track?.halfWidth?.toFixed(1) || '?'}</span></div>
      <div class="row"><span class="k">圈数</span><span class="v">${mine?.lap ?? 0} / ${st.laps || 3} · 名次 ${pos}</span></div>`);

    const left = st.timeLeft ?? 0;
    setHtml('timeCard', `<h3>比赛时间</h3>
      <div class="row"><span class="k">剩余</span><span class="v timebig ${left <= 10 ? 'danger' : left <= 30 ? 'soon' : ''}">${left.toFixed(1)}s</span></div>
      <div class="floodbar"><i style="width:${(clamp(left / 150, 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">阶段</span><span class="v">${st.phase === 'countdown' ? '倒计时' : st.phase === 'finished' ? '结束' : '比赛中'}</span></div>`);

    setHtml('carCard', `<h3>${R.enabled ? '0 号车' : '你的车'}</h3>${mine ? carRow(mine, !R.enabled) : '<small>—</small>'}
      <div class="row"><span class="k">漂移蓄能</span><span class="v">${Math.round((mine?.driftCharge ?? 0) * 100)}%</span></div>
      <div class="floodbar"><i style="width:${(clamp(mine?.driftCharge ?? 0, 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">喷火能量</span><span class="v">${Math.round((mine?.boostEnergy ?? 0) * 100)}%</span></div>
      <div class="floodbar boost"><i style="width:${(clamp(mine?.boostEnergy ?? 0, 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">最好单圈</span><span class="v">${mine?.bestLap ? mine.bestLap.toFixed(2) + 's' : '—'}</span></div>`);

    setHtml('rivalCard', `<h3>对手</h3>${rival ? carRow(rival) : '<small>—</small>'}
      <div class="row"><span class="k">进度</span><span class="v">${progressText(rival, st.track?.length)}</span></div>
      <div class="row"><span class="k">漂移 / 喷火</span><span class="v">${Math.round((rival?.driftCharge ?? 0) * 100)}% / ${Math.round((rival?.boostEnergy ?? 0) * 100)}%</span></div>`);

    setHtml('statsCard', `<h3>比赛数据</h3>
      <div class="row"><span class="k">喷火次数</span><span class="v">${mine?.boosts ?? 0} : ${rival?.boosts ?? 0}</span></div>
      <div class="row"><span class="k">漂移时长</span><span class="v">${(mine?.driftTime ?? 0).toFixed(1)}s : ${(rival?.driftTime ?? 0).toFixed(1)}s</span></div>
      <div class="row"><span class="k">碰撞</span><span class="v">${mine?.collisions ?? 0} : ${rival?.collisions ?? 0}</span></div>`);

    const logs = (st === S.state ? S.log : replayLog()).slice(-14).reverse();
    setHtml('logCard', `<h3>战况</h3><div class="log">${logs.length
      ? logs.map(l => `<div class="${l.type === 'lap' ? 'lap' : l.type === 'collision' ? 'hit' : l.type === 'finish' ? 'finish' : ''}"><i>${l.t != null ? l.t.toFixed(1) + 's' : ''}</i><span>${esc(l.text)}</span></div>`).join('')
      : '<div><i></i><span style="color:#8f9bb0">等待发车…</span></div>'}</div>`);

    setHtml('legend', R.enabled
      ? '<b>回放</b> 拖动进度条跳转 · 播放/暂停 · 0.5×–4× 变速<br>逐物理帧回放（20 Hz）'
      : '<b>操作</b> W/S 油门·刹车 · A/D 转向 · 空格 漂移 · Shift 喷火<br><b>规则</b> 3 圈 · 漂移蓄能 · 车车碰撞');
  }

  /* ==================== 主循环 ==================== */
  function loop(ts) {
    const t = ts / 1000;
    if (R.enabled) {
      replayAdvance(ts - S.lastFrame); renderSide();
      drawStage(ctx, replayState(), replayPositions(), t);
    } else {
      if (S.mode === 'local' && ts - S.inputAt >= 33) { S.inputAt = ts; sendInput(); }
      renderSide();
      if (S.state) {
        const a = clamp((performance.now() - S.lastTs) / S.poll, 0, 1);
        drawStage(ctx, S.state, S.prevState ? blend(S.prevState, S.state, a) : null, t);
      } else drawStage(ctx, null, null, t);
    }
    S.lastFrame = ts; requestAnimationFrame(loop);
  }

  /* ==================== 回放 ==================== */
  function blend(prev, st, a) {
    if (!prev) return null;
    const prevCars = new Map((prev.cars || []).map(c => [c.id, c]));
    const cars = new Map();
    for (const c of st.cars || []) {
      const p = prevCars.get(c.id);
      cars.set(c.id, p ? { ...c, x: lerp(p.x, c.x, a), y: lerp(p.y, c.y, a), angle: p.angle + normAngle(c.angle - p.angle) * a } : c);
    }
    return { cars };
  }
  const replayState = () => R.data?.frames?.[clamp(R.index, 0, (R.data?.frames?.length || 1) - 1)] || null;
  const replayFrameMs = () => Number(R.frameMs) > 0 ? Number(R.frameMs) : 50;
  const replayAlpha = () => (!R.playing || !R.data) ? 0 : clamp(R.clock / replayFrameMs(), 0, 1);
  function replayPositions() {
    const frames = R.data?.frames; if (!frames || !frames.length) return null;
    const i = clamp(R.index, 0, frames.length - 1); if (i + 1 >= frames.length) return null;
    return blend(frames[i], frames[i + 1], replayAlpha());
  }
  function replayAdvance(dt) {
    if (!R.playing || !R.data) return;
    const frameMs = replayFrameMs(); R.clock += dt * (R.speed || 1);
    const step = Math.floor(R.clock / frameMs); if (step <= 0) return;
    R.clock -= step * frameMs;
    const last = R.data.frames.length - 1; R.index = Math.min(last, R.index + step);
    if (R.index >= last) R.playing = false;
    const seek = $('rSeek'); if (seek) seek.value = String(R.index);
    const rf = $('rf'); if (rf) rf.textContent = String(R.index);
    if (!R.playing) renderReplayPanel();
  }
  function replayLog() {
    const st = replayState(); if (!st) return [];
    return (st.events || []).filter(e => e.frame <= st.frame && ['lap', 'collision', 'finish', 'go'].includes(e.type)).slice(-14).map(e => ({ t: e.t, text: e.text || e.type, type: e.type }));
  }

  async function loadRuns() {
    try {
      const r = await api('/api/arena/runs'); R.runs = r.runs || [];
      if (!R.run) R.run = r.activeRun || R.runs[0]?.run || null;
      renderRuns(); await loadRunMeta();
    } catch (e) { R.error = e.message; renderRuns(); }
  }
  function renderRuns() {
    $('runCard').innerHTML = `<h3>比赛系列</h3><div class="runs">${R.runs.length ? R.runs.map(r => {
      const labels = r.labels ? Object.values(r.labels).join(' vs ') : '';
      return `<button data-run="${esc(r.run)}" class="${R.run === r.run ? 'on' : ''}">${esc(r.run)}<small>${esc(labels)} · ${r.games} 局 · ${esc(r.phase || '')}${r.completed ? ' · 已完成' : ''}</small></button>`;
    }).join('') : `<small style="color:#8f9bb0">${esc(R.error || '还没有已归档的系列赛。')}</small>`}</div>`;
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
      : '<small style="color:#8f9bb0">暂无对局</small>'}`;
    for (const el of $('gameCard').querySelectorAll('.games button')) el.onclick = () => loadGame(el.dataset.g);
  }
  async function loadGame(id) {
    R.id = id; R.loading = true; R.loadingText = '正在载入回放…'; R.error = '';
    renderGameList(); renderReplayPanel();
    const ticket = ++R.ticket;
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}`);
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).error || '回放读取失败');
      const reader = res.body?.getReader(); let text = '';
      if (reader) {
        const dec = new TextDecoder(); let got = 0;
        for (;;) {
          const { done, value } = await reader.read(); if (ticket !== R.ticket) return;
          if (done) break; got += value.length; R.loadingText = `正在载入回放… ${(got / 1048576).toFixed(1)} MB`;
          text += dec.decode(value, { stream: true });
        }
        text += dec.decode();
      } else text = await res.text();
      if (ticket !== R.ticket) return;
      R.data = JSON.parse(text);
      for (const f of R.data.frames || []) { f.track = R.data.track; f.rules = R.data.rules; f.events = R.data.events || []; }
      R.frameMs = Number(R.data?.frameMs) > 0 ? Number(R.data.frameMs) : 50;
      R.index = 0; R.playing = false; R.clock = 0; S.trails.clear(); S.cam.init = false;
      renderGameList();
    } catch (e) { R.error = e.message; }
    finally { if (ticket === R.ticket) R.loading = false; }
    renderReplayPanel();
  }

  function roundLogHtml(st) {
    const cars = st.cars || [];
    return `<div class="rounds">${cars.map(c => `<div><span class="${c.finished ? 'win' : 'draw'}">${esc(c.name)}</span><span>${c.lap} 圈</span><em>${c.bestLap ? c.bestLap.toFixed(2) + 's' : '—'}</em></div>`).join('')}</div>`;
  }

  function renderReplayPanel() {
    const d = R.data;
    if (!d) {
      $('replayCard').innerHTML = `<h3>回放</h3><div class="transport">
        <button disabled>播放</button><input type="range" disabled min="0" max="0" value="0"><div class="speeds">
        ${[0.5, 1, 2, 4].map(s => `<button disabled>${s}×</button>`).join('')}</div></div>
        <small style="color:#8f9bb0">${esc(R.loading ? R.loadingText : (R.error || '选择左侧一局开始播放'))}</small>`;
      $('scoreCard').innerHTML = ''; return;
    }
    const last = Math.max(0, d.frames.length - 1);
    const labels = R.meta?.labels || {};
    const nameOf = i => labels[d.seats?.[i]] || d.seats?.[i] || `#${i}`;
    const finalSt = d.final || ({ winner: d.winner, reason: d.reason, players: [], cars: [] });
    const st = replayState() || finalSt;
    $('replayCard').innerHTML = `<h3>回放 ${esc(d.id)}</h3>
      ${d.technicalFailure ? `<div class="row"><span class="k">技术中断</span><span class="v" style="color:#ff8a6b">${esc(d.technicalFailure)}</span></div>` : ''}
      <div class="transport">
        <button id="rPlay">${R.playing ? '暂停' : '播放'}</button>
        <input type="range" id="rSeek" min="0" max="${last}" value="${R.index}">
        <div class="speeds">${[0.5, 1, 2, 4].map(s => `<button data-s="${s}" class="${R.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
      </div>
      <div class="row"><span class="k">帧</span><span class="v"><span id="rf">${R.index}</span> / ${last}</span></div>
      <div class="row"><span class="k">模拟时间</span><span class="v">${((st.frame || 0) / 20).toFixed(1)}s · ${st.phase === 'countdown' ? '倒计时' : '比赛'}</span></div>
      <div class="row"><span class="k">结果</span><span class="v" style="color:#ffd166">${d.winner === null || d.winner === undefined ? '平局' : esc(nameOf(d.winner)) + ' 胜'}</span></div>`;
    $('rPlay').onclick = () => { R.playing = !R.playing; renderReplayPanel(); };
    $('rSeek').oninput = e => { R.index = Number(e.target.value); R.playing = false; R.clock = 0; $('rf').textContent = String(R.index); };
    for (const b of $('replayCard').querySelectorAll('.speeds button')) b.onclick = () => { R.speed = Number(b.dataset.s); renderReplayPanel(); };
    const results = R.meta?.results || []; const tally = {};
    for (const r of results) if (r.winner !== null && r.winner !== undefined) tally[r.winner] = (tally[r.winner] || 0) + 1;
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
    $('setupCard').style.display = 'none'; lastHtml.clear(); S.trails.clear();
    drawStage(ctx, null, null, 0); renderReplayPanel();
    try { await loadRuns(); } catch (e) { toast(e.message, true); }
    if (runId && (R.runs || []).some(r => r.run === runId) && R.run !== runId) {
      R.run = runId; R.data = null; R.id = null; R.index = 0; R.playing = false;
      renderRuns(); await loadRunMeta();
    }
    const games = R.meta?.games || []; const latest = games[games.length - 1];
    if (latest && !skipLatest) await loadGame(latest.id);
  }
  async function enterLocal() {
    R.enabled = false; R.data = null; R.id = null; R.playing = false; R.error = '';
    $('setupCard').style.display = ''; lastHtml.clear();
    $('runCard').innerHTML = ''; $('gameCard').innerHTML = ''; $('scoreCard').innerHTML = '';
    await createLocalMatch();
  }
  function wireInput() {
    const tracked = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
    addEventListener('keydown', e => { if (tracked.has(e.code)) { e.preventDefault(); S.keys.add(e.code); } });
    addEventListener('keyup', e => { if (tracked.has(e.code)) { e.preventDefault(); S.keys.delete(e.code); } });
    addEventListener('blur', () => S.keys.clear());
  }
  async function init() {
    try { S.catalog = await api('/api/catalog'); setDims(S.catalog?.rules?.width, S.catalog?.rules?.height); } catch { S.catalog = null; }
    $('meta').textContent = `· ${W}×${H} 格 · 3 圈 · 20 Hz · 随机赛道 · 漂移喷火`;
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
        R.index = clamp(Math.floor(at), 0, R.data.frames.length - 1); R.playing = false; R.clock = 0; renderReplayPanel();
      }
    } else await createLocalMatch();
    setInterval(() => { if (R.enabled || S.busy) return; S.busy = true; fetchState().finally(() => { S.busy = false; }); }, S.poll);
  }
  init().catch(e => toast('初始化失败：' + e.message, true));
  window.__racing = { S, R };
})();
