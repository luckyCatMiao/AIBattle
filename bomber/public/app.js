/* 泡泡堂 · BLAST BUDDIES — 程序绘制客户端。
 * 画面上没有任何贴图：地板、硬墙、软墙箱子、人物、炸弹、火焰、道具，
 * 全部是 Canvas 2D 现场画出来的。地图本身的格数由 catalog 决定，
 * 画布尺寸按运行时宽高推导，规则一改客户端不用动一行代码。
 * 对局由服务端推进（20 Hz），本页只做两件事：按节拍上报按键、按 60 fps 画最新快照。 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const TILE = 48;                          // 与服务端 catalog 的 tileSize 同为单位
  const TAU = Math.PI * 2;

  // 四名选手的固定配色。0 是本席（单人时），多人时每人一色。
  const COLORS = ['#76bcce', '#e38978', '#e0b873', '#a9f0dd'];
  const BODY_COLORS = ['#3f7f92', '#94514a', '#8a6a35', '#3e7f6c'];
  const colorOf = owner => COLORS[((owner % COLORS.length) + COLORS.length) % COLORS.length];
  const bodyOf = owner => BODY_COLORS[((owner % BODY_COLORS.length) + BODY_COLORS.length) % BODY_COLORS.length];

  /* 地图尺寸不写死：catalog 是唯一真相。 */
  let W = 15, H = 13;
  function setDims(w, h) {
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    cv.width = W * TILE; cv.height = H * TILE;
  }

  // 每个真人席位的按键表。P1 用空格放弹、P2 用回车、P3 用 U、P4 用小键盘 0，
  // 避免同一物理键同时驱动两名真人。
  const KEYMAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], bomb: ['Space'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], bomb: ['Enter'] },
    { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], bomb: ['KeyU'] },
    { up: ['Numpad8'], down: ['Numpad5'], left: ['Numpad4'], right: ['Numpad6'], bomb: ['Numpad0'] },
  ];

  const S = {
    catalog: null, match: null, token: null, player: 0, mode: 'local',
    tokens: new Map(), humanSeats: new Set(),
    state: null, poll: 0, busy: false, keys: new Set(), inputAt: 0,
    bombSent: new Map(), events: new Set(), banner: null, bannerUntil: 0,
    log: [], round: 0, lastFrame: 0, lastTs: 0, status: '', statusUntil: 0,
    stats: [],
  };
  const R = {
    enabled: false, runs: [], run: null, meta: null, data: null, id: null,
    index: 0, playing: false, speed: 1, clock: 0, loading: false, loadingText: '',
    ticket: 0, error: '', serial: 1, frameMs: 1000,
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // t 秒内的缓动进度，用来做与时间轴绑定的脉冲（冷却提示、水线呼吸灯）
  const pulse = (t, period) => (Math.sin((t / period) * TAU - Math.PI / 2) + 1) / 2;

  function toast(msg, error = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 2800);
  }
  // 同一个 api() 覆盖全站请求；失败一律抛出 Error(message)，调用方只需 try/catch。
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

  /* 席位凭据落 localStorage：刷新页面不用重新建房，也避免把 token 写进 URL。
   * 本地多人时每个真人席位各有一条凭据。 */
  const KEY = 'bomber.seat.v2';
  const saveSeat = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        match: S.match, player: S.player,
        seats: [...S.tokens.entries()],
        humans: [...S.humanSeats],
      }));
    } catch {}
  };
  const loadSeat = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

  /* ==================== 地图几何 ==================== */

  // 人物与箱子都画在格子正中
  const cx = tx => tx * TILE + TILE / 2;
  const cy = ty => ty * TILE + TILE / 2;

  function pill(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
  }

  /* ==================== 绘制 ==================== */

  function drawFloor(c) {
    const g = c.createLinearGradient(0, 0, 0, H * TILE);
    g.addColorStop(0, '#131e29'); g.addColorStop(1, '#0c141c');
    c.fillStyle = g; c.fillRect(0, 0, W * TILE, H * TILE);
    // 棋盘格：让观众能一眼数出格子，而不必去数像素
    c.fillStyle = 'rgba(255,255,255,.022)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0) c.fillRect(x * TILE, y * TILE, TILE, TILE);
    c.strokeStyle = 'rgba(118,188,206,.09)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < W; x++) { c.moveTo(x * TILE + .5, 0); c.lineTo(x * TILE + .5, H * TILE); }
    for (let y = 1; y < H; y++) { c.moveTo(0, y * TILE + .5); c.lineTo(W * TILE, y * TILE + .5); }
    c.stroke();
  }

  // 硬墙：不可摧毁，画成有厚度的石砌块，和内城墙明显区分（这是地图的骨架）
  function drawHard(c, tx, ty) {
    const x = tx * TILE, y = ty * TILE, p = 3;
    c.fillStyle = '#2b3747'; c.fillRect(x + p, y + p, TILE - p * 2, TILE - p * 2);
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x + p, y + p, TILE - p * 2, 5);
    c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(x + p, y + TILE - p - 5, TILE - p * 2, 5);
    c.strokeStyle = '#1d2733'; c.lineWidth = 2;
    c.strokeRect(x + p, y + p, TILE - p * 2, TILE - p * 2);
    c.fillStyle = 'rgba(118,188,206,.18)';
    c.fillRect(x + TILE / 2 - 1.5, y + TILE / 2 - 1.5, 3, 3);
  }

  // 软墙：可炸毁，画成木箱。道具就从它里面掉出来，所以外观要跟硬墙完全不像。
  function drawSoft(c, tx, ty) {
    const x = tx * TILE, y = ty * TILE, p = 4, s = TILE - p * 2;
    c.fillStyle = '#6b4a2e'; pill(c, x + p, y + p, s, s, 5); c.fill();
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(x + p + 3, y + p + 3, s - 6, 6);
    c.strokeStyle = '#3d2a19'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + p + 3, y + p + 3); c.lineTo(x + p + s - 3, y + p + s - 3);
    c.moveTo(x + p + s - 3, y + p + 3); c.lineTo(x + p + 3, y + p + s - 3);
    c.stroke();
    pill(c, x + p, y + p, s, s, 5); c.stroke();
  }

  function drawBomb(c, b, t, rules) {
    const fuseMax = rules?.fuseFrames || 40;
    const p = clamp(b.fuse / fuseMax, 0, 1);
    const X = cx(b.x), Y = cy(b.y), R0 = TILE * .34;
    const owner = colorOf(b.owner);
    // 引信越短越亮越快：这是判断「还能不能过去」的唯一依据，必须一眼看得出
    const urgency = 1 - p;
    const throb = 1 + Math.sin(t * (6 + urgency * 26)) * (.03 + urgency * .11);
    const r = R0 * throb;

    c.save();
    c.fillStyle = 'rgba(0,0,0,.42)';
    c.beginPath(); c.ellipse(X, Y + R0 * .78, r * .95, r * .34, 0, 0, TAU); c.fill();
    if (urgency > .62) {
      c.fillStyle = `rgba(255,110,80,${(urgency - .62) * (0.18 + pulse(t, 0.22) * 0.24)})`;
      c.beginPath(); c.arc(X, Y, r * 2.05, 0, TAU); c.fill();
    }
    const g = c.createRadialGradient(X - r * .32, Y - r * .38, r * .18, X, Y, r);
    g.addColorStop(0, '#5a6577'); g.addColorStop(.55, '#2a3242'); g.addColorStop(1, '#12171f');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, r, 0, TAU); c.fill();
    c.strokeStyle = owner; c.lineWidth = 2; c.globalAlpha = .85;
    c.beginPath(); c.arc(X, Y, r, 0, TAU); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,.30)';
    c.beginPath(); c.arc(X - r * .32, Y - r * .36, r * .19, 0, TAU); c.fill();
    // 引信环：从 12 点开始逆/顺时针各占一半，读起来是一条均匀收紧的圆环
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 4;
    c.beginPath(); c.arc(X, Y, r * 1.42, 0, TAU); c.stroke();
    c.strokeStyle = p > .55 ? '#7fd0ff' : p > .25 ? '#ffd98a' : '#ff7f63';
    c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.arc(X, Y, r * 1.42, -Math.PI / 2, -Math.PI / 2 + TAU * p); c.stroke();
    // 最后 0.4 秒补一个数字，给「来不及了」一个绝对刻度
    if (b.fuse <= 8) {
      c.font = '700 13px "Segoe UI",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff'; c.fillText(String(Math.max(1, Math.ceil(b.fuse / 20))), X, Y + 1);
      c.textBaseline = 'alphabetic'; c.textAlign = 'start';
    }
    c.restore();
  }

  function drawBlast(c, bl, rules) {
    const max = rules?.blastFrames || 12;
    const p = clamp(bl.frames / max, 0, 1);          // 1 → 刚炸开，0 → 即将熄灭
    const X = bl.x * TILE, Y = bl.y * TILE;
    const grow = .55 + .45 * (1 - p);                 // 刚炸开的一瞬略微收缩再铺满，避免整格生硬
    const s = TILE * grow / 2, k = TILE * .26;
    c.save();
    c.globalCompositeOperation = 'lighter';
    // 十字本体：中心圆 + 四臂，叠起来就是一个对称的火十字
    const g = c.createRadialGradient(X + TILE / 2, Y + TILE / 2, 2, X + TILE / 2, Y + TILE / 2, TILE * .78);
    g.addColorStop(0, `rgba(255,255,255,${.92 * p})`);
    g.addColorStop(.34, `rgba(255,226,150,${.80 * p})`);
    g.addColorStop(.68, `rgba(255,142,72,${.52 * p})`);
    g.addColorStop(1, `rgba(255,90,50,0)`);
    c.fillStyle = g;
    pill(c, X + TILE / 2 - s, Y + TILE / 2 - k, s * 2, k * 2, k);
    c.fill();
    pill(c, X + TILE / 2 - k, Y + TILE / 2 - s, k * 2, s * 2, k);
    c.fill();
    c.beginPath(); c.arc(X + TILE / 2, Y + TILE / 2, s, 0, TAU); c.fill();
    // 边缘余烬
    c.strokeStyle = `rgba(255,196,120,${.5 * p})`; c.lineWidth = 2;
    c.beginPath(); c.arc(X + TILE / 2, Y + TILE / 2, s * .92, 0, TAU); c.stroke();
    c.restore();
  }

  function drawDrop(c, d, t) {
    const meta = S.catalog?.powerups?.[d.type] || { rune: '?', color: '#dfe7f5', name: d.type };
    const X = cx(d.x), Y = cy(d.y) + Math.sin(t * 3 + d.x + d.y) * 2.2;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(X, cy(d.y) + TILE * .34, 13, 4.5, 0, 0, TAU); c.fill();
    const g = c.createRadialGradient(X, Y, 2, X, Y, 19);
    g.addColorStop(0, meta.color + 'cc'); g.addColorStop(1, meta.color + '00');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, 19, 0, TAU); c.fill();
    c.fillStyle = 'rgba(10,14,20,.92)'; c.beginPath(); c.arc(X, Y, 12.5, 0, TAU); c.fill();
    c.strokeStyle = meta.color; c.lineWidth = 2;
    c.beginPath(); c.arc(X, Y, 12.5, 0, TAU); c.stroke();
    c.font = '700 14px "Segoe UI",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = meta.color; c.fillText(meta.rune, X, Y + .5);
    c.textBaseline = 'alphabetic'; c.textAlign = 'start';
    c.restore();
  }

  function drawFighter(c, f, st, t) {
    const X = cx(f.px ?? f.x), Y = cy(f.py ?? f.y);
    const col = colorOf(f.owner);
    const bodyCol = bodyOf(f.owner);
    if (!f.alive) {
      // 出局者留一个淡影：观众仍能看出「他倒在哪」，但不与活人混淆
      c.save(); c.globalAlpha = .3;
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(X, Y + 15, 15, 5, 0, 0, TAU); c.fill();
      c.strokeStyle = col; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(X - 11, Y - 11); c.lineTo(X + 11, Y + 11);
      c.moveTo(X + 11, Y - 11); c.lineTo(X - 11, Y + 11);
      c.stroke();
      c.restore();
      return;
    }
    const fac = f.facing >= 0 ? 1 : -1;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.38)';
    c.beginPath(); c.ellipse(X, Y + 16, 15, 5.5, 0, 0, TAU); c.fill();
    if (f.invulnerable) {
      // 出生保护：明暗闪动的护罩，避免观众误判「他明明死了」
      const a = .3 + pulse(t, 0.3) * .34;
      c.strokeStyle = `rgba(206,244,255,${a})`; c.lineWidth = 3;
      c.beginPath(); c.arc(X, Y, 20, 0, TAU); c.stroke();
      c.fillStyle = `rgba(206,244,255,${a * .22})`;
      c.beginPath(); c.arc(X, Y, 20, 0, TAU); c.fill();
    }
    // 身体
    const g = c.createLinearGradient(X, Y - 20, X, Y + 18);
    g.addColorStop(0, bodyCol); g.addColorStop(1, '#171d27');
    c.fillStyle = g;
    pill(c, X - 14, Y - 15, 28, 31, 11); c.fill();
    c.strokeStyle = col; c.lineWidth = 2; pill(c, X - 14, Y - 15, 28, 31, 11); c.stroke();
    // 顶灯：一颗随朝向偏移的眼珠，让「面朝哪边」不用猜
    c.fillStyle = '#0b0e13'; c.beginPath(); c.arc(X, Y - 6, 8.6, 0, TAU); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(X + fac * 3.2, Y - 6, 4.1, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(X + fac * 4.6, Y - 7.6, 1.5, 0, TAU); c.fill();
    // 引信小灯：脚下小格子显示他还剩几颗弹可放
    for (let i = 0; i < f.bombs; i++) {
      const bx = X - (f.bombs - 1) * 3 + i * 6;
      c.fillStyle = i < f.activeBombs ? '#2a3242' : col;
      c.beginPath(); c.arc(bx, Y + 21, 2.1, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawHud(c, st, t) {
    const rules = st.rules || {};
    const roundSec = (st.frame || 0) / (rules.hz || 20);
    const limit = rules.roundTimeLimit || 150;
    const left = Math.max(0, limit - roundSec);
    const players = st.players || [];
    c.save();
    c.font = '600 13px "Segoe UI",sans-serif';
    // 左上：第几局 + 每个席位的胜局数
    const width = 92 + players.length * 52;
    c.fillStyle = 'rgba(0,0,0,.55)'; pill(c, 12, 12, width, 30, 8); c.fill();
    c.fillStyle = '#8f9bb0';
    c.fillText(`第 ${st.round} 局`, 24, 32);
    let x = 24 + 66;
    for (let i = 0; i < players.length; i++) {
      c.fillStyle = colorOf(i);
      c.beginPath(); c.arc(x, 27, 5, 0, TAU); c.fill();
      c.fillStyle = '#e8ecf4'; c.textAlign = 'right';
      c.fillText(String(players[i]?.wins ?? 0), x + 22, 32);
      c.textAlign = 'start';
      x += 52;
    }
    // 右上：本局剩余时间（没有涨水后，这是唯一的硬性节奏）
    c.fillStyle = 'rgba(0,0,0,.55)'; pill(c, W * TILE - 168, 12, 156, 30, 8); c.fill();
    c.fillStyle = '#8f9bb0'; c.fillText('本局', W * TILE - 156, 32);
    c.fillStyle = left <= 15 ? '#e0b873' : '#e8ecf4';
    c.font = '700 15px "Segoe UI",sans-serif'; c.textAlign = 'right';
    c.fillText(`${left.toFixed(1)}s`, W * TILE - 24, 32);
    c.textAlign = 'start'; c.restore();

    // 最后 10 秒居中提醒：时间到仍未分出胜负会判平局
    if (st.status === 'playing' && left <= 10) {
      c.save();
      c.font = '700 22px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = left <= 5 ? '#e0b873' : 'rgba(232,236,244,.72)';
      if (left <= 5) { c.shadowColor = 'rgba(224,184,115,.9)'; c.shadowBlur = 18 + pulse(t, 0.45) * 14; }
      c.fillText(`${left <= 5 ? '时间到！' : '剩余'} ${left.toFixed(1)}s`, W * TILE / 2, 46);
      c.restore();
      c.textAlign = 'start';
    }
  }

  /* 单一绘制入口：练习与回放共用，保证两边看到的规则表现完全一致。
   * `positions` 只提供人物的插值坐标；地图、炸弹、火焰等离散状态始终取自当前快照。 */
  function drawStage(c, st, t, positions = null) {
    if (!st) {
      c.clearRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#0b0f16'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#8f9bb0'; c.font = '600 15px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText(R.loading ? (R.loadingText || '正在载入回放…') : '暂无对局', cv.width / 2, cv.height / 2);
      c.textAlign = 'start';
      return;
    }
    // 必须在任何绘制之前：改画布尺寸会顺带清空它，放在后面等于把地板擦掉一次。
    if (st.map?.width && st.map?.height) setDims(st.map.width, st.map.height);
    c.clearRect(0, 0, W * TILE, H * TILE);
    drawFloor(c);
    const tiles = st.map?.tiles || [];
    // 地板 → 硬墙 → 软墙 → 道具 → 炸弹 → 火焰 → 人物，顺序即层叠关系
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = tiles[y * W + x];
      if (v === 1) drawHard(c, x, y);
      else if (v === 2) drawSoft(c, x, y);
    }
    for (const d of st.drops || []) drawDrop(c, d, t);
    for (const b of st.bombs || []) drawBomb(c, b, t, st.rules);
    for (const bl of st.blasts || []) drawBlast(c, bl, st.rules);
    // 电脑先画，真人压在最上面，混战中始终看得见真人角色
    const fs = (st.fighters || []).slice().sort((a, b) =>
      (S.humanSeats.has(a.owner) ? 1 : 0) - (S.humanSeats.has(b.owner) ? 1 : 0));
    const moved = positions;
    for (const f of fs) drawFighter(c, moved ? moved[f.owner] || f : f, st, t);
    drawHud(c, st, t);
    if (S.banner && performance.now() < S.bannerUntil) {
      const left = (S.bannerUntil - performance.now()) / 700;
      c.save();
      c.globalAlpha = clamp(left, 0, 1);
      c.font = '700 34px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.94)'; c.shadowColor = 'rgba(118,188,206,.9)'; c.shadowBlur = 26;
      c.fillText(S.banner, W * TILE / 2, H * TILE / 2 - 10);
      c.restore();
      c.textAlign = 'start';
    }
    // 结算遮罩：整块压暗，避免「还在打」的错觉
    if (st.status === 'finished') {
      const X = W * TILE / 2, Y = H * TILE / 2;
      c.fillStyle = 'rgba(7,10,16,.62)'; c.fillRect(0, 0, W * TILE, H * TILE);
      c.save();
      c.textAlign = 'center';
      c.font = '700 40px "Segoe UI",sans-serif';
      c.fillStyle = st.winner === null ? '#e0b873' : colorOf(st.winner);
      c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 18;
      c.fillText(st.winner === null ? '平 局' : `${(st.players?.[st.winner]?.name) || '?'} 获胜`, X, Y - 6);
      c.shadowBlur = 0;
      c.font = '600 15px "Segoe UI",sans-serif'; c.fillStyle = '#c3ccd9';
      // 画布上写的是纯文本，不走 HTML，所以不需要转义
      c.fillText(st.reason || '', X, Y + 28);
      const line = (st.players || []).map(p => `${p.name} ${p.wins ?? 0}`).join('  ·  ');
      c.font = '600 13px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
      c.fillText(line, X, Y + 54);
      c.restore();
      c.textAlign = 'start';
    }
  }

  /* ==================== 练习局：键盘 → 服务端 ==================== */

  // 服务端的 dir 是绝对方位（U/D/L/R），不是相对朝向。
  // 每个真人席位按自己的按键表读取；真人席位的顺序与座位 0..N-1 一致。
  function readInput(seat) {
    const map = KEYMAPS[seat % KEYMAPS.length];
    const held = keys => keys.some(k => S.keys.has(k));
    const up = held(map.up), down = held(map.down), left = held(map.left), right = held(map.right);
    let dir = 'N';
    if (up && !down) dir = 'U';
    else if (down && !up) dir = 'D';
    else if (left && !right) dir = 'L';
    else if (right && !left) dir = 'R';
    const bombHeld = held(map.bomb);
    // 放弹只认「按下」这一次：服务端用 inputHistory 做上升沿判定，
    // 我们多发一帧反而会把边沿吃掉，所以按下后必须等松开才允许再报一次。
    const btn = bombHeld && !S.bombSent.get(seat) ? 'BOMB' : null;
    if (btn) S.bombSent.set(seat, true); else if (!bombHeld) S.bombSent.set(seat, false);
    return { dir, btn };
  }

  async function sendInput() {
    if (S.mode !== 'local' || R.enabled || !S.match) return;
    if (!S.state || S.state.status !== 'playing') return;
    // 发后不管：现场对局服务端按实时时钟推进，等回包只会把渲染主循环拖慢。
    for (const seat of S.humanSeats) {
      const token = S.tokens.get(seat);
      if (!token) continue;
      api(`/api/matches/${S.match}/step`, { input: readInput(seat) }, token).catch(() => {});
    }
  }

  async function fetchState() {
    if (!S.match) return;
    try {
      const next = await api(`/api/matches/${S.match}`);
      if (S.state && S.state.id === next.id) S.prevState = S.state;
      S.state = next;
      handleEvents(next);
      S.lastTs = performance.now();
    } catch { /* 轮询失败静默重试，网络抖动不该打断练习 */ }
  }

  // 插值只作用于位置（px/py）。炸弹引信、火焰帧数这些离散量一律取当前快照，
  // 否则画面上的火焰会比判定晚半帧消失，看起来像「穿火没死」。
  // prev -> st：现场模式用上一份服务端快照补到当前快照。
  function interpolate(prev, st, a) {
    if (!prev || prev.id !== st.id || prev.round !== st.round) return null;
    const out = {};
    for (const f of st.fighters || []) {
      const p = (prev.fighters || [])[f.owner];
      out[f.owner] = p && p.alive && f.alive
        ? { ...f, px: lerp(p.px, f.px, a), py: lerp(p.py, f.py, a) }
        : f;
    }
    return out;
  }

  // st -> next：回放模式用当前存档帧补向下一帧。
  // 离散状态仍显示 st，只有人物坐标朝 next 前进；跨局不插值，避免换局瞬移。
  function interpolateAhead(st, next, a) {
    if (!next || next.round !== st.round || a <= 0) return null;
    const out = {};
    for (const f of st.fighters || []) {
      const n = (next.fighters || [])[f.owner];
      out[f.owner] = n && n.alive && f.alive
        ? { ...f, px: lerp(f.px, n.px, a), py: lerp(f.py, n.py, a) }
        : f;
    }
    return out;
  }

  /* 事件去重：服务端每帧都回传最近 150 条事件，用 id 集合记下已播过的，
   * 只对新事件弹横幅/写日志，避免同一句话反复闪。 */
  function handleEvents(st) {
    const list = st.events || [];
    for (const e of list) {
      if (S.events.has(e.id)) continue;
      S.events.add(e.id);
      if (e.type === 'round') { S.banner = e.text || ''; S.bannerUntil = performance.now() + 1200; S.log = []; S.events.clear(); }
      else if (e.type === 'roundEnd' || e.type === 'matchEnd') { S.banner = e.text || ''; S.bannerUntil = performance.now() + 2400; }
      if (e.text) { S.log.push({ t: e.t, text: e.text, type: e.type }); if (S.log.length > 40) S.log.shift(); }
    }
    if (S.events.size > 900) S.events = new Set([...S.events].slice(-300));
  }

  async function createLocalMatch() {
    const total = clamp(Number($('playerCount')?.value || 2), 2, 4);
    const humans = clamp(Number($('humanCount')?.value || total), 1, total);
    const players = Array.from({ length: total }, (_, i) => i < humans
      ? { name: `玩家 ${i + 1}`, kind: 'human' }
      : { name: `练习电脑 ${i + 1}`, kind: 'bot' });
    const res = await api('/api/matches', {
      mode: 'local',
      seed: Math.floor(Math.random() * 1e6),
      players,
    }, '');
    S.match = res.match;
    S.tokens = new Map((res.seats || []).map(s => [s.player, s.token]));
    S.humanSeats = new Set(S.tokens.keys());
    S.player = Math.min(...S.humanSeats);
    S.token = S.tokens.get(S.player) || null;
    S.mode = 'local'; S.state = res.state; S.prevState = null;
    S.bombSent = new Map();
    S.log = []; S.events.clear(); S.banner = null; S.bannerUntil = 0;
    updateSetupHint(total, humans);
    saveSeat();
  }

  function updateSetupHint(total, humans) {
    const map = KEYMAPS;
    const lines = [];
    for (let i = 0; i < humans; i++) {
      const k = map[i % map.length];
      const label = k.up[0].startsWith('Arrow') ? '方向键'
        : k.up[0].startsWith('Numpad') ? '小键盘 8/5/4/6'
        : k.up[0].replace('Key', '') + '/' + k.left[0].replace('Key', '') + '/' + k.down[0].replace('Key', '') + '/' + k.right[0].replace('Key', '');
      const bomb = k.bomb[0] === 'Space' ? '空格' : k.bomb[0] === 'Enter' ? '回车' : k.bomb[0].replace('Key', '').replace('Numpad', '小键盘 ');
      lines.push(`玩家 ${i + 1}：${label} + ${bomb}`);
    }
    for (let i = humans; i < total; i++) lines.push(`电脑 ${i + 1}：自动`);
    $('setupHint').textContent = lines.join(' · ');
  }

  /* ==================== 侧栏 ==================== */

  function levelBars(f, rules) {
    const bMax = rules?.bombsMax || 6, fMax = rules?.blastMax || 6;
    const spMax = Math.max(1, (rules?.framesPerTile || 6) - (rules?.framesPerTileMin || 3));
    return `<div class="levels">
      <span>弹 <b>${f.bombs}</b>/${bMax}</span>
      <span>火 <b>${f.blast}</b>/${fMax}</span>
      <span>速 <b>${f.speed}</b>/${spMax}</span>
    </div>`;
  }

  function sideBlock(st, f, i) {
    const p = st.players?.[i] || {};
    const name = esc(p.name || `席位 ${i + 1}`);
    const tag = p.kind === 'bot' ? '练习电脑' : p.kind === 'api' ? '程序选手' : '真人';
    const color = colorOf(i);
    if (!f) return `<div class="pside${p.alive === false ? ' dead' : ''}"><span class="dot" style="background:${color}"></span><span class="nm">${name}</span><span class="tag">${tag}</span></div>`;
    return `<div class="pside${f.alive ? '' : ' dead'}">
      <span class="dot" style="background:${color}"></span>
      <span class="nm">${name}</span>
      <span class="tag">${f.alive ? `场上弹 ${f.activeBombs}` : '已出局'}</span>
    </div>${levelBars(f, st.rules)}`;
  }

  function renderSide() {
    const st = R.enabled ? replayState() : S.state;
    if (!st) {
      $('matchCard').innerHTML = '<h3>对局</h3><small>等待服务端…</small>';
      $('timeCard').innerHTML = ''; $('fighterCard').innerHTML = ''; $('logCard').innerHTML = '';
      $('legend').innerHTML = '';
      return;
    }
    const rules = st.rules || {};
    const pl = st.players || [];
    const fins = st.fighters || [];
    const roundSec = (st.frame || 0) / (rules.hz || 20);
    const limit = rules.roundTimeLimit || 150;
    const left = Math.max(0, limit - roundSec);

    $('matchCard').innerHTML = `<h3>对局</h3>
      <div class="scoreboard">
        ${pl.map((p, i) => `<div class="prow${fins[i]?.alive ? '' : ' dead'}">
          <span class="dot" style="background:${colorOf(i)}"></span>
          <span class="nm">${esc(p.name || ('席位 ' + (i + 1)))}</span>
          <span class="wins">${p.wins ?? 0}</span>
        </div>`).join('')}
      </div>
      <div class="row"><span class="k">第几局</span><span class="v">${st.round} / ${rules.maxRounds || 5}</span></div>
      <div class="row"><span class="k">状态</span><span class="v">${st.status === 'playing' ? '进行中' : '已结束'}</span></div>
      <div class="row"><span class="k">本局帧数</span><span class="v">${st.frame} · ${roundSec.toFixed(1)}s</span></div>
      ${st.reason ? `<div class="row"><span class="k">结算</span><span class="v" style="color:#e0b873">${esc(st.reason)}</span></div>` : ''}`;

    const barPct = clamp(left / limit, 0, 1) * 100;
    const cls = left <= 10 ? 'danger' : left <= 30 ? 'soon' : '';
    $('timeCard').innerHTML = `<h3>本局时间</h3>
      ${st.status === 'playing' ? `
        <div class="row"><span class="k">剩余</span><span class="v timebig ${cls}">${left.toFixed(1)}s</span></div>` : ''}
      <div class="floodbar"><i style="width:${barPct.toFixed(1)}%"></i></div>
      <div class="row"><span class="k">单局上限</span><span class="v">${limit}s</span></div>
      <div class="row"><span class="k">时间到</span><span class="v">仍有多人存活即平局</span></div>`;

    $('fighterCard').innerHTML = `<h3>选手</h3>${pl.map((_, i) =>
      sideBlock(st, fins[i], i) + (i < pl.length - 1 ? '<div class="sep"></div>' : '')).join('')}`;

    // 日志倒序：最新的在最上面，观众不用追着滚
    const logs = (st === S.state ? S.log : replayLog()).slice(-14).reverse();
    $('logCard').innerHTML = `<h3>战况</h3><div class="log">${logs.length
      ? logs.map(l => `<div class="${l.type === 'death' ? 'death' : l.type === 'pickup' || l.type === 'drop' ? 'flood' : ''}"><i>${l.t != null ? l.t.toFixed(1) + 's' : ''}</i><span>${esc(l.text)}</span></div>`).join('')
      : '<div><i></i><span style="color:#8f9bb0">等待开局…</span></div>'}</div>`;

    $('legend').innerHTML = R.enabled
      ? '<b>回放</b> 拖动进度条跳转 · 播放/暂停 · 0.5×–4× 变速<br>逐物理帧回放（20 Hz）'
      : (S.humanSeats.size
        ? [...S.humanSeats].map(seat => `<b>玩家 ${seat + 1}</b> ${keyHint(seat)}`).join('<br>')
        : '<b>键盘</b> 见上方本地多人设置');
    $('dropLegend').innerHTML = '<b>道具</b> 炸毁木箱有 55% 概率掉落：✦ 炸弹 +1 · ✸ 火力 +1 · ➤ 速度 +1。火焰会烧毁地上的道具，踩上去即拾取。';
  }

  function keyHint(seat) {
    const k = KEYMAPS[seat % KEYMAPS.length];
    const label = k.up[0].startsWith('Arrow') ? '方向键'
      : k.up[0].startsWith('Numpad') ? '小键盘 8/5/4/6'
      : k.up[0].replace('Key', '') + k.left[0].replace('Key', '') + k.down[0].replace('Key', '') + k.right[0].replace('Key', '');
    const bomb = k.bomb[0] === 'Space' ? '空格' : k.bomb[0] === 'Enter' ? '回车' : k.bomb[0].replace('Key', '').replace('Numpad', '小键盘 ');
    return `移动 ${label} · 放弹 ${bomb}`;
  }

  /* ==================== 主循环 ==================== */

  function loop(ts) {
    const t = ts / 1000;
    const dt = S.lastFrame ? Math.min(64, ts - S.lastFrame) : 16;
    S.lastFrame = ts;
    if (R.enabled) {
      replayAdvance(dt);
      renderSide();
      drawStage(ctx, replayState(), t, replayPositions());
    } else {
      // 输入采样节流到 30 ms：比服务端的 50 ms 推进更密，保证每个服务端帧都拿到当前按键，
      // 又不会每个渲染帧都发一次（那是纯粹的网络噪音）。
      if (S.mode === 'local' && S.state?.status === 'playing') {
        if (ts - S.inputAt >= 30) {
          S.inputAt = ts;
          sendInput();
        }
      }
      renderSide();
      if (S.state) {
        const a = clamp((performance.now() - S.lastTs) / S.poll, 0, 1);
        drawStage(ctx, S.state, t, S.prevState ? interpolate(S.prevState, S.state, a) : null);
      } else drawStage(ctx, null, t);
    }
    requestAnimationFrame(loop);
  }

  /* ==================== 回放 ==================== */

  const replayState = () => R.data?.frames?.[clamp(R.index, 0, (R.data?.frames?.length || 1) - 1)] || null;
  // 新回放由服务端按 20 Hz 重演（frameMs=50）；旧存档只有 1 秒一帧，退回 1000ms。
  const REPLAY_FRAME_MS = 1000;
  const replayFrameMs = () => Number(R.frameMs) > 0 ? Number(R.frameMs) : REPLAY_FRAME_MS;
  function replayAlpha() {
    if (!R.playing || !R.data) return 0;
    return clamp(R.clock / replayFrameMs(), 0, 1);
  }
  // 位置从当前帧补向下一帧；暂停时 alpha=0，显示当前帧的原始坐标。
  function replayPositions() {
    const frames = R.data?.frames;
    if (!frames || !frames.length) return null;
    const i = clamp(R.index, 0, frames.length - 1);
    if (i + 1 >= frames.length) return null;
    return interpolateAhead(frames[i], frames[i + 1], replayAlpha());
  }
  function replayAdvance(dt) {
    if (!R.playing || !R.data) return;
    const frameMs = replayFrameMs();
    R.clock += dt * (R.speed || 1);
    // 每帧代表 frameMs 毫秒游戏时间；倍速只改变真实等待时长。
    const step = Math.floor(R.clock / frameMs);
    if (step <= 0) return;
    R.clock -= step * frameMs;
    const last = R.data.frames.length - 1;
    R.index = Math.min(last, R.index + step);
    if (R.index >= last) R.playing = false;
    const seek = $('rSeek');
    if (seek) seek.value = String(R.index);
    const rf = $('rf'); if (rf) rf.textContent = String(R.index);
    if (R.playing === false) renderReplayPanel();
  }

  // 回放里的日志从「已经播到的帧」里现取，和练习局共用同一份渲染代码。
  function replayLog() {
    const st = replayState();
    if (!st) return [];
    return (st.events || []).slice(-14).map(e => ({ t: e.t, text: e.text, type: e.type }));
  }

  async function loadRuns() {
    try {
      const r = await api('/api/arena/runs');
      R.runs = r.runs || [];
      if (!R.run) R.run = r.activeRun || R.runs[0]?.run || null;
      renderRuns();
      await loadRunMeta();
    } catch (e) { R.error = e.message; renderRuns(); }
  }
  function renderRuns() {
    $('runCard').innerHTML = `<h3>比赛系列</h3>
      <div class="runs">${R.runs.length ? R.runs.map(r => {
        const labels = r.labels ? Object.values(r.labels).join(' vs ') : '';
        return `<button data-run="${esc(r.run)}" class="${R.run === r.run ? 'on' : ''}">
          ${esc(r.run)}<small>${esc(labels)} · ${r.games} 局 · ${esc(r.phase || '')}${r.completed ? ' · 已完成' : ''}</small>
        </button>`;
      }).join('') : `<small style="color:#8f9bb0">${esc(R.error || '还没有已归档的系列赛。运行 bomber/arena/train.py 后会出现在这里。')}</small>`}</div>`;
    for (const el of $('runCard').querySelectorAll('.runs button')) el.onclick = () => {
      R.run = el.dataset.run; R.data = null; R.id = null; R.index = 0; R.playing = false;
      renderRuns(); loadRunMeta();
    };
  }
  async function loadRunMeta() {
    if (!R.run) { renderGameList(); return; }
    try { R.meta = await api(`/api/arena?run=${encodeURIComponent(R.run)}`); }
    catch { R.meta = null; }
    renderGameList();
  }
  function renderGameList() {
    const gs = R.meta?.games || [];
    $('gameCard').innerHTML = `<h3>对局</h3>${gs.length
      ? `<div class="games">${gs.map(g => `<button data-g="${esc(g.id)}" class="${R.id === g.id ? 'on' : ''}">${esc(g.id)}${g.technicalFailure ? ' ⚠' : ''}</button>`).join('')}</div>`
      : '<small style="color:#8f9bb0">暂无对局</small>'}`;
    for (const el of $('gameCard').querySelectorAll('.games button')) el.onclick = () => loadGame(el.dataset.g);
  }

  /* 回放存档是 gzip 的 JSON，体积可能很大（一整局的逐帧快照）。
   * 用 ReadableStream + TextDecoder 流式累加，边收边解压，而不是等整包落地再 JSON.parse；
   * ticket 用来丢弃「用户已经切到别局」的迟到响应，防止串台。 */
  async function loadGame(id) {
    R.id = id; R.loading = true; R.loadingText = '正在载入回放…'; R.error = '';
    renderGameList(); renderReplayPanel();
    const ticket = ++R.ticket;
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}&full=1`);
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).error || '回放读取失败');
      const reader = res.body?.getReader();
      let text = '';
      if (reader) {
        const dec = new TextDecoder();
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (ticket !== R.ticket) return;
          if (done) break;
          got += value.length;
          R.loadingText = `正在载入回放… ${(got / 1048576).toFixed(1)} MB`;
          text += dec.decode(value, { stream: true });
        }
        text += dec.decode();
      } else text = await res.text();
      if (ticket !== R.ticket) return;
      R.data = JSON.parse(text);
      // 服务端重建的逐物理帧回放带 frameMs=50；旧存档只有 1 秒一帧。
      R.frameMs = Number(R.data?.frameMs) > 0 ? Number(R.data.frameMs) : 1000;
      R.index = 0; R.playing = false; R.clock = 0;
      renderGameList();
    } catch (e) { R.error = e.message; }
    finally { if (ticket === R.ticket) R.loading = false; }
    renderReplayPanel();
  }

  // 每一侧的「三局小分」：从存档的 roundLog 里按胜者归类，平局不计入任何一方。
  function roundLogHtml(st) {
    const log = st.roundLog || [];
    if (!log.length) return '<small style="color:#8f9bb0">本局尚无结算记录</small>';
    return `<div class="rounds">${log.map(r => `<div>
      <span class="${r.winner ? 'win' : 'draw'}">第 ${r.round} 局</span>
      <span class="${r.winner ? 'win' : 'draw'}">${esc(r.winner || '平局')}</span>
      <em>${esc(r.reason || '')}${r.cause ? ' · ' + esc(r.cause) : ''} · ${((r.frames || 0) / 20).toFixed(1)}s</em>
    </div>`).join('')}</div>`;
  }

  function renderReplayPanel() {
    const d = R.data;
    if (!d) {
      $('replayCard').innerHTML = `<h3>回放</h3><div class="transport">
        <button disabled>播放</button><input type="range" disabled min="0" max="0" value="0"><div class="speeds">
        ${[0.5, 1, 2, 4].map(s => `<button disabled>${s}×</button>`).join('')}</div></div>
        <small style="color:#8f9bb0">${esc(R.loading ? R.loadingText : (R.error || '选择左侧一局开始播放'))}</small>`;
      $('scoreCard').innerHTML = '';
      return;
    }
    const last = Math.max(0, d.frames.length - 1);
    const labels = R.meta?.labels || {};
    const nameOf = i => labels[d.seats?.[i]] || d.seats?.[i] || `#${i}`;
    // 有终局快照就用它（含 roundLog 与 players），没有才退回存档顶层的 winner
    const finalSt = d.final || ({ winner: d.winner, reason: d.reason, players: [] });
    const st = replayState() || finalSt;
    $('replayCard').innerHTML = `<h3>回放 ${esc(d.id)}</h3>
      ${d.technicalFailure ? `<div class="row"><span class="k">技术中断</span><span class="v" style="color:#e38978">${esc(d.technicalFailure)}</span></div>` : ''}
      <div class="transport">
        <button id="rPlay">${R.playing ? '暂停' : '播放'}</button>
        <input type="range" id="rSeek" min="0" max="${last}" value="${R.index}">
        <div class="speeds">${[0.5, 1, 2, 4].map(s => `<button data-s="${s}" class="${R.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
      </div>
      <div class="row"><span class="k">帧</span><span class="v"><span id="rf">${R.index}</span> / ${last} · 第 ${st.round ?? d.round} 局</span></div>
      <div class="row"><span class="k">本局时间</span><span class="v">${((st.frame || 0) / 20).toFixed(1)}s / ${st.rules?.roundTimeLimit || 150}s</span></div>
      <div class="row"><span class="k">结果</span><span class="v" style="color:#e0b873">${d.winner === null || d.winner === undefined ? '平局' : esc(nameOf(d.winner)) + ' 胜'}</span></div>
      <div class="row"><span class="k">结算</span><span class="v">${esc(d.reason || finalSt.reason || '')}</span></div>
      <div class="row"><span class="k">时长 / 窗口</span><span class="v">${d.duration ?? '-'}s · ${(d.windows || []).length}</span></div>`;
    $('rPlay').onclick = () => { R.playing = !R.playing; renderReplayPanel(); };
    $('rSeek').oninput = e => { R.index = Number(e.target.value); R.playing = false; R.clock = 0; $('rf').textContent = String(R.index); };
    for (const b of $('replayCard').querySelectorAll('.speeds button')) b.onclick = () => { R.speed = Number(b.dataset.s); renderReplayPanel(); };

    // 总比分与逐局记录：series 里每局只有一个 winner 字符串，靠它汇总
    const results = R.meta?.results || [];
    const tally = {};
    for (const r of results) if (r.winner) tally[r.winner] = (tally[r.winner] || 0) + 1;
    const ids = Object.keys(R.meta?.models || {});
    const sides = (d.teams || []).map((t, i) => ({ t, i }));
    $('scoreCard').innerHTML = `<h3>比分与逐局</h3>
      ${ids.length ? `<div class="scoreline" style="display:flex;justify-content:space-around;font-size:19px;font-weight:700">
        ${ids.map(i => `<span style="color:${i === d.seats?.[0] ? '#76bcce' : '#e38978'}">${esc(labels[i] || i)} <b>${tally[i] || 0}</b></span>`).join('')}
      </div><div class="row"><span class="k">系列局数</span><span class="v">${results.length}</span></div>` : ''}
      <div class="sep"></div>
      ${roundLogHtml(st)}
      ${sides.length ? `<div class="sep"></div><div class="row"><span class="k">席位</span><span class="v">${esc((d.names || []).join(' vs '))}</span></div>` : ''}`;
  }

  /* ==================== 模式切换 ==================== */

  async function enterWatch(runId) {
    if (R.enabled) return;
    R.enabled = true;
    S.keys.clear();
    // 进入回放时先摆一次空舞台，避免残留上一局的画面
    drawStage(ctx, null, 0);
    renderReplayPanel();
    try { await loadRuns(); } catch (e) { toast(e.message, true); }
    // ?run=RUN_ID 可指定历史系列；否则沿用 loadRuns 选中的当前/最近系列。
    if (runId && (R.runs || []).some(r => r.run === runId) && R.run !== runId) {
      R.run = runId; R.data = null; R.id = null; R.index = 0; R.playing = false;
      renderRuns();
      await loadRunMeta();
    }
    // 默认载入最新一局；?replay=GAME_ID 可直达指定对局。
    const games = R.meta?.games || [];
    const first = games[games.length - 1];
    if (first) await loadGame(first.id);
  }
  function enterLocal() {
    R.enabled = false;
    R.data = null; R.id = null; R.playing = false; R.error = '';
    $('runCard').innerHTML = ''; $('gameCard').innerHTML = ''; $('scoreCard').innerHTML = '';
    createLocalMatch().catch(e => toast(e.message, true));
  }

  /* ==================== 输入与启动 ==================== */

  function wireInput() {
    const tracked = new Set(KEYMAPS.flatMap(m => [...m.up, ...m.down, ...m.left, ...m.right, ...m.bomb]));
    addEventListener('keydown', e => {
      if (!tracked.has(e.code)) return;
      // 空格、方向键、回车会滚动/提交页面，在游戏里必须吃掉默认行为
      e.preventDefault();
      S.keys.add(e.code);
    });
    addEventListener('keyup', e => {
      if (tracked.has(e.code)) { e.preventDefault(); S.keys.delete(e.code); }
    });
    // 切走标签页时清空按键，否则回来会「卡着一直往上走」
    addEventListener('blur', () => S.keys.clear());
  }

  function syncHumanOptions() {
    const total = Number($('playerCount').value);
    const select = $('humanCount');
    const current = Math.min(Number(select.value) || total, total);
    select.innerHTML = Array.from({ length: total }, (_, i) =>
      `<option value="${i + 1}"${i + 1 === current ? ' selected' : ''}>${i + 1} 人</option>`).join('');
    updateSetupHint(total, current);
  }

  async function init() {
    try {
      S.catalog = await api('/api/catalog');
      // catalog 一到就先按它定画布尺寸，避免开局那一瞬用默认尺寸画一帧再跳变
      setDims(S.catalog?.rules?.width, S.catalog?.rules?.height);
    } catch { S.catalog = null; }
    $('meta').textContent = `· ${W}×${H} 格 · 2–4 人本地对战 · 20 Hz / ${S.catalog?.rules?.decisionFrames || 20} 帧每窗口 · 单局 ${S.catalog?.rules?.roundTimeLimit ?? 150}s`;
    wireInput();
    for (const b of $('modes').querySelectorAll('button')) b.onclick = () => {
      for (const o of $('modes').querySelectorAll('button')) o.classList.toggle('on', o === b);
      // 重复点当前模式不做任何事：否则误点一下「本地对战」就会把正在打的对局丢掉重开
      if (b.dataset.mode === 'watch') { if (!R.enabled) enterWatch(); }
      else if (R.enabled) enterLocal();
    };
    $('playerCount').onchange = syncHumanOptions;
    $('humanCount').onchange = () => updateSetupHint(Number($('playerCount').value), Number($('humanCount').value));
    $('newMatch').onclick = () => {
      if (R.enabled) enterLocal();
      else createLocalMatch().catch(e => toast(e.message, true));
    };
    syncHumanOptions();
    requestAnimationFrame(loop);
    // 默认进本地对战；localStorage 里的旧席位不复活，避免服务端重启后拿到 404 的房间
    try { localStorage.removeItem(KEY); localStorage.removeItem('bomber.seat.v1'); } catch {}
    const params = new URLSearchParams(location.search);
    const replayParam = params.get('replay');
    if (replayParam) {
      for (const o of $('modes').querySelectorAll('button')) o.classList.toggle('on', o.dataset.mode === 'watch');
      await enterWatch(params.get('run'));
      const wanted = replayParam === 'latest' ? null : replayParam;
      if (wanted && (R.meta?.games || []).some(g => g.id === wanted)) await loadGame(wanted);
      // 从观战入口打开时直接播放，省掉再点一次“播放”。
      R.playing = true; R.clock = 0;
      renderReplayPanel();
    } else {
      await createLocalMatch();
    }
    // 轮询与渲染循环同节拍：练习局服务端 20 Hz（50 ms）推进一次，快照也就按这个频率取。
    S.poll = 50;
    S.timer = setInterval(() => {
      if (R.enabled || S.busy) return;
      S.busy = true;
      fetchState().finally(() => { S.busy = false; });
    }, S.poll);
  }
  init().catch(e => toast('初始化失败：' + e.message, true));
})();
