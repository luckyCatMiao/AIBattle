/* 铁拳谱 · IRON CODEX — 程序绘制客户端。
 * 整个界面没有贴图：角色、场景、特效全部用 Canvas 2D 现场画。
 * 对局由服务端裁判；本页只做「采集键盘 → 提交窗口」和「渲染快照」两件事。 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const rcv = $('rstage'), rctx = rcv.getContext('2d');
  const W = 1280, H = 620;
  const GROUND_Y = 460;          // 与 catalog 的 stage.ground=500 对应的绘制基线
  const FLOOR = 96;              // 画布底部地面厚度

  const S = {
    catalog: null, match: null, token: null, player: 0, mode: 'local',
    team: [], state: null, prev: null, stateAt: 0, interval: 50, poll: 0, busy: false, keys: new Set(),
    inputQueue: [], lastAdvance: 0, banner: null, bannerUntil: 0, lastInputAt: 0, skipRender: 0,
  };
  const R = {
    enabled: false, runs: [], run: null, meta: null, data: null, id: null,
    index: 0, playing: false, speed: 1, clock: 0, loading: false, ticket: 0, error: '',
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function toast(msg, error = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 2600);
  }
  async function api(route, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token || S.token) headers.Authorization = `Bearer ${token || S.token}`;
    const res = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: `服务器返回 ${res.status}` }));
    if (!res.ok || data.error) throw Error(data.error || `请求失败 (${res.status})`);
    return data;
  }

  /* ==================== 键盘 → 帧输入 ==================== */

  // 把当前按住的键折算成本帧的 {dir, btn}。朝向由服务端换算成相对方向，这里只报绝对方位。
  function readKeys() {
    const k = S.keys;
    const back = k.has('a'), fwd = k.has('d'), up = k.has('w'), down = k.has('s');
    let dir = 'N';
    if (up) dir = fwd ? 'UF' : back ? 'UB' : 'U';
    else if (down) dir = fwd ? 'DF' : back ? 'DB' : 'D';
    else if (fwd) dir = 'F';
    else if (back) dir = 'B';
    const btn = k.has('j') ? 'LP' : k.has('k') ? 'HP' : k.has('u') ? 'LK' : k.has('i') ? 'HK' : k.has('l') ? 'G' : null;
    return { dir, btn };
  }

  /* 练习局的输入与画面为什么这样分工
   * ------------------------------------------------------------------
   * 引擎是 20 Hz 逐帧推进的，而屏幕是 60 Hz 刷新的。早期版本把「提交一条输入」
   * 和「画一帧」绑在同一个 requestAnimationFrame 里，结果必须先攒满 15 次循环
   * 才推进一个决策窗口 —— 画面每秒只更新 4 次、每次硬跳 15 帧，动作完全读不出来。
   * 正确的分工：
   *   输入 —— 按 20 Hz 采样，与引擎同频；发出去就不等回包（POST 是即时的）。
   *   画面 —— 60 fps 渲染，位置在「上一帧」和「当前帧」之间插值，平滑过渡。
   */
  function sendInput() {
    if (S.mode !== 'local' || R.enabled) return;
    if (!S.state || S.state.status !== 'playing') return;
    // 发后不管：不要 await 回包，否则网络往返会直接拖慢主循环。
    api(`/api/matches/${S.match}/step`, { input: readKeys() }).catch(() => {});
  }

  // 状态的插值视图：在 prev 与 state 之间按 t∈[0,1] 取中间位置。
  // 只插值位置与速度，生命/状态/出招帧这些离散量一律取最新，避免画面与判定不一致。
  function interpolate(t) {
    const cur = S.state;
    if (!cur || !S.prev || S.prev.round !== cur.round) return cur;
    const lerp = (a, b) => a + (b - a) * t;
    const fighters = cur.fighters.map((f, i) => {
      const p = S.prev.fighters[i];
      if (!p || p.id !== f.id) return f;
      return { ...f, x: lerp(p.x, f.x), y: lerp(p.y, f.y) };
    });
    const projectiles = (cur.projectiles || []).map(p => {
      const old = (S.prev.projectiles || []).find(q => q.id === p.id);
      return old ? { ...p, x: lerp(old.x, p.x), y: lerp(old.y, p.y) } : p;
    });
    return { ...cur, fighters, projectiles };
  }

  /* ==================== 选角 ==================== */

  function renderRoster() {
    const box = $('roster');
    box.innerHTML = Object.values(S.catalog.characters).map(c => {
      const i = S.team.indexOf(c.id);
      const normals = Object.values(c.normals).map(m => m.name).join(' · ');
      return `<div class="fc${i >= 0 ? ' picked' : ''}" data-id="${c.id}" data-order="${i + 1}">
        <div class="rune" style="color:${c.color}">${c.rune}</div>
        <div class="nm">${esc(c.name)}</div>
        <div class="arch">${esc(c.archetype)}</div>
        <div class="mv">${esc(normals)}</div>
        <div class="mv">必杀 ${esc(Object.values(c.specials).map(s => s.name).join(' / '))}<br>超必杀 ${esc(c.super.name)}</div>
      </div>`;
    }).join('');
    for (const el of box.querySelectorAll('.fc')) el.onclick = () => togglePick(el.dataset.id);
    renderSlots();
  }
  function togglePick(id) {
    const i = S.team.indexOf(id);
    if (i >= 0) S.team.splice(i, 1);
    else if (S.team.length < 3) S.team.push(id);
    else return toast('最多三名角色', true);
    renderRoster();
  }
  function renderSlots() {
    $('slots').innerHTML = [0, 1, 2].map(i => {
      const id = S.team[i];
      const c = id ? S.catalog.characters[id] : null;
      return `<div class="slot${c ? ' filled' : ''}" style="${c ? `border-color:${c.color}` : ''}">
        ${c ? `<span style="color:${c.color}">${c.rune}</span> ${esc(c.name.replace(/^.*· /, ''))}` : `第 ${i + 1} 位`}</div>`;
    }).join('');
    $('confirmTeam').disabled = S.team.length !== 3;
  }

  async function createMatch(mode) {
    const body = { mode, seed: Math.floor(Math.random() * 1e6) };
    if (mode === 'local') body.players = [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }];
    const res = await api('/api/matches', body, '');
    S.match = res.match;
    S.token = res.seats[0].token;
    S.player = res.seats[0].player;
    S.mode = mode;
    S.state = res.state;
    S.team = [];
    $('pick').classList.remove('hidden');
    $('fight').classList.add('hidden');
    renderRoster();
  }

  async function confirmTeam() {
    try {
      await api(`/api/matches/${S.match}/team`, { team: S.team });
      $('pick').classList.add('hidden');
      $('fight').classList.remove('hidden');
      await fetchState();
      showBanner('FIGHT', 900);
      if (S.mode === 'local') startLoop();
    } catch (e) { toast(e.message, true); }
  }

  /* ==================== 状态同步与渲染 ==================== */

  async function fetchState() {
    if (!S.match) return;
    try {
      const next = await api(`/api/matches/${S.match}`);
      // 保留上一帧用于插值；只有真的推进了才替换，避免来回抖动。
      if (!S.state || next.frame !== S.state.frame) { S.prev = S.state; S.stateAt = performance.now(); }
      S.state = next;
      handleEvents();
    } catch (e) { /* 轮询失败静默重试 */ }
  }

  function handleEvents() {
    const ev = S.state?.events || [];
    const last = ev.filter(e => e.frame >= (S.lastEventFrame || 0));
    for (const e of last) {
      if (e.type === 'matchEnd') showBanner(e.text || '结束', 2400);
      else if (e.type === 'round') showBanner(e.text || '', 1500);
      else if (e.type === 'roundEnd') showBanner(e.text || '', 1500);
      else if (e.type === 'super') showBanner('SUPER', 700);
      else if (e.type === 'parry') showBanner('PARRY', 600);
      else if (e.type === 'guardBreak') showBanner('GUARD BREAK', 800);
      S.lastEventFrame = e.frame;
    }
  }
  function showBanner(text, ms) { S.banner = text; S.bannerUntil = performance.now() + ms; }

  function drawStage(c, state, view) {
    c.clearRect(0, 0, W, H);
    // 天空与远景
    const sky = c.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#0e1620'); sky.addColorStop(.6, '#16212e'); sky.addColorStop(1, '#1d2a35');
    c.fillStyle = sky; c.fillRect(0, 0, W, GROUND_Y);
    c.fillStyle = 'rgba(118,188,206,.06)';
    for (let i = 0; i < 9; i++) c.fillRect(40 + i * 140, 60 + (i % 3) * 46, 86, 260 + (i % 4) * 40);
    // 地面
    const gr = c.createLinearGradient(0, GROUND_Y, 0, H);
    gr.addColorStop(0, '#2b3644'); gr.addColorStop(1, '#141a22');
    c.fillStyle = gr; c.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    c.strokeStyle = 'rgba(118,188,206,.35)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, GROUND_Y); c.lineTo(W, GROUND_Y); c.stroke();
    // 地面刻度：每 100 世界像素一格，帮助观众读距离
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
    for (let x = 0; x <= W; x += 100) { c.beginPath(); c.moveTo(x, GROUND_Y); c.lineTo(x, H); c.stroke(); }

    if (!state) return;
    const s = state.stage || { wallLeft: 60, wallRight: 1220 };
    const scale = W / s.width;

    // 投射物
    for (const p of state.projectiles || []) {
      c.fillStyle = p.color || '#dfe7f5';
      c.beginPath(); c.ellipse(p.x * scale, GROUND_Y - ((state.stage.ground - p.y) * .82), (p.w / 2) * scale + 4, (p.h / 2) + 4, 0, 0, 7); c.fill();
    }
    // 角色
    for (const f of state.fighters || []) drawFighter(c, f, scale, view);
    // 血条与状态
    drawHud(c, state);
    if (performance.now() < S.bannerUntil && S.banner) {
      c.font = '700 46px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.92)'; c.shadowColor = 'rgba(118,188,206,.9)'; c.shadowBlur = 26;
      c.fillText(S.banner, W / 2, 150); c.shadowBlur = 0; c.textAlign = 'start';
    }
  }

  function drawFighter(c, f, scale, view) {
    const cx = f.x * scale, cy = GROUND_Y - (500 - f.y) * .82;
    const def = S.catalog.characters[f.char];
    const col = f.owner === 0 ? '#76bcce' : '#e38978';
    const body = def.color;
    c.save();
    c.translate(cx, cy);
    c.scale(f.facing, 1);

    // 影子
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(0, 4, 34, 8, 0, 0, 7); c.fill();

    const crouch = f.state === 'crouch' || f.state === 'down';
    const h = crouch ? 68 : 104;

    // 攻击判定框（调试/观赏用：出招时画出判定范围）
    if (f.move && view.showBoxes) {
      const m = f.move, st = m.startup, ac = m.active;
      if (m.frame >= st && m.frame < st + ac) {
        const st2 = S.catalog.characters[f.char];
        c.fillStyle = 'rgba(255,80,80,.22)';
        c.fillRect(30, -(h - 20), 46, 34);
      }
    }

    // 腿
    c.strokeStyle = body; c.lineWidth = 11; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-4, -h * .45); c.lineTo(-12, 0); c.moveTo(4, -h * .45); c.lineTo(14, 0); c.stroke();
    // 躯干
    c.fillStyle = body;
    c.beginPath(); c.roundRect(-16, -h * .82, 32, h * .42, 9); c.fill();
    // 头
    c.beginPath(); c.arc(0, -h * .93, 13, 0, 7); c.fill();
    // 手臂 + 招式提示
    c.strokeStyle = body; c.lineWidth = 9;
    const m = f.move;
    let armX = 18, armY = -h * .62;
    if (m) {
      const prog = clamp((m.frame - m.startup) / Math.max(1, m.active + m.recovery * .5), 0, 1);
      if (m.kind === 'projectileHit') { /* 不受出招姿态影响 */ }
      armX = 18 + (m.startup <= 5 ? 42 : 30) * (m.frame >= m.startup ? 1 : prog * .5);
      if (def.archetype === '重装') armY -= 6;
    }
    c.beginPath(); c.moveTo(6, -h * .72); c.lineTo(armX, armY); c.stroke();

    // 状态描边
    if (f.state === 'attack') { c.strokeStyle = 'rgba(255,220,120,.85)'; c.lineWidth = 2; c.beginPath(); c.roundRect(-22, -h - 8, 44, h + 12, 10); c.stroke(); }
    if (f.state === 'stance') { c.strokeStyle = 'rgba(120,197,171,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(0, -h * .6, 44, 0, 7); c.stroke(); }
    if (f.state === 'hitstun') { c.fillStyle = 'rgba(255,120,120,.35)'; c.beginPath(); c.arc(0, -h * .6, 34, 0, 7); c.fill(); }
    if (f.state === 'down' || f.state === 'ko') { c.translate(0, 0); c.rotate(f.state === 'ko' ? .5 : 1.1); c.translate(-30, 0); c.fillStyle = body; c.beginPath(); c.roundRect(-20, -14, 56, 24, 10); c.fill(); }
    c.restore();

    // 朝向标记
    c.fillStyle = col;
    c.beginPath(); c.moveTo(cx + f.facing * 5, cy - 130); c.lineTo(cx + f.facing * 17, cy - 123); c.lineTo(cx + f.facing * 5, cy - 116); c.fill();

    // 角色名
    c.font = '600 11px "Segoe UI",sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(232,236,244,.55)';
    c.fillText(def.name.replace(/^.*· /, ''), cx, cy + 22);
    c.textAlign = 'start';
  }

  function drawHud(c, state) {
    const barW = 460, barH = 20, top = 22;
    for (let i = 0; i < 2; i++) {
      const f = state.fighters[i], p = state.players[i];
      if (!f) continue;
      const x = i === 0 ? 32 : W - 32 - barW;
      const hp = clamp(f.hp / f.maxHp, 0, 1);
      // 生命
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 2, top - 2, barW + 4, barH + 4);
      c.fillStyle = '#242c38'; c.fillRect(x, top, barW, barH);
      const grd = c.createLinearGradient(x, 0, x + barW, 0);
      grd.addColorStop(0, i === 0 ? '#76bcce' : '#e38978'); grd.addColorStop(1, i === 0 ? '#a8e6f5' : '#ffb3a1');
      c.fillStyle = grd; c.fillRect(i === 0 ? x : x + barW * (1 - hp), top, barW * hp, barH);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.strokeRect(x, top, barW, barH);
      // 气槽
      const mw = barW * .55, my = top + barH + 5;
      c.fillStyle = '#1a2129'; c.fillRect(x, my, mw, 7);
      c.fillStyle = f.meter >= 100 ? '#ffe08a' : '#8a7fd0'; c.fillRect(x, my, mw * clamp(f.meter / 100, 0, 1), 7);
      // 防御槽
      const gy = my + 10;
      c.fillStyle = '#1a2129'; c.fillRect(x, gy, mw, 5);
      c.fillStyle = f.guard > 40 ? '#6aa88f' : '#d08060'; c.fillRect(x, my + 10, mw * clamp(f.guard / 120, 0, 1), 5);
      // 名字与当前角色
      c.font = '600 12px "Segoe UI",sans-serif'; c.fillStyle = '#e8ecf4';
      c.textAlign = i === 0 ? 'start' : 'end';
      c.fillText(`${p.name} · ${f.name.replace(/^.*· /, '')}`, i === 0 ? x : x + barW, gy + 20);
      // 剩余角色
      const team = p.team.map((cid, idx) => {
        const dead = idx < p.active;
        const cur = idx === p.active;
        return { cid, dead, cur };
      });
      c.font = '600 10px "Segoe UI",sans-serif';
      team.forEach((t, idx) => {
        const tx = i === 0 ? x + idx * 46 : x + barW - idx * 46 - 44;
        c.fillStyle = t.dead ? 'rgba(143,155,176,.35)' : t.cur ? '#ffd98a' : 'rgba(232,236,244,.8)';
        c.fillText(S.catalog.characters[t.cid].name.replace(/^.*· /, ''), tx, gy + 36);
      });
      c.textAlign = 'start';
    }
    // 计时与局数
    const left = Math.max(0, (state.rules?.timer || 60) - (state.roundFrame / (state.rules?.hz || 20)));
    c.font = '700 26px "Segoe UI",sans-serif'; c.textAlign = 'center';
    c.fillStyle = left < 10 ? '#e38978' : '#e8ecf4';
    c.fillText(String(Math.ceil(left)).padStart(2, '0'), W / 2, top + 34);
    c.font = '600 11px "Segoe UI",sans-serif'; c.fillStyle = 'rgba(143,155,176,.9)';
    c.fillText(`第 ${state.round} 局 · ${state.players[0]?.wins ?? 0} : ${state.players[1]?.wins ?? 0}`, W / 2, top + 50);
    c.textAlign = 'start';
  }

  function renderSide() {
    const st = S.state;
    if (!st) return;
    const me = st.players[S.player], them = st.players[1 - S.player];
    const mf = st.fighters[S.player], tf = st.fighters[1 - S.player];
    $('sideCard').innerHTML = `<h3>对局</h3>
      <div class="row"><span class="k">状态</span><span class="v">${st.status === 'playing' ? '进行中' : st.status === 'picking' ? '选角中' : '已结束'}</span></div>
      <div class="row"><span class="k">帧 / 局</span><span class="v">${st.frame} · R${st.round}</span></div>
      <div class="row"><span class="k">比分</span><span class="v">${me.wins} : ${them.wins}</span></div>
      ${st.winner !== null && st.winner !== undefined ? `<div class="row"><span class="k">结果</span><span class="v" style="color:#ffd98a">${esc(st.players[st.winner].name)} 获胜</span></div>` : ''}
      ${st.reason ? `<div class="row"><span class="k">结算</span><span class="v">${esc(st.reason)}</span></div>` : ''}`;
    const line = (p, i) => p.team.map((cid, idx) => {
      const c = S.catalog.characters[cid];
      const dead = idx < p.active, cur = idx === p.active && st.status !== 'finished';
      return `<div class="teamline${dead ? ' dead' : ''}" style="--c:${c.color}">
        <span class="dot" style="background:${c.color}"></span>${esc(c.name)}${cur ? '<span class="cur">出场中</span>' : ''}</div>`;
    }).join('');
    $('teamCard').innerHTML = `<h3>${esc(me.name)}</h3>${line(me, S.player)}<h3 style="margin-top:12px">${esc(them.name)}</h3>${line(them, 1 - S.player)}`;
    if (mf && tf) {
      $('statsCard').innerHTML = `<h3>当前角色</h3>
        <div class="row"><span class="k">${esc(mf.name)} 生命</span><span class="v">${mf.hp}</span></div>
        <div class="row"><span class="k">对手生命</span><span class="v">${tf.hp}</span></div>
        <div class="row"><span class="k">距离</span><span class="v">${Math.round(Math.abs(mf.x - tf.x))}</span></div>
        <div class="row"><span class="k">你出招</span><span class="v">${mf.move ? `${esc(mf.move.name)} f${mf.move.frame}` : mf.state}</span></div>
        <div class="row"><span class="k">对手出招</span><span class="v">${tf.move ? `${esc(tf.move.name)} f${tf.move.frame}` : tf.state}</span></div>
        <div class="row"><span class="k">连段 / 命中</span><span class="v">${me.maxCombo} / ${me.hits}</span></div>
        <div class="row"><span class="k">防御 / 架式</span><span class="v">${me.blocks} / ${me.parries}</span></div>`;
    }
  }

  function loop(ts) {
    // 输入按 20 Hz 采样（与引擎同频），不是每个渲染帧都发——
    // 发太密没有意义（引擎每 50 ms 才走一帧），只会浪费往返。
    if (S.mode === 'local' && S.state && S.state.status === 'playing' && !R.enabled) {
      if (!S.lastInputAt || ts - S.lastInputAt >= S.interval) { S.lastInputAt = ts; sendInput(); }
    }
    if (!R.enabled && S.state) {
      // 用「距上次状态更新的时长 / 引擎帧间隔」作为插值系数，让 60 fps 的画面平滑填满 20 Hz 的推进。
      const t = S.mode === 'local' ? clamp((performance.now() - S.stateAt) / S.interval, 0, 1) : 1;
      drawStage(ctx, t < 1 ? interpolate(t) : S.state, { showBoxes: S.keys.has('h') });
    }
    requestAnimationFrame(loop);
  }
  function startLoop() { if (!S.looping) { S.looping = true; requestAnimationFrame(loop); } }

  /* ==================== 回放 ==================== */

  async function loadRuns() {
    try {
      const r = await api('/api/arena/runs');
      R.runs = r.runs || [];
      R.activeRun = r.activeRun;
      if (!R.run && R.runs.length) R.run = R.activeRun || R.runs[0].run;
      renderRuns();
      await loadRunMeta();
    } catch (e) { R.error = e.message; renderRuns(); }
  }
  function renderRuns() {
    $('runCard').innerHTML = `<h3>比赛系列</h3>
      <div class="runs">${R.runs.length ? R.runs.map(r => `<button data-run="${r.run}" class="${R.run === r.run ? 'on' : ''}">
        ${esc(r.run)}<small>${esc((r.labels ? Object.values(r.labels).join(' vs ') : ''))} · ${r.games} 局 · ${esc(r.phase || '')}</small>
      </button>`).join('') : `<small style="color:#8f9bb0">${esc(R.error || '还没有已归档的系列赛。运行 fighting/arena/train.py 后会出现在这里。')}</small>`}</div>`;
    for (const el of $('runCard').querySelectorAll('.runs button')) el.onclick = () => { R.run = el.dataset.run; R.data = null; R.id = null; loadRunMeta(); renderRuns(); };
  }
  async function loadRunMeta() {
    try {
      R.meta = await api(`/api/arena?run=${encodeURIComponent(R.run)}`);
      renderGameList();
    } catch (e) { R.meta = null; }
  }
  function renderGameList() {
    const gs = R.meta?.games || [];
    $('gameCard').innerHTML = `<h3>对局</h3>
      ${gs.length ? `<div class="games">${gs.map(g => `<button data-g="${g.id}" class="${R.id === g.id ? 'on' : ''}">${g.id} · ${esc((g.seats || []).join('/'))}</button>`).join('')}</div>` : '<small style="color:#8f9bb0">暂无对局</small>'}`;
    for (const el of $('gameCard').querySelectorAll('.games button')) el.onclick = () => loadGame(el.dataset.g);
    renderScoreline();
  }
  function renderScoreline() {
    const results = R.meta?.results || [];
    if (!results.length) { $('statsCard').innerHTML = ''; return; }
    const labels = R.meta.labels || {};
    const tally = {};
    for (const r of results) tally[r.winner] = (tally[r.winner] || 0) + 1;
    const ids = Object.keys(R.meta.models || {});
    $('statsCard').innerHTML = `<h3>总比分</h3>
      <div class="scoreline">${ids.map(i => `${esc(labels[i] || i)} <b>${tally[i] || 0}</b>`).join(' &nbsp;:&nbsp; ')}</div>
      <div class="row"><span class="k">局数</span><span class="v">${results.length}</span></div>`;
  }

  async function loadGame(id) {
    R.id = id; R.loading = true; R.error = '';
    renderGameList();
    const ticket = ++R.ticket;
    try {
      const res = await fetch(`/api/arena/games/${id}?run=${encodeURIComponent(R.run)}`);
      if (!res.ok) throw Error((await res.json().catch(() => ({}))).error || '回放读取失败');
      const reader = res.body?.getReader();
      let text = '';
      if (reader) {
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (ticket !== R.ticket) return;
          if (done) break;
          text += dec.decode(value, { stream: true });
        }
      } else text = await res.text();
      if (ticket !== R.ticket) return;
      R.data = JSON.parse(text);
      R.index = 0; R.playing = false; R.clock = 0;
      renderReplayPanel();
      showReplayFrame();
    } catch (e) { R.error = e.message; renderReplayPanel(); }
    finally { R.loading = false; }
  }

  function renderReplayPanel() {
    const d = R.data;
    if (!d) {
      $('replayCard').innerHTML = `<h3>回放</h3><small style="color:#8f9bb0">${esc(R.error || '选择一局开始播放')}</small>`;
      return;
    }
    const last = d.frames.length - 1;
    $('replayCard').innerHTML = `<h3>回放 ${esc(d.id)}</h3>
      <div class="row"><span class="k">结果</span><span class="v">${d.winner === null ? '平局' : esc((R.meta?.labels || {})[d.winner === 0 ? d.seats[0] : d.seats[1]] || d.seats[d.winner])} · ${esc(d.reason)}</span></div>
      <div class="row"><span class="k">帧</span><span class="v"><span id="rf">${R.index}</span> / ${last}</span></div>
      <div class="transport">
        <button id="rPlay">${R.playing ? '暂停' : '播放'}</button>
        <input type="range" id="rSeek" min="0" max="${last}" value="${R.index}">
        <div class="speeds">${[0.5, 1, 2, 4].map(s => `<button data-s="${s}" class="${R.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
      </div>
      <div class="row"><span class="k">阵容</span><span class="v">${(d.teams || []).map(t => t.map(c => S.catalog.characters[c]?.name.replace(/^.*· /, '') || c).join(' / ')).join('  vs  ')}</span></div>`;
    $('rPlay').onclick = () => { R.playing = !R.playing; renderReplayPanel(); };
    $('rSeek').oninput = e => { R.index = Number(e.target.value); R.playing = false; showReplayFrame(); $('rf').textContent = R.index; };
    for (const b of $('replayCard').querySelectorAll('.speeds button')) b.onclick = () => { R.speed = Number(b.dataset.s); renderReplayPanel(); };
  }

  function showReplayFrame() {
    if (!R.data) return;
    const f = R.data.frames[clamp(R.index, 0, R.data.frames.length - 1)];
    drawStage(rctx, f, { showBoxes: false });
  }

  function replayTick(ts) {
    if (R.enabled) {
      if (R.playing && R.data) {
        R.clock += (ts - (R.lastTick || ts)) * R.speed;
        R.lastTick = ts;
        // 回放帧率 = 20 帧/秒（与引擎一致）× 倍速
        const advance = Math.floor(R.clock / 50);
        if (advance > 0) {
          R.clock -= advance * 50;
          const last = R.data.frames.length - 1;
          R.index = Math.min(last, R.index + advance);
          if (R.index >= last) R.playing = false;
          const seek = $('rSeek');
          if (seek) { seek.value = String(R.index); $('rf').textContent = R.index; }
          showReplayFrame();
        }
      } else R.lastTick = ts;
    }
    requestAnimationFrame(replayTick);
  }

  async function loadReviews() {
    if (!R.run) return;
    const ids = Object.keys(R.meta?.models || {});
    const parts = [];
    for (const who of ids) {
      try {
        const res = await fetch(`/api/arena/reviews/${who}?run=${encodeURIComponent(R.run)}`);
        if (res.ok) parts.push(await res.text());
      } catch {}
    }
    $('reviewCard').innerHTML = `<h3>中文自述与复盘</h3>${parts.length ? `<div class="review">${esc(parts.join('\n\n'))}</div>` : '<small style="color:#8f9bb0">暂无</small>'}`;
  }

  /* ==================== 模式切换与启动 ==================== */

  async function enterReplay() {
    R.enabled = true;
    $('pick').classList.add('hidden');
    $('fight').classList.add('hidden');
    $('replay').classList.remove('hidden');
    startLoop();
    if (!S.catalog) S.catalog = await api('/api/catalog');
    await loadRuns();
    const first = R.meta?.games?.[0];
    if (first) await loadGame(first.id);
    loadReviews();
  }
  function enterLocal() {
    R.enabled = false;
    $('replay').classList.add('hidden');
    createMatch('local').then(() => startLoop()).catch(e => toast(e.message, true));
  }

  function wireInput() {
    const map = { a: 'a', d: 'd', w: 'w', s: 's', j: 'j', k: 'k', u: 'u', i: 'i', l: 'l', h: 'h' };
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (map[k]) { S.keys.add(k); e.preventDefault(); }
    });
    addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      if (map[k]) { S.keys.delete(k); e.preventDefault(); }
    });
    addEventListener('blur', () => S.keys.clear());
  }

  async function init() {
    S.catalog = await api('/api/catalog');
    $('meta').textContent = `· 角色 ${Object.keys(S.catalog.characters).length} · ${S.catalog.rules.decisionFrames} 帧/窗口`;
    renderRoster();
    wireInput();
    for (const b of $('modes').querySelectorAll('button')) b.onclick = () => {
      for (const o of $('modes').querySelectorAll('button')) o.classList.toggle('on', o === b);
      if (b.dataset.mode === 'watch') { R.playing = false; enterReplay(); } else enterLocal();
    };
    $('confirmTeam').onclick = confirmTeam;
    startLoop();
    requestAnimationFrame(replayTick);
    // 默认进入真人练习
    await createMatch('local');
    // 状态轮询与引擎同频（20 Hz）。慢了插值就会退化成重复插同一段，画面会顿。
    setInterval(() => { if (!R.enabled && !S.busy) { S.busy = true; fetchState().finally(() => { S.busy = false; }); } }, S.interval);
  }
  init().catch(e => toast('初始化失败：' + e.message, true));
})();
