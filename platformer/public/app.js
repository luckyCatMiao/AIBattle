'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const W_PX = cv.width, H_PX = cv.height;
  const PPM = 40, TOP = 24, BOTTOM = 40;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const teamColor = t => t === 0 ? '#6fc8ff' : '#ff9a6b';
  const teamDark = t => t === 0 ? '#2f8fce' : '#d06a3f';
  const sy = y => H_PX - BOTTOM - y * PPM;

  const S = {
    catalog: null, match: null, token: null, mode: 'local',
    state: null, prevState: null, poll: 50, busy: false,
    keys: new Set(), inputAt: 0, banner: null, bannerUntil: 0,
    events: new Set(), lastTs: 0, camX: 0, camInit: false,
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

  /* ==================== 场景 ==================== */
  function drawSky(c, camX) {
    const g = c.createLinearGradient(0, 0, 0, H_PX);
    g.addColorStop(0, '#12233a'); g.addColorStop(.55, '#1d4260'); g.addColorStop(1, '#2a5a72');
    c.fillStyle = g; c.fillRect(0, 0, W_PX, H_PX);
    // 远山（视差）
    c.fillStyle = 'rgba(46,86,110,.55)';
    const off = (camX * 0.25 * PPM) % 400;
    for (let i = -1; i < 4; i++) {
      const bx = i * 400 - off;
      c.beginPath(); c.moveTo(bx, sy(3)); c.lineTo(bx + 150, sy(7.5)); c.lineTo(bx + 300, sy(3)); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(38,74,96,.5)';
    const off2 = (camX * 0.45 * PPM) % 320;
    for (let i = -1; i < 5; i++) {
      const bx = i * 320 - off2;
      c.beginPath(); c.moveTo(bx, sy(2)); c.lineTo(bx + 110, sy(5.5)); c.lineTo(bx + 220, sy(2)); c.closePath(); c.fill();
    }
    // 云
    c.fillStyle = 'rgba(230,242,255,.16)';
    const off3 = (camX * 0.12 * PPM) % 360;
    for (let i = -1; i < 4; i++) {
      const bx = i * 360 - off3, by = 90 + (i % 2) * 60;
      c.beginPath(); c.ellipse(bx + 60, by, 46, 16, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(bx + 100, by + 4, 32, 12, 0, 0, TAU); c.fill();
    }
  }

  function drawLevel(c, st, camX) {
    const level = st.level;
    if (!level) return;
    const gone = new Set((st.gone || []).map(g => g.x + ',' + g.y));
    const cracking = new Set((st.crumbling || []).map(g => g.x + ',' + g.y));
    const x0 = Math.max(0, Math.floor(camX) - 1), x1 = Math.min(level.width - 1, Math.ceil(camX + W_PX / PPM) + 1);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = 0; ty < level.height; ty++) {
        const tile = level.tiles[ty * level.width + tx];
        if (!tile) continue;
        const wx = (tx - camX) * PPM;
        const wy = sy(level.height - ty);
        const above = ty > 0 ? level.tiles[(ty - 1) * level.width + tx] : 0;
        if (tile === 1) {
          c.fillStyle = '#6b4a2f'; c.fillRect(wx, wy, PPM, PPM);
          c.fillStyle = 'rgba(0,0,0,.18)';
          c.fillRect(wx, wy + PPM * 0.5, PPM, 1.5);
          c.fillRect(wx + PPM * 0.5, wy, 1.5, PPM * 0.5);
          c.strokeStyle = 'rgba(30,18,10,.55)'; c.lineWidth = 1;
          c.strokeRect(wx + .5, wy + .5, PPM - 1, PPM - 1);
          if (!above) {
            c.fillStyle = '#4f8f3f'; c.fillRect(wx, wy, PPM, 6);
            c.fillStyle = '#66b04f'; c.fillRect(wx, wy, PPM, 3);
          }
        } else if (tile === 2) {
          c.fillStyle = '#b4652f'; c.fillRect(wx, wy, PPM, PPM);
          c.fillStyle = 'rgba(255,210,150,.18)'; c.fillRect(wx + 2, wy + 2, PPM - 4, 4);
          c.strokeStyle = 'rgba(70,30,10,.65)'; c.lineWidth = 1.2;
          c.strokeRect(wx + .5, wy + .5, PPM - 1, PPM - 1);
        } else if (tile === 3) {
          // 地刺：底部朝上的三角
          c.fillStyle = '#c8d2e0';
          for (let k = 0; k < 3; k++) {
            const bx = wx + k * PPM / 3;
            c.beginPath(); c.moveTo(bx, wy + PPM); c.lineTo(bx + PPM / 6, wy + PPM * 0.28); c.lineTo(bx + PPM / 3, wy + PPM); c.closePath(); c.fill();
          }
          c.fillStyle = 'rgba(255,90,70,.25)'; c.fillRect(wx, wy + PPM - 2, PPM, 2);
        } else if (tile === 4) {
          // 塌陷砖：有裂纹；已塌掉的由 gone 控制跳过
          if (gone.has(tx + ',' + ty)) continue;
          const isCracking = cracking.has(tx + ',' + ty);
          c.fillStyle = isCracking ? '#c98a4f' : '#8a6a3f';
          c.fillRect(wx, wy, PPM, PPM);
          c.strokeStyle = 'rgba(40,24,10,.7)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(wx + 4, wy + 2); c.lineTo(wx + PPM * 0.6, wy + PPM * 0.55); c.lineTo(wx + PPM * 0.4, wy + PPM - 2); c.stroke();
          c.strokeRect(wx + .5, wy + .5, PPM - 1, PPM - 1);
        }
      }
    }
    // 终点旗
    const gx = (level.goalX - camX) * PPM;
    if (gx > -40 && gx < W_PX + 40) {
      const gy = sy(level.height - 13);
      c.strokeStyle = '#dfe8f3'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, gy - PPM * 4); c.stroke();
      c.fillStyle = '#ffd166';
      c.beginPath(); c.moveTo(gx, gy - PPM * 4); c.lineTo(gx + PPM * 1.6, gy - PPM * 4 + PPM * .7); c.lineTo(gx, gy - PPM * 4 + PPM * 1.4); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,209,102,.12)';
      c.fillRect(gx - 6, gy - PPM * 4, PPM * 1.8, PPM * 4);
    }
  }

  function drawMachines(c, st, camX, t) {
    // 移动平台
    for (const pl of st.platforms || []) {
      const X = (pl.x - camX) * PPM, Y = sy(pl.y + pl.h), W = pl.w * PPM, H = pl.h * PPM;
      if (X + W < -20 || X > W_PX + 20) continue;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(X + 2, Y + H, W - 4, 3);
      c.fillStyle = '#8fa3b8'; c.fillRect(X, Y, W, H);
      c.fillStyle = '#c7d6e6'; c.fillRect(X, Y, W, 3);
      c.strokeStyle = 'rgba(20,30,42,.8)'; c.lineWidth = 1.2; c.strokeRect(X + .5, Y + .5, W - 1, H - 1);
      c.fillStyle = '#5d6f82';
      for (let k = 0; k < 2; k++) c.fillRect(X + 4 + k * (W - 10), Y + H - 4, 4, 2);
      // 运动轨迹
      c.strokeStyle = 'rgba(180,210,235,.18)'; c.setLineDash([3, 5]);
      c.beginPath(); c.moveTo((pl.x - camX) * PPM - 20, Y + H / 2); c.lineTo((pl.x - camX) * PPM + 20, Y + H / 2); c.stroke();
      c.setLineDash([]);
    }
    // 食人花
    for (const pl of st.plants || []) {
      const X = (pl.x - camX) * PPM;
      if (X < -30 || X > W_PX + 30) continue;
      const baseY = sy(pl.y + 1.0);
      c.fillStyle = '#2f6d3a'; c.fillRect(X - PPM * 0.42, baseY, PPM * 0.84, PPM);
      c.fillStyle = '#3f8f4d'; c.fillRect(X - PPM * 0.42, baseY, PPM * 0.3, PPM);
      c.strokeStyle = 'rgba(10,30,15,.8)'; c.lineWidth = 1.2; c.strokeRect(X - PPM * 0.42, baseY, PPM * 0.84, PPM);
      if (pl.height > 0.05) {
        const headY = sy(pl.y + pl.height);
        c.fillStyle = '#54a05f';
        c.beginPath(); c.ellipse(X, headY + 6, PPM * 0.34, PPM * 0.3, 0, 0, TAU); c.fill();
        c.fillStyle = '#e8f3e8';
        for (let k = -1; k <= 1; k++) {
          c.beginPath(); c.moveTo(X + k * 7 - 3, headY + 4); c.lineTo(X + k * 7, headY + 10); c.lineTo(X + k * 7 + 3, headY + 4); c.closePath(); c.fill();
        }
        c.fillStyle = '#c94f4f';
        c.beginPath(); c.arc(X - 6, headY + 2, 2.2, 0, TAU); c.fill();
        c.beginPath(); c.arc(X + 6, headY + 2, 2.2, 0, TAU); c.fill();
      }
    }
    // 旋转锯齿
    for (const sw of st.saws || []) {
      const X = (sw.x - camX) * PPM, Y = sy(sw.y), R = sw.r * PPM;
      if (X < -40 || X > W_PX + 40) continue;
      c.save(); c.translate(X, Y); c.rotate(t * 9);
      c.fillStyle = '#b8c4d2';
      c.beginPath();
      const teeth = 8;
      for (let k = 0; k < teeth * 2; k++) {
        const a = (k / (teeth * 2)) * TAU, rr = k % 2 ? R * 0.72 : R;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
      c.fillStyle = '#5d6f82'; c.beginPath(); c.arc(0, 0, R * 0.35, 0, TAU); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(255,120,90,.25)'; c.lineWidth = 1;
      c.beginPath(); c.arc(X, Y, R + 2, 0, TAU); c.stroke();
    }
  }

  function drawRunner(c, p, camX, t) {
    const X = (p.x - camX) * PPM, Y = sy(p.y);
    const col = teamColor(p.team), dark = teamDark(p.team);
    const w = 0.72 * PPM, h = 1.35 * PPM;
    c.save();
    if (p.invuln > 0 && Math.floor(t * 12) % 2 === 0) c.globalAlpha = 0.45;
    // 影子
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(X, Y + 3, w * .5, 4, 0, 0, TAU); c.fill();
    // 腿
    const run = p.onGround && Math.abs(p.vx) > 1 ? Math.sin(t * 18) * 5 : 0;
    c.strokeStyle = dark; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X - 4, Y - h * .42); c.lineTo(X - 4 + run, Y); c.stroke();
    c.beginPath(); c.moveTo(X + 4, Y - h * .42); c.lineTo(X + 4 - run, Y); c.stroke();
    // 身体
    c.fillStyle = col;
    c.beginPath(); c.roundRect ? c.roundRect(X - w * .34, Y - h * .82, w * .68, h * .48, 5) : c.rect(X - w * .34, Y - h * .82, w * .68, h * .48); c.fill();
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(X - w * .3, Y - h * .78, w * .6, 3);
    // 头
    c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(X, Y - h * .95, w * .29, 0, TAU); c.fill();
    // 帽子
    c.fillStyle = col;
    c.beginPath(); c.arc(X, Y - h * 1.02, w * .3, Math.PI, TAU); c.fill();
    c.fillRect(X + (p.facing > 0 ? 0 : -w * .5), Y - h * 1.04, w * .5, 4);
    // 眼睛
    c.fillStyle = '#1a2430';
    c.beginPath(); c.arc(X + p.facing * 3, Y - h * .95, 1.8, 0, TAU); c.fill();
    c.restore();
  }

  function drawMonster(c, m, camX, t) {
    const X = (m.x - camX) * PPM, Y = sy(m.y);
    const w = 0.72 * PPM;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath(); c.ellipse(X, Y + 3, w * .45, 3.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a3a6e';
    c.beginPath(); c.ellipse(X, Y - w * .28, w * .45, w * .38, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1a36';
    c.beginPath(); c.ellipse(X - w * .16, Y - w * .34, 3, 4, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(X + w * .16, Y - w * .34, 3, 4, 0, 0, TAU); c.fill();
    c.fillStyle = '#f2f2f2';
    c.beginPath(); c.arc(X - w * .16, Y - w * .36, 1.2, 0, TAU); c.fill();
    c.beginPath(); c.arc(X + w * .16, Y - w * .36, 1.2, 0, TAU); c.fill();
    // 脚
    const step = Math.sin(t * 8) * 2;
    c.fillStyle = '#3a2448';
    c.fillRect(X - w * .32 + step, Y - 4, w * .22, 4);
    c.fillRect(X + w * .1 - step, Y - 4, w * .22, 4);
    c.restore();
  }

  /* ==================== HUD ==================== */
  function pill(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  function drawHud(c, st) {
    const runs = st.runners || [];
    const players = st.players || [];
    const cx = W_PX / 2;
    c.save();
    c.fillStyle = 'rgba(6,10,16,.76)'; pill(c, cx - 210, 12, 420, 84, 12); c.fill();
    c.strokeStyle = 'rgba(111,200,255,.22)'; c.lineWidth = 1; c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#8f9bb0'; c.font = '600 11px "Segoe UI",sans-serif';
    c.fillText(`第 ${st.round} 局 · 三局两胜`, cx, 30);
    c.font = '800 18px "Segoe UI",sans-serif'; c.fillStyle = '#e9eef6';
    c.fillText(`${st.wins?.[0] ?? 0} : ${st.wins?.[1] ?? 0}`, cx, 56);
    c.font = '600 11px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
    c.fillText(`剩余 ${Math.ceil(st.roundLeft ?? 0)}s`, cx, 76);
    // 双方进度条
    const level = st.level;
    for (const p of runs) {
      const left = p.team === 0;
      const bx = left ? cx - 200 : cx + 20;
      const bw = 180, by = 62;
      c.fillStyle = '#141c26'; pill(c, bx, by, bw, 6, 3); c.fill();
      const frac = level ? clamp((p.x - level.startX) / (level.goalX - level.startX), 0, 1) : 0;
      c.fillStyle = teamColor(p.team); pill(c, bx, by, bw * frac, 6, 3); c.fill();
      c.font = '600 10px "Segoe UI",sans-serif'; c.fillStyle = teamColor(p.team);
      c.textAlign = left ? 'left' : 'right';
      c.fillText(`${p.name}  ${Math.round(frac * 100)}%`, left ? bx : bx + bw, by - 4);
    }
    c.textAlign = 'center';
    if (st.status === 'finished') { /* 覆盖层单独画 */ }
    else if (st.phase === 'freeze') {
      c.font = '800 24px "Segoe UI",sans-serif'; c.fillStyle = 'rgba(255,255,255,.9)';
      c.fillText('准备…', cx, 220);
    }
    c.restore();
  }

  function drawFinish(c, st) {
    const X = W_PX / 2, Y = H_PX / 2;
    c.fillStyle = 'rgba(5,9,14,.7)'; c.fillRect(0, 0, W_PX, H_PX);
    c.save(); c.textAlign = 'center';
    c.font = '800 38px "Segoe UI",sans-serif';
    c.fillStyle = st.winner === null ? '#e0c873' : teamColor(st.winner);
    c.fillText(st.winner === null ? '平 局' : `${st.players?.[st.winner]?.name || '?'} 获胜`, X, Y - 6);
    c.font = '600 15px "Segoe UI",sans-serif'; c.fillStyle = '#c3ccd9';
    c.fillText(`${st.wins?.[0] ?? 0} : ${st.wins?.[1] ?? 0} · ${st.reason || ''}`, X, Y + 28);
    c.font = '600 13px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
    c.fillText((st.runners || []).map(r => `${r.name} · 死亡 ${r.deaths}`).join('   '), X, Y + 54);
    c.restore(); c.textAlign = 'start';
  }

  function focusRunner(st) {
    const runs = st.runners || [];
    if (!runs.length) return null;
    if (!R.enabled) return runs.find(r => r.team === 0) || runs[0];
    return [...runs].sort((a, b) => b.x - a.x)[0];
  }

  function drawStage(c, st, positions, t) {
    if (!st) {
      c.clearRect(0, 0, W_PX, H_PX); c.fillStyle = '#070b10'; c.fillRect(0, 0, W_PX, H_PX);
      c.fillStyle = '#8f9bb0'; c.font = '600 15px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText(R.loading ? (R.loadingText || '正在载入回放…') : '暂无对局', W_PX / 2, H_PX / 2); c.textAlign = 'start'; return;
    }
    const level = st.level;
    const focus = positions?.runners?.find(r => r.id === focusRunner(st)?.id) || focusRunner(st);
    const halfView = W_PX / PPM / 2;
    const targetX = focus && level ? clamp(focus.x - halfView, -1, Math.max(0, level.width - halfView * 2 + 1)) : 0;
    if (!S.camInit) { S.camX = targetX; S.camInit = true; }
    else {
      const dt = clamp(t - (S.camT || t), 0, 0.05);
      S.camX += (targetX - S.camX) * (1 - Math.exp(-9 * Math.max(dt, 0.001)));
    }
    S.camT = t;
    const camX = S.camX;
    drawSky(c, camX);
    drawLevel(c, st, camX);
    drawMachines(c, st, camX, t);
    for (const m of st.monsters || []) drawMonster(c, m, camX, t);
    const runs = positions?.runners || st.runners || [];
    for (const r of runs) drawRunner(c, r, camX, t);
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
    const runners = (b.runners || []).map(r => {
      const q = (a.runners || []).find(x => x.id === r.id);
      return q ? { ...r, x: lerp(q.x, r.x, t), y: lerp(q.y, r.y, t) } : r;
    });
    const monsters = (b.monsters || []).map(m => {
      const q = (a.monsters || []).find(x => x.id === m.id);
      return q ? { ...m, x: lerp(q.x, m.x, t), y: lerp(q.y, m.y, t) } : m;
    });
    return { ...b, runners, monsters };
  }

  /* ==================== 侧栏 ==================== */
  const lastHtml = new Map();
  function setHtml(id, html) {
    if (lastHtml.get(id) === html) return false;
    lastHtml.set(id, html); $(id).innerHTML = html; return true;
  }
  function runnerRow(r, mine = false) {
    return `<div class="carrow${mine ? ' me' : ''}">
      <span class="idx" style="color:${teamColor(r.team)}">${r.team + 1}</span>
      <span class="un">${esc(r.name || '')}</span>
      <span class="lap">${r.deaths} 死</span>
      <span class="sp">${Math.round(r.x)} m</span></div>`;
  }
  function currentState() {
    return R.enabled ? (R.data?.frames?.[clamp(R.index, 0, (R.data?.frames?.length || 1) - 1)] || null) : S.state;
  }
  function renderSide() {
    const st = currentState();
    if (!st) {
      for (const id of ['matchCard', 'timeCard', 'meCard', 'rivalCard']) setHtml(id, '');
      return;
    }
    const runs = st.runners || [];
    const me = runs.find(r => r.team === 0);
    const rival = runs.find(r => r.team === 1);
    const level = st.level;
    setHtml('matchCard', `<h3>比赛</h3>
      <div class="scoreboard">${(st.players || []).map((p, i) => `<div class="prow">
        <span class="dot" style="background:${teamColor(i)}"></span><span class="nm">${esc(p.name || '')}</span>
        <span class="wins">${st.wins?.[i] ?? 0}</span></div>`).join('')}</div>
      <div class="row"><span class="k">局数</span><span class="v">第 ${st.round} 局 · 三局两胜</span></div>
      <div class="row"><span class="k">关卡</span><span class="v">${level ? level.width + ' 格 · 终点 ' + level.goalX : '—'}</span></div>`);

    const left = st.roundLeft ?? 0;
    setHtml('timeCard', `<h3>本局时间</h3>
      <div class="row"><span class="k">剩余</span><span class="v timebig ${left <= 10 ? 'danger' : left <= 30 ? 'soon' : ''}">${left.toFixed(1)}s</span></div>
      <div class="floodbar"><i style="width:${(clamp(left / 90, 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">阶段</span><span class="v">${st.phase === 'freeze' ? '准备' : st.phase === 'race' ? '竞速中' : '结束'}</span></div>`);

    const prog = (r) => level ? clamp((r.x - level.startX) / (level.goalX - level.startX), 0, 1) : 0;
    setHtml('meCard', `<h3>${R.enabled ? '左位玩家' : '你'}</h3>${me ? runnerRow(me, !R.enabled) : '<small>—</small>'}
      <div class="row"><span class="k">进度</span><span class="v">${Math.round((me ? prog(me) : 0) * 100)}%</span></div>
      <div class="floodbar"><i style="width:${((me ? prog(me) : 0) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">死亡</span><span class="v">${me?.deaths ?? 0}</span></div>`);
    setHtml('rivalCard', `<h3>对手</h3>${rival ? runnerRow(rival) : '<small>—</small>'}
      <div class="row"><span class="k">进度</span><span class="v">${Math.round((rival ? prog(rival) : 0) * 100)}%</span></div>
      <div class="row"><span class="k">死亡</span><span class="v">${rival?.deaths ?? 0}</span></div>`);

    const evs = (st.events || []).slice(-6).map(e => {
      if (e.type === 'respawn') return `<div><i>${e.t.toFixed(1)}s</i><span class="net">${esc((st.players?.[e.team]?.name) || '')} ${esc(e.reason)}，回起点</span></div>`;
      if (e.type === 'round') return `<div><i>${e.t.toFixed(1)}s</i><span class="pt">第 ${e.round} 局 · ${e.team == null ? '平局' : esc((st.players?.[e.team]?.name) || '') + ' 拿下'}（${esc(e.reason)}）</span></div>`;
      if (e.type === 'finish') return `<div><i>${e.t.toFixed(1)}s</i><span class="finish">${esc(e.reason || '结束')}</span></div>`;
      return '';
    }).join('');
    setHtml('logCard', `<h3>战况</h3><div class="log">${evs || '<small>等待开始…</small>'}</div>`);

    setHtml('legend', R.enabled
      ? '<b>回放</b> 拖动进度条跳转 · 播放/暂停 · 0.5×–4× 变速<br>逐物理帧回放（20 Hz）'
      : '<b>操作</b> A/D 移动 · W/空格 跳跃<br><b>规则</b> 从后面顶住对手可以推人 · 掉坑/碰怪回起点 · 三局两胜');
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
    R.id = id; R.index = 0; R.playing = false; R.clock = 0; R.loading = true; R.error = ''; S.banner = null; S.camInit = false;
    const ticket = ++R.ticket; renderReplayPanel(); renderGames();
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}`);
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).error || '回放读取失败');
      const data = JSON.parse(await res.text());
      if (ticket !== R.ticket) return;
      R.data = data;
      const levels = R.data.levels || {};
      for (const f of R.data.frames || []) { f.level = levels[String(f.round)] || R.data.level; f.rules = R.data.rules; f.events = R.data.events || []; }
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
      <div class="row"><span class="k">比分</span><span class="v">${final.wins?.[0] ?? 0} : ${final.wins?.[1] ?? 0}</span></div>
      <div class="row"><span class="k">胜者</span><span class="v">${final.winner === null ? '平局' : esc(labels[final.winner] || '')}</span></div>
      <div class="row"><span class="k">死亡</span><span class="v">${(final.runners || []).map(r => r.deaths).join(' / ')}</span></div>` : '';
    renderSide();
  }

  /* ==================== 本地输入 ==================== */
  async function sendInput() {
    if (S.mode !== 'local' || R.enabled || !S.match || S.state?.status !== 'playing') return;
    const k = S.keys;
    const input = {
      move: (k.has('KeyA') || k.has('ArrowLeft') ? -1 : 0) + (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0),
      jump: k.has('KeyW') || k.has('ArrowUp') || k.has('Space'),
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
      if (e.type === 'round') { S.banner = e.team == null ? '平局' : `${st.players?.[e.team]?.name || ''} 拿下第 ${e.round} 局`; S.bannerUntil = performance.now() + 1600; }
      if (e.type === 'finish') { S.banner = e.reason || '比赛结束'; S.bannerUntil = performance.now() + 2200; }
    }
    if (S.events.size > 900) S.events = new Set([...S.events].slice(-300));
  }
  async function createLocalMatch() {
    const res = await api('/api/matches', {
      mode: 'local', seed: Math.floor(Math.random() * 1e9),
      players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }],
    }, '');
    S.match = res.match; S.token = res.seats[0]?.token || null; S.mode = 'local';
    S.state = res.state; S.prevState = null; S.events.clear();
    S.banner = null; S.bannerUntil = 0; S.camInit = false;
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
    const tracked = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    addEventListener('keydown', e => { if (tracked.has(e.code)) { e.preventDefault(); S.keys.add(e.code); } });
    addEventListener('keyup', e => { if (tracked.has(e.code)) { e.preventDefault(); S.keys.delete(e.code); } });
    addEventListener('blur', () => S.keys.clear());
  }
  async function init() {
    try { S.catalog = await api('/api/catalog'); } catch { S.catalog = null; }
    $('meta').textContent = '· 随机关卡 · 20 Hz · 三局两胜';
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
  window.__platformer = { S, R };
})();
