'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const PPM = 62, FLOOR = 600, LEFT = 96;
  const W_PX = cv.width, H_PX = cv.height;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const teamColor = t => t === 0 ? '#6fc8ff' : '#ff9a6b';
  const teamColor2 = t => t === 0 ? '#2f8fce' : '#d06a3f';
  const sx = x => LEFT + x * PPM;
  const sy = y => FLOOR - y * PPM;

  let COURT = null, COURT_NET = 0;

  const S = {
    catalog: null, match: null, token: null, mode: 'local',
    state: null, prevState: null, poll: 50, busy: false,
    keys: new Set(), inputAt: 0, banner: null, bannerUntil: 0,
    log: [], events: new Set(), lastTs: 0,
    trail: [],
  };
  const R = {
    enabled: false, runs: [], run: null, meta: null, data: null, id: null,
    index: 0, playing: false, speed: 1, clock: 0, frameMs: 50, loading: false,
    loadingText: '', error: '', ticket: 0,
  };

  async function api(path, body, token) {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw Error(data.error || `请求失败 (${res.status})`);
    return data;
  }
  let toastTimer = null;
  function toast(text, error = false) {
    const el = $('toast'); el.textContent = text; el.classList.toggle('error', error); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ==================== 静态场地 ==================== */
  function courtLayer(netH = 1.55) {
    if (COURT && COURT_NET === netH) return COURT;
    const off = document.createElement('canvas'); off.width = W_PX; off.height = H_PX;
    const c = off.getContext('2d');
    // 背景
    const g = c.createLinearGradient(0, 0, 0, H_PX);
    g.addColorStop(0, '#0c1722'); g.addColorStop(.62, '#123049'); g.addColorStop(1, '#0a141d');
    c.fillStyle = g; c.fillRect(0, 0, W_PX, H_PX);
    // 场馆墙板与横幅
    c.strokeStyle = 'rgba(120,180,220,.06)'; c.lineWidth = 1;
    for (let x = 0; x < W_PX; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, FLOOR); c.stroke(); }
    c.fillStyle = 'rgba(233,238,246,.05)'; c.font = '700 14px "Segoe UI",sans-serif'; c.textAlign = 'center';
    c.fillText('AIBATTLE · BADMINTON ARENA', W_PX / 2, 300);
    c.textAlign = 'start';
    // 地板
    const fg = c.createLinearGradient(0, FLOOR - 10, 0, FLOOR + 70);
    fg.addColorStop(0, '#22485f'); fg.addColorStop(1, '#0f2635');
    c.fillStyle = fg; c.fillRect(0, FLOOR, W_PX, H_PX - FLOOR);
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, FLOOR, W_PX, 2);
    // 球场线
    const L = 13.4, netX = 6.7;
    c.strokeStyle = 'rgba(233,238,246,.55)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(sx(0), FLOOR); c.lineTo(sx(L), FLOOR); c.stroke();
    for (const x of [0, netX - 1.98, netX, netX + 1.98, L]) {
      c.beginPath(); c.moveTo(sx(x), FLOOR - 4); c.lineTo(sx(x), FLOOR + 16); c.stroke();
    }
    c.fillStyle = 'rgba(233,238,246,.16)'; c.font = '600 10px "Segoe UI",sans-serif';
    c.fillText('单打边线 / 后发球线', sx(netX - 1.98) - 40, FLOOR + 34);
    // 球网：半透明网面 + 白色网带 + 近侧网柱
    const nx = sx(netX), nh = sy(netH), netW = 7;
    c.fillStyle = 'rgba(190,210,232,.16)'; c.fillRect(nx - netW / 2, nh, netW, FLOOR - nh);
    c.strokeStyle = 'rgba(200,220,240,.45)'; c.lineWidth = 1;
    for (let y = nh + 7; y < FLOOR; y += 7) { c.beginPath(); c.moveTo(nx - netW / 2, y); c.lineTo(nx + netW / 2, y); c.stroke(); }
    for (let x = -netW / 2; x <= netW / 2; x += 3.5) { c.beginPath(); c.moveTo(nx + x, nh); c.lineTo(nx + x, FLOOR); c.stroke(); }
    c.fillStyle = '#eef4fb'; c.fillRect(nx - netW / 2 - 1, nh - 2, netW + 2, 4);
    c.fillStyle = '#cfd9e6'; c.fillRect(nx - 4, nh - 6, 8, 8);
    c.fillStyle = '#7f93a8'; c.fillRect(nx - 1.5, nh, 3, FLOOR - nh);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(nx, FLOOR + 4, 26, 5, 0, 0, TAU); c.fill();
    COURT = off; COURT_NET = netH; return off;
  }

  /* ==================== 火柴人 ==================== */
  function poseOf(p) {
    const frac = p.swing > 0 ? clamp(p.swingElapsed / 9, 0, 1) : 0.5;
    const swinging = p.swing > 0 && p.swingElapsed >= 2 && p.swingElapsed < 7;
    return { frac, swinging };
  }
  function racketPoint(p, frac) {
    const o = p.swingType > 0 || p.swing === 0;
    // 与 simulation.js 的弧线一致（上手 2.10→1.25，下手 0.28→1.22）
    const up = o ? 2.10 - 0.85 * frac : 0.28 + 0.94 * frac;
    const fwd = o ? 0.05 + 0.75 * frac : 0.50 + 0.18 * frac;
    return { x: p.x + p.facing * fwd, y: p.y + up, overhead: o };
  }

  function drawStickman(c, p, t) {
    const X = sx(p.x), Y = sy(p.y);
    const col = teamColor(p.team), dark = teamColor2(p.team);
    const { frac, swinging } = poseOf(p);
    const idle = p.swing === 0;
    const f = p.facing;
    const hipY = Y - 0.86 * PPM, shY = Y - 1.48 * PPM, headY = Y - 1.66 * PPM;
    c.save();
    // 影子
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(X, FLOOR + 4, 16 * (1 - p.y * 0.12), 4.5, 0, 0, TAU); c.fill();
    // 腿
    const step = clamp(Math.abs(p.vx) / 4, 0, 1);
    const legSwing = Math.sin(t * 12) * 7 * step * f;
    c.strokeStyle = dark; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X, hipY); c.lineTo(X + legSwing - 4, Y); c.stroke();
    c.beginPath(); c.moveTo(X, hipY); c.lineTo(X - legSwing + 4, Y); c.stroke();
    // 身体
    c.strokeStyle = col; c.lineWidth = 4;
    c.beginPath(); c.moveTo(X, hipY); c.lineTo(X, shY); c.stroke();
    // 头
    c.fillStyle = col; c.beginPath(); c.arc(X + f * 2, headY, 0.14 * PPM, 0, TAU); c.fill();
    c.fillStyle = '#0b1017'; c.beginPath(); c.arc(X + f * 5, headY - 2, 1.6, 0, TAU); c.fill();
    // 空手
    const backArm = swinging ? { x: p.x - f * 0.35, y: p.y + 1.15 } : { x: p.x - f * 0.22, y: p.y + 0.95 };
    c.strokeStyle = col; c.lineWidth = 3;
    c.beginPath(); c.moveTo(X, shY); c.lineTo(sx(backArm.x), sy(backArm.y)); c.stroke();
    // 持拍手与球拍
    const rp = idle ? { x: p.x + f * 0.42, y: p.y + 1.25 } : racketPoint(p, frac);
    c.beginPath(); c.moveTo(X, shY); c.lineTo(sx(rp.x), sy(rp.y)); c.stroke();
    const ang = Math.atan2(sy(rp.y) - shY, sx(rp.x) - X);
    c.save();
    c.translate(sx(rp.x), sy(rp.y)); c.rotate(ang);
    c.strokeStyle = 'rgba(233,238,246,.85)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0.24 * PPM, 0); c.stroke();
    c.strokeStyle = swinging ? '#ffd166' : 'rgba(233,238,246,.85)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0.40 * PPM, 0, 0.19 * PPM, 0.14 * PPM, 0, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(233,238,246,.35)'; c.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(0.22 * PPM, i * 6); c.lineTo(0.58 * PPM, i * 5); c.stroke();
    }
    c.restore();
    // 冲刺速度线
    if (p.sprinting) {
      c.save(); c.globalAlpha = .45; c.strokeStyle = '#bfe9ff'; c.lineWidth = 1.5;
      for (let i = -1; i <= 1; i += 2) {
        const yy = Y - 0.7 * PPM + i * 10;
        c.beginPath(); c.moveTo(X - p.facing * 14, yy); c.lineTo(X - p.facing * (30 + i * 4), yy); c.stroke();
      }
      c.restore();
    }
    // 蓄力光环
    if (p.charge > 0.02) {
      c.save();
      c.strokeStyle = `rgba(255,209,102,${0.25 + p.charge * 0.6})`;
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(X, Y - 0.95 * PPM, 0.42 * PPM, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.charge, 0, 1));
      c.stroke();
      if (p.charge > 0.95) {
        c.globalAlpha = .5; c.strokeStyle = '#ffd166'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(X, Y - 0.95 * PPM, 0.55 * PPM, 0, TAU); c.stroke();
      }
      c.restore();
    }
    // 挥拍残影
    if (swinging) {
      c.globalAlpha = .35; c.strokeStyle = '#ffd166'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 10; i++) {
        const q = racketPoint(p, i / 10);
        if (i === 0) c.moveTo(sx(q.x), sy(q.y)); else c.lineTo(sx(q.x), sy(q.y));
      }
      c.stroke(); c.globalAlpha = 1;
    }
    c.restore();
  }

  function drawShuttle(c, s) {
    if (!s) return;
    const X = sx(s.x), Y = sy(s.y);
    const speed = Math.hypot(s.vx || 0, s.vy || 0);
    // 影子
    c.fillStyle = `rgba(0,0,0,${clamp(.28 - s.y * .02, .06, .28)})`;
    c.beginPath(); c.ellipse(X, FLOOR + 3, clamp(10 - s.y, 3, 10), 2.5, 0, 0, TAU); c.fill();
    // 拖尾
    for (let i = 0; i < (s.trail || []).length; i++) {
      const p = s.trail[i], a = (i + 1) / (s.trail.length + 1);
      c.fillStyle = `rgba(255,244,200,${a * .35})`;
      c.beginPath(); c.arc(sx(p.x), sy(p.y), 1.6 + a * 1.2, 0, TAU); c.fill();
    }
    if (!s.alive) return;
    const ang = speed > 0.5 ? Math.atan2(s.vy, s.vx) : -Math.PI / 2;
    c.save(); c.translate(X, Y); c.rotate(ang);
    // 羽毛（尾）
    c.fillStyle = 'rgba(240,246,255,.92)';
    c.beginPath(); c.moveTo(-2, 0); c.lineTo(-13, -6); c.lineTo(-13, 6); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(180,200,220,.8)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-13, -6); c.lineTo(-13, 6); c.stroke();
    // 球头
    c.fillStyle = '#ffd166'; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(-1, -1, 1.4, 0, TAU); c.fill();
    c.restore();
    if (speed > 14) {
      c.strokeStyle = `rgba(255,236,180,${clamp((speed - 14) / 20, 0, .5)})`; c.lineWidth = 1;
      for (let i = -1; i <= 1; i += 2) {
        const px = X - Math.cos(ang) * 14 - Math.sin(ang) * i * 5, py = Y - Math.sin(ang) * 14 + Math.cos(ang) * i * 5;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.cos(ang) * 16, py - Math.sin(ang) * 16); c.stroke();
      }
    }
  }

  /* ==================== HUD ==================== */
  function pill(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  function drawHud(c, st) {
    const score = st.score || [0, 0];
    const players = st.players || [];
    const bats = st.batsmen || [];
    const cx = W_PX / 2;
    c.save();
    // 中央记分牌（带双方体力/蓄力条）
    c.fillStyle = 'rgba(6,10,16,.78)'; pill(c, cx - 200, 12, 400, 96, 12); c.fill();
    c.strokeStyle = 'rgba(111,200,255,.22)'; c.lineWidth = 1; c.stroke();
    c.textAlign = 'center';
    c.font = '600 11px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
    c.fillText(players[0]?.name || '左', cx - 122, 31);
    c.fillText(players[1]?.name || '右', cx + 122, 31);
    c.font = '800 30px "Segoe UI",sans-serif'; c.fillStyle = '#e9eef6';
    c.fillText(`${score[0]} : ${score[1]}`, cx, 66);
    // 发球方标记
    const srvX = st.server === 0 ? cx - 122 : cx + 122;
    c.fillStyle = '#ffd166'; c.beginPath();
    c.arc(srvX + (st.server === 0 ? -50 : 50), 27, 3.5, 0, TAU); c.fill();

    // 双方体力条 + 蓄力条
    for (const p of bats) {
      const left = p.team === 0;
      const bx = left ? cx - 172 : cx + 80;
      const by = 40;
      const bw = 92;
      c.fillStyle = '#141c26'; pill(c, bx, by, bw, 7, 3.5); c.fill();
      c.fillStyle = p.stamina < 30 ? '#ff8a6b' : p.stamina < 60 ? '#ffd166' : '#8fe3a8';
      pill(c, bx, by, bw * clamp(p.stamina / 100, 0, 1), 7, 3.5); c.fill();
      c.fillStyle = '#141c26'; pill(c, bx, by + 9, bw, 3, 1.5); c.fill();
      c.fillStyle = 'rgba(255,209,102,.9)';
      pill(c, bx, by + 9, bw * clamp(p.charge || 0, 0, 1), 3, 1.5); c.fill();
      c.font = '600 9px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0'; c.textAlign = left ? 'right' : 'left';
      c.fillText('体力', left ? bx - 5 : bx + bw + 5, by + 7);
      c.textAlign = 'center';
    }
    // 回合数与时间
    c.font = '600 11px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
    c.fillText(`本回合 ${st.rally || 0} 拍 · 最长 ${st.longestRally || 0} 拍 · 剩余 ${Math.ceil(st.timeLeft ?? 0)}s`, cx, 126);
    // 阶段提示
    if (st.phase === 'serve') {
      c.font = '800 26px "Segoe UI",sans-serif'; c.fillStyle = 'rgba(255,255,255,.9)';
      c.fillText(`${players[st.server]?.name || ''} 发球`, cx, 220);
    } else if (st.phase === 'point' && st.lastPoint) {
      c.font = '800 26px "Segoe UI",sans-serif'; c.fillStyle = teamColor(st.lastPoint.winner);
      const pn = players[st.lastPoint.winner]?.name || '';
      c.fillText(`${pn} 得分 · ${st.lastPoint.reason}`, cx, 220);
    }
    c.restore();
  }

  function drawFinish(c, st) {
    const X = W_PX / 2, Y = H_PX / 2;
    c.fillStyle = 'rgba(5,9,14,.72)'; c.fillRect(0, 0, W_PX, H_PX);
    c.save(); c.textAlign = 'center';
    c.font = '800 38px "Segoe UI",sans-serif';
    c.fillStyle = st.winner === null ? '#e0c873' : teamColor(st.winner);
    c.fillText(st.winner === null ? '平 局' : `${st.players?.[st.winner]?.name || '?'} 获胜`, X, Y - 6);
    c.font = '600 15px "Segoe UI",sans-serif'; c.fillStyle = '#c3ccd9';
    c.fillText(`${st.score?.[0] ?? 0} : ${st.score?.[1] ?? 0} · ${st.reason || ''}`, X, Y + 28);
    c.font = '600 13px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
    c.fillText(`最长回合 ${st.longestRally || 0} 拍`, X, Y + 54);
    c.restore(); c.textAlign = 'start';
  }

  function drawStage(c, st, positions, t) {
    if (!st) {
      c.clearRect(0, 0, W_PX, H_PX); c.fillStyle = '#070b10'; c.fillRect(0, 0, W_PX, H_PX);
      c.fillStyle = '#8f9bb0'; c.font = '600 15px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText(R.loading ? (R.loadingText || '正在载入回放…') : '暂无对局', W_PX / 2, H_PX / 2); c.textAlign = 'start'; return;
    }
    c.clearRect(0, 0, W_PX, H_PX);
    c.drawImage(courtLayer(st.court?.netHeight ?? 1.55), 0, 0);
    const bats = positions?.batsmen || st.batsmen || [];
    for (const p of bats) drawStickman(c, p, t);
    drawShuttle(c, positions?.shuttle || st.shuttle);
    drawHud(c, st);
    if (S.banner && performance.now() < S.bannerUntil) {
      const left = (S.bannerUntil - performance.now()) / 900;
      c.save(); c.globalAlpha = clamp(left, 0, 1);
      c.font = '800 30px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.96)'; c.shadowColor = 'rgba(111,200,255,.9)'; c.shadowBlur = 26;
      c.fillText(S.banner, W_PX / 2, H_PX / 2 - 8); c.restore(); c.textAlign = 'start';
    }
    if (st.status === 'finished') drawFinish(c, st);
  }

  /* ==================== 插值 ==================== */
  function blend(a, b, t) {
    if (!a || !b || a.frame > b.frame) return b;
    const players = (b.batsmen || []).map(p => {
      const q = (a.batsmen || []).find(x => x.id === p.id);
      return q ? { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t), vx: lerp(q.vx, p.vx, t), vy: lerp(q.vy, p.vy, t) } : p;
    });
    const s = b.shuttle, ps = a.shuttle;
    const shuttle = s && ps ? { ...s, x: lerp(ps.x, s.x, t), y: lerp(ps.y, s.y, t) } : s;
    return { ...b, batsmen: players, shuttle };
  }

  /* ==================== 侧栏 ==================== */
  const lastHtml = new Map();
  function setHtml(id, html) {
    if (lastHtml.get(id) === html) return false;
    lastHtml.set(id, html); $(id).innerHTML = html; return true;
  }
  function playerRow(p, mine = false) {
    return `<div class="carrow${mine ? ' me' : ''}">
      <span class="idx" style="color:${teamColor(p.team)}">${p.team + 1}</span>
      <span class="un">${esc(p.name || '')}</span>
      <span class="lap">${p.points || 0} 分</span>
      <span class="sp">${p.hits || 0} 拍</span></div>`;
  }
  function renderSide() {
    const st = R.enabled ? (R.data?.frames?.[clamp(R.index, 0, (R.data.frames.length - 1))] || null) : S.state;
    if (!st) {
      for (const id of ['matchCard', 'timeCard', 'meCard', 'rivalCard', 'statsCard']) setHtml(id, '');
      return;
    }
    const bats = st.batsmen || [];
    const me = bats.find(p => p.team === 0);
    const rival = bats.find(p => p.team === 1);
    const score = st.score || [0, 0];
    setHtml('matchCard', `<h3>比分</h3>
      <div class="scoreboard">${(st.players || []).map((p, i) => `<div class="prow">
        <span class="dot" style="background:${teamColor(i)}"></span><span class="nm">${esc(p.name || '')}</span>
        <span class="wins">${score[i] ?? 0}</span></div>`).join('')}</div>
      <div class="row"><span class="k">发球方</span><span class="v">${esc(st.players?.[st.server]?.name || '—')}</span></div>
      <div class="row"><span class="k">网高</span><span class="v">${(st.court?.netHeight ?? 1.55).toFixed(2)} 格</span></div>
      <div class="row"><span class="k">本回合</span><span class="v">${st.rally || 0} 拍 · 最长 ${st.longestRally || 0}</span></div>`);

    const left = st.timeLeft ?? 0;
    setHtml('timeCard', `<h3>比赛时间</h3>
      <div class="row"><span class="k">剩余</span><span class="v timebig ${left <= 10 ? 'danger' : left <= 30 ? 'soon' : ''}">${left.toFixed(1)}s</span></div>
      <div class="floodbar"><i style="width:${(clamp(left / 240, 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">阶段</span><span class="v">${st.phase === 'serve' ? '发球' : st.phase === 'point' ? '得分暂停' : st.phase === 'finished' ? '结束' : '对战'}</span></div>`);

    setHtml('meCard', `<h3>${R.enabled ? '左位球员' : '你'}</h3>${me ? playerRow(me, !R.enabled) : '<small>—</small>'}
      <div class="row"><span class="k">体力</span><span class="v">${Math.round(me?.stamina ?? 0)}%</span></div>
      <div class="floodbar stam"><i style="width:${clamp((me?.stamina ?? 0), 0, 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">蓄力</span><span class="v">${Math.round((me?.charge ?? 0) * 100)}%</span></div>
      <div class="floodbar"><i style="width:${(clamp(me?.charge ?? 0, 0, 1) * 100).toFixed(1)}%;background:linear-gradient(90deg,#c96a2c,#ffd166)"></i></div>
      <div class="row"><span class="k">杀球</span><span class="v">${me?.smashes ?? 0}</span></div>`);

    setHtml('rivalCard', `<h3>对手</h3>${rival ? playerRow(rival) : '<small>—</small>'}
      <div class="row"><span class="k">体力</span><span class="v">${Math.round(rival?.stamina ?? 0)}%</span></div>
      <div class="row"><span class="k">蓄力</span><span class="v">${Math.round((rival?.charge ?? 0) * 100)}%</span></div>
      <div class="row"><span class="k">杀球</span><span class="v">${rival?.smashes ?? 0}</span></div>`);

    const evs = (st.events || []).slice(-6).map(e => {
      if (e.type === 'point') return `<div><i>${e.t.toFixed(1)}s</i><span class="pt">${esc((st.players?.[e.team]?.name) || '')} 得分 · ${esc(e.reason)}</span></div>`;
      if (e.type === 'net') return `<div><i>${e.t.toFixed(1)}s</i><span class="net">挂网</span></div>`;
      if (e.type === 'finish') return `<div><i>${e.t.toFixed(1)}s</i><span class="finish">${esc(e.reason || '结束')}</span></div>`;
      return '';
    }).join('');
    setHtml('logCard', `<h3>战况</h3><div class="log">${evs || '<small>等待发球…</small>'}</div>`);

    setHtml('legend', R.enabled
      ? '<b>回放</b> 拖动进度条跳转 · 播放/暂停 · 0.5×–4× 变速<br>逐物理帧回放（20 Hz）'
      : '<b>操作</b> A/D 移动 · W 起跳 · 空格 上手 · S 下手 · J 蓄力 · Shift 冲刺<br><b>规则</b> 11 分制 · 蓄力/冲刺都耗体力');
  }

  /* ==================== 回放 ==================== */
  function replayState() { return R.data?.frames?.[clamp(R.index, 0, (R.data?.frames?.length || 1) - 1)] || null; }
  function replayFrameMs() { return Number(R.frameMs) > 0 ? Number(R.frameMs) : 50; }
  function replayPositions() {
    const frames = R.data?.frames; if (!frames || !frames.length) return null;
    const i = clamp(R.index, 0, frames.length - 1); if (i + 1 >= frames.length) return null;
    return blend(frames[i], frames[i + 1], clamp(R.clock / replayFrameMs(), 0, 1));
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
    return (st.events || []).filter(e => e.frame <= st.frame && ['point', 'finish', 'net', 'serve'].includes(e.type)).slice(-10)
      .map(e => ({ t: e.t, text: e.type === 'point' ? `${st.players?.[e.team]?.name || ''} 得分 · ${e.reason}` : e.type === 'net' ? '挂网' : e.type === 'serve' ? '发球' : (e.reason || '结束'), type: e.type }));
  }

  async function loadRuns() {
    try {
      const r = await api('/api/arena/runs');
      R.runs = r.runs || []; if (!R.run) R.run = r.activeRun || R.runs[0]?.run || null;
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
    try { R.meta = await api(`/api/arena?run=${encodeURIComponent(R.run || '')}`); } catch { R.meta = null; }
    renderGames();
  }
  function renderGames() {
    const games = R.meta?.games || [];
    $('gameCard').innerHTML = `<h3>对局</h3><div class="games">${games.length ? games.map(g => {
      const w = g.winner ? (R.meta.labels?.[g.winner] || g.winner) : '平局';
      return `<button data-id="${esc(g.id)}" class="${R.id === g.id ? 'on' : ''}">${esc(g.id)} · ${esc(w)}</button>`;
    }).join('') : '<small style="color:#8f9bb0">这个系列还没有对局。</small>'}</div>`;
    for (const el of $('gameCard').querySelectorAll('.games button')) el.onclick = () => loadGame(el.dataset.id);
    renderReplayPanel();
  }
  async function loadGame(id) {
    R.id = id; R.index = 0; R.playing = false; R.clock = 0; R.loading = true; R.error = ''; S.banner = null;
    const ticket = ++R.ticket; renderReplayPanel(); renderGames();
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}`);
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).error || '回放读取失败');
      const data = JSON.parse(await res.text());
      if (ticket !== R.ticket) return;
      R.data = data;
      for (const f of R.data.frames || []) { f.court = R.data.court; f.rules = R.data.rules; f.events = R.data.events || []; }
      R.frameMs = Number(R.data?.frameMs) > 0 ? Number(R.data.frameMs) : 50;
      R.index = 0; R.playing = false; R.clock = 0;
    } catch (e) { R.error = e.message; }
    finally { if (ticket === R.ticket) { R.loading = false; renderReplayPanel(); renderSide(); } }
  }
  function renderReplayPanel() {
    const d = R.data;
    if (!d) {
      $('replayCard').innerHTML = `<h3>回放</h3><div class="transport">
        <button disabled>播放</button><input type="range" disabled min="0" max="0" value="0"><div class="speeds">
        ${[0.5, 1, 2, 4].map(s => `<button disabled>${s}×</button>`).join('')}</div></div>
        <small style="color:#8f9bb0">${esc(R.loading ? R.loadingText : (R.error || '选择上方一局开始播放'))}</small>`;
      $('scoreCard').innerHTML = ''; return;
    }
    const last = Math.max(0, d.frames.length - 1);
    const labels = R.meta?.labels || {};
    const final = d.final;
    $('replayCard').innerHTML = `<h3>回放</h3>
      <div class="transport"><button id="rPlay">${R.playing ? '暂停' : '播放'}</button>
      <input id="rSeek" type="range" min="0" max="${last}" value="${R.index}">
      <span id="rf" style="color:#8f9bb0;font-variant-numeric:tabular-nums">${R.index}</span></div>
      <div class="transport" style="margin-top:6px"><div class="speeds">${[0.5, 1, 2, 4].map(s => `<button data-sp="${s}" class="${R.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
      <small style="color:#8f9bb0">${esc(R.error || '')}</small></div>`;
    $('rPlay').onclick = () => { R.playing = !R.playing; R.clock = 0; renderReplayPanel(); };
    $('rSeek').oninput = e => { R.index = clamp(Number(e.target.value), 0, last); R.playing = false; R.clock = 0; renderSide(); };
    for (const b of $('replayCard').querySelectorAll('[data-sp]')) b.onclick = () => { R.speed = Number(b.dataset.sp); renderReplayPanel(); };
    $('scoreCard').innerHTML = final ? `<h3>结果</h3>
      <div class="row"><span class="k">比分</span><span class="v">${final.score?.[0] ?? 0} : ${final.score?.[1] ?? 0}</span></div>
      <div class="row"><span class="k">胜者</span><span class="v">${final.winner === null ? '平局' : esc(labels[final.winner] || '')}</span></div>
      <div class="row"><span class="k">最长回合</span><span class="v">${final.longestRally || 0} 拍</span></div>` : '';
    renderSide();
  }

  /* ==================== 本地输入 ==================== */
  async function sendInput() {
    if (S.mode !== 'local' || R.enabled || !S.match || S.state?.status !== 'playing') return;
    const k = S.keys;
    const input = {
      move: (k.has('KeyA') || k.has('ArrowLeft') ? -1 : 0) + (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0),
      jump: k.has('KeyW') || k.has('ArrowUp'),
      swing: k.has('Space') ? 1 : k.has('KeyS') || k.has('ArrowDown') ? -1 : 0,
      charge: k.has('KeyJ'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
    api(`/api/matches/${S.match}/step`, { input }, S.token).catch(() => {});
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
      if (e.type === 'point') { S.banner = `${st.players?.[e.team]?.name || ''} 得分`; S.bannerUntil = performance.now() + 1200; }
      if (e.type === 'finish') { S.banner = e.reason || '比赛结束'; S.bannerUntil = performance.now() + 2000; }
    }
    if (S.events.size > 900) S.events = new Set([...S.events].slice(-300));
  }
  async function createLocalMatch() {
    const res = await api('/api/matches', {
      mode: 'local', seed: Math.floor(Math.random() * 1e9),
      players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }],
    }, '');
    S.match = res.match; S.token = res.seats[0]?.token || null; S.mode = 'local';
    S.state = res.state; S.prevState = null; S.log = []; S.events.clear();
    S.banner = null; S.bannerUntil = 0;
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
    const tracked = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ']);
    addEventListener('keydown', e => { if (tracked.has(e.code)) { e.preventDefault(); S.keys.add(e.code); } });
    addEventListener('keyup', e => { if (tracked.has(e.code)) { e.preventDefault(); S.keys.delete(e.code); } });
    addEventListener('blur', () => S.keys.clear());
  }
  async function init() {
    try { S.catalog = await api('/api/catalog'); } catch { S.catalog = null; }
    $('meta').textContent = '· 13.4 格球场 · 11 分制 · 20 Hz · 上手/下手两种挥拍';
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

  function loop(ts) {
    const t = ts / 1000;
    if (R.enabled) {
      replayAdvance(ts - S.lastTs); renderSide();
      drawStage(ctx, replayState(), replayPositions(), t);
    } else {
      if (S.mode === 'local' && ts - S.inputAt >= 33) { S.inputAt = ts; sendInput(); }
      renderSide();
      if (S.state) {
        const a = clamp((performance.now() - S.lastTs) / S.poll, 0, 1);
        drawStage(ctx, S.state, S.prevState ? blend(S.prevState, S.state, a) : null, t);
      } else drawStage(ctx, null, null, t);
    }
    S.lastTs = ts; requestAnimationFrame(loop);
  }

  init().catch(e => toast('初始化失败：' + e.message, true));
  window.__badminton = { S, R };
})();
