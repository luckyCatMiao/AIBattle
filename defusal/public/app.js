/* 爆破模式 · BOMB DEFUSAL — Canvas 2D 客户端。
 * 服务端 20 Hz 推进；本页负责移动/瞄准输入、购买、快照轮询与 60 fps 绘制。
 * 有席位凭据时只拿自己队伍的视野（逐单位视锥 + 近身）；无凭据观战拿完整战场。 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const TILE = 24, TAU = Math.PI * 2;
  const TEAM_COLORS = ['#76bcce', '#e38978'];
  const teamColor = team => TEAM_COLORS[team] || '#dfe7f5';
  const SIDE_NAME = { attack: '进攻', defend: '防守' };

  /* 武器外观表 —— 只用于绘制，不参与任何游戏逻辑。
   * color 同时决定枪身、枪口火光、弹道拖尾和面板色标，看到颜色就能认枪。 */
  const GUN = {
    pistol:  { abbr: 'P',   name: '手枪',   color: '#dce6f5', len: 11.0, bore: 2.3, bullet: 2.2, shape: 'pistol' },
    pdw:     { abbr: 'PDW', name: 'PDW',    color: '#7ee0bd', len: 13.5, bore: 2.3, bullet: 2.5, shape: 'pdw' },
    smg:     { abbr: 'SMG', name: '冲锋枪', color: '#6fc8ff', len: 15.0, bore: 2.5, bullet: 2.7, shape: 'smg' },
    rifle:   { abbr: 'R',   name: '步枪',   color: '#ffd166', len: 19.0, bore: 2.6, bullet: 3.1, shape: 'rifle' },
    shotgun: { abbr: 'SG',  name: '霰弹枪', color: '#ff9d6b', len: 16.5, bore: 3.4, bullet: 2.1, shape: 'shotgun' },
    sniper:  { abbr: 'SR',  name: '狙击枪', color: '#bda4ff', len: 23.0, bore: 2.4, bullet: 4.0, shape: 'sniper' },
    lmg:     { abbr: 'LMG', name: '机枪',   color: '#ff80bd', len: 20.0, bore: 2.9, bullet: 3.0, shape: 'lmg' },
  };
  const gunOf = w => GUN[w] || {
    abbr: String(w || '?').slice(0, 3).toUpperCase(), name: w || '?',
    color: '#c3ccd9', len: 12, bore: 2.2, bullet: 2.6, shape: 'rifle',
  };
  const WEAPON_ABBR = Object.fromEntries(Object.entries(GUN).map(([k, v]) => [k, v.abbr]));

  let W = 40, H = 24;
  function setDims(w, h) { if (w && h && (w !== W || h !== H)) { W = w; H = h; cv.width = W * TILE; cv.height = H * TILE; } }

  const S = {
    catalog: null, match: null, token: null, player: 0, mode: 'local',
    state: null, prevState: null, poll: 50, busy: false,
    keys: new Set(), mouse: { x: 0, y: 0, active: false }, inputAt: 0,
    events: new Set(), banner: null, bannerUntil: 0, log: [],
    lastFrame: 0, lastTs: 0, buying: false,
  };
  const R = {
    enabled: false, runs: [], run: null, meta: null, data: null, id: null,
    index: 0, playing: false, speed: 1, clock: 0, loading: false, loadingText: '',
    ticket: 0, error: '', frameMs: 50,
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pulse = (t, period) => (Math.sin((t / period) * TAU - Math.PI / 2) + 1) / 2;

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

  /* ==================== 绘制 ==================== */

  function tileAt(st, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 1;
    return st.map?.tiles?.[ty * W + tx] || 0;
  }

  // 稳定哈希：同一格每次得到相同的“磨损”，避免地面闪烁。
  function hash2(x, y) {
    let h = Math.imul(x + 0x9e37, 374761393) ^ Math.imul(y + 0x85eb, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  /* 地板与墙体是静态的：按地图内容缓存到离屏画布，
   * 每帧只 drawImage 一次，60 fps 下不再逐格重画。 */
  const SCENE = { key: '', canvas: null };
  function mapSignature(st) {
    const tiles = st.map?.tiles;
    if (!tiles) return '';
    let h = 2166136261 >>> 0;
    for (let i = 0; i < tiles.length; i++) h = Math.imul(h ^ tiles[i], 16777619) >>> 0;
    return `${st.map.width}x${st.map.height}:${h}`;
  }
  function sceneLayer(st) {
    const key = mapSignature(st);
    if (SCENE.canvas && SCENE.key === key) return SCENE.canvas;
    const off = document.createElement('canvas');
    off.width = W * TILE; off.height = H * TILE;
    const c = off.getContext('2d');
    paintFloor(c);
    paintWalls(c, st);
    SCENE.key = key; SCENE.canvas = off;
    return off;
  }

  function paintFloor(c) {
    const w = W * TILE, h = H * TILE;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#121a26'); g.addColorStop(.55, '#0d141d'); g.addColorStop(1, '#080c12');
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    // 水泥地砖：交错明暗 + 确定性磨损
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = hash2(x, y);
      if ((x + y) % 2 === 0) {
        c.fillStyle = `rgba(150,180,210,${(0.010 + n * 0.012).toFixed(3)})`;
        c.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      if (n > 0.962) {
        c.fillStyle = 'rgba(0,0,0,.20)';
        c.fillRect(x * TILE + 3 + (n * 13 | 0), y * TILE + 4 + (n * 71 % 14 | 0), 3, 2);
      }
    }

    c.strokeStyle = 'rgba(120,170,215,.055)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < W; x++) { c.moveTo(x * TILE + .5, 0); c.lineTo(x * TILE + .5, h); }
    for (let y = 1; y < H; y++) { c.moveTo(0, y * TILE + .5); c.lineTo(w, y * TILE + .5); }
    c.stroke();

    // 四周压暗，把注意力留在中部战场
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .18, w / 2, h / 2, Math.max(w, h) * .70);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  function pill(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }

  function wallAt(st, x, y) {
    const tiles = st.map?.tiles;
    if (!tiles) return false;
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return tiles[y * W + x] === 1;
  }

  function paintWalls(c, st) {
    const tiles = st.map?.tiles || [];
    // 先统一铺地面阴影，再铺墙身，避免阴影压到相邻墙面的高光上。
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== 1) continue;
      c.fillStyle = 'rgba(0,0,0,.45)';
      pill(c, x * TILE + 4, y * TILE + 5, TILE - 3, TILE - 3, 5); c.fill();
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== 1) continue;
      const px = x * TILE, py = y * TILE, p = 2;
      const n = hash2(x + 91, y + 17);
      const topOpen = !wallAt(st, x, y - 1);
      const bottomOpen = !wallAt(st, x, y + 1);
      const leftOpen = !wallAt(st, x - 1, y);

      const g = c.createLinearGradient(px, py, px, py + TILE);
      g.addColorStop(0, `rgb(${64 + n * 14 | 0},${82 + n * 14 | 0},${106 + n * 16 | 0})`);
      g.addColorStop(.55, '#2a3a4c');
      g.addColorStop(1, '#1a2632');
      c.fillStyle = g;
      pill(c, px + p, py + p, TILE - p * 2, TILE - p * 2, 4); c.fill();

      // 只有朝外的边才加高光/暗边，整片墙看起来像一个整体的箱体
      if (topOpen) { c.fillStyle = `rgba(214,236,255,${(0.10 + n * 0.06).toFixed(3)})`; c.fillRect(px + 4, py + 4, TILE - 8, 2.5); }
      if (leftOpen) { c.fillStyle = 'rgba(255,255,255,.045)'; c.fillRect(px + 4, py + 5.5, 1.5, TILE - 10); }
      if (bottomOpen) { c.fillStyle = 'rgba(0,0,0,.38)'; c.fillRect(px + 4, py + TILE - 6.5, TILE - 8, 2.5); }

      c.strokeStyle = 'rgba(9,14,20,.9)'; c.lineWidth = 1.1;
      pill(c, px + p, py + p, TILE - p * 2, TILE - p * 2, 4); c.stroke();
    }
  }

  function drawSites(c, st, t) {
    const sites = st.map?.sites || {};
    for (const [label, s] of Object.entries(sites)) {
      const x = s.x1 * TILE, y = s.y1 * TILE, w = (s.x2 - s.x1 + 1) * TILE, h = (s.y2 - s.y1 + 1) * TILE;
      const ph = pulse(t + label.charCodeAt(0) * .7, 2.4);
      c.save();

      const g = c.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, Math.max(w, h) * .62);
      g.addColorStop(0, `rgba(224,184,115,${(.10 + ph * .05).toFixed(3)})`);
      g.addColorStop(1, 'rgba(224,184,115,.02)');
      c.fillStyle = g; c.fillRect(x, y, w, h);

      // 四角括号，比整圈虚线更利落
      const k = 15;
      c.strokeStyle = `rgba(240,205,140,${(.45 + ph * .25).toFixed(3)})`;
      c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + 4, y + k + 4); c.lineTo(x + 4, y + 4); c.lineTo(x + k + 4, y + 4);
      c.moveTo(x + w - k - 4, y + 4); c.lineTo(x + w - 4, y + 4); c.lineTo(x + w - 4, y + k + 4);
      c.moveTo(x + 4, y + h - k - 4); c.lineTo(x + 4, y + h - 4); c.lineTo(x + k + 4, y + h - 4);
      c.moveTo(x + w - k - 4, y + h - 4); c.lineTo(x + w - 4, y + h - 4); c.lineTo(x + w - 4, y + h - k - 4);
      c.stroke();

      c.strokeStyle = `rgba(224,184,115,${(.18 + ph * .12).toFixed(3)})`;
      c.lineWidth = 1.4; c.setLineDash([7, 7]); c.lineDashOffset = -t * 12;
      c.strokeRect(x + 6, y + 6, w - 12, h - 12);
      c.setLineDash([]); c.lineDashOffset = 0;

      c.font = '800 30px "Segoe UI",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = `rgba(224,184,115,${(.14 + ph * .08).toFixed(3)})`;
      c.fillText(label, x + w / 2, y + h / 2 + 2);
      c.fillStyle = `rgba(255,214,150,${(.42 + ph * .22).toFixed(3)})`;
      c.fillText(label, x + w / 2, y + h / 2);
      c.textBaseline = 'alphabetic'; c.textAlign = 'start';
      c.restore();
    }
  }

  function drawableUnits(st) {
    if (!st) return [];
    const list = (st.units || []).map(u => ({ ...u, enemy: false }));
    if (st.visibleEnemies) {
      const seen = new Set(list.map(u => u.id));
      for (const arr of Object.values(st.visibleEnemies)) for (const e of arr) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        list.push({ ...e, enemy: true, alive: true, hp: null, armor: null });
      }
    }
    return list;
  }

  function blend(prev, st, a) {
    if (!prev) return null;
    const prevMap = new Map(drawableUnits(prev).map(u => [u.id, u]));
    const actors = new Map();
    for (const u of drawableUnits(st)) {
      const p = prevMap.get(u.id);
      actors.set(u.id, p && p.alive !== false && u.alive !== false
        ? { ...u, x: lerp(p.x, u.x, a), y: lerp(p.y, u.y, a) }
        : u);
    }
    const prevBullets = new Map((prev.bullets || []).map(b => [b.id, b]));
    const bullets = new Map();
    for (const b of st.bullets || []) {
      const p = prevBullets.get(b.id);
      // dx/dy 是两帧之间的位移，只用来画弹道拖尾的方向。
      bullets.set(b.id, p
        ? { ...b, x: lerp(p.x, b.x, a), y: lerp(p.y, b.y, a), dx: b.x - p.x, dy: b.y - p.y }
        : b);
    }
    return { actors, bullets };
  }

  function drawVision(c, st, u) {
    if (!u.alive) return;
    const half = (st.rules?.visionHalfAngle || 0.87);
    const range = st.rules?.visionRange || 8;
    const facing = Math.atan2(u.facing.y, u.facing.x);
    const pts = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const ang = facing - half + (2 * half) * (i / N);
      let d = 0.2;
      for (; d <= range; d += 0.22) {
        if (tileAt(st, u.x + Math.cos(ang) * d, u.y + Math.sin(ang) * d) === 1) break;
      }
      d = Math.min(d + 0.08, range);
      pts.push([u.x + Math.cos(ang) * d, u.y + Math.sin(ang) * d]);
    }
    const X = u.x * TILE, Y = u.y * TILE, col = teamColor(u.team);
    c.save();
    // 从脚下向外渐隐，避免整块扇形糊成一片
    const g = c.createRadialGradient(X, Y, TILE * .4, X, Y, range * TILE);
    g.addColorStop(0, col + '20'); g.addColorStop(.5, col + '0d'); g.addColorStop(1, col + '00');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(X, Y);
    for (const [x, y] of pts) c.lineTo(x * TILE, y * TILE);
    c.closePath(); c.fill();
    c.strokeStyle = col + '24'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(X, Y);
    for (const [x, y] of pts) c.lineTo(x * TILE, y * TILE);
    c.closePath(); c.stroke();
    c.restore();
  }

  /* 按朝向画枪：不同武器用不同轮廓 + 专属颜色，
   * 远看颜色、近看形状，都能分清谁拿的什么。 */
  function drawGun(c, weapon, X, Y, fa) {
    const g = gunOf(weapon);
    const col = g.color;
    c.save();
    c.translate(X, Y);
    c.rotate(fa);
    c.translate(0, 3.6); // 右手持枪：枪身压在下半侧，编号仍可读
    const part = (x, y, w, h, r = .8) => {
      pill(c, x, y, w, h, r);
      c.fillStyle = col; c.fill();
      c.strokeStyle = 'rgba(6,10,15,.92)'; c.lineWidth = 1; c.stroke();
    };
    c.lineJoin = 'round';
    switch (g.shape) {
      case 'pistol':
        part(2.0, -1.15, 9.0, 2.3);       // 套筒
        part(3.4, 0.8, 2.4, 4.2, .6);     // 握把
        break;
      case 'pdw':
        part(-1.2, -1.4, 3.8, 2.4);       // 短托
        part(1.8, -1.15, 11.7, 2.3);
        part(6.4, 0.8, 2.2, 4.4, .6);     // 弹匣
        break;
      case 'smg':
        part(-3.2, -1.5, 4.8, 2.6);       // 折叠托
        part(1.2, -1.25, 13.8, 2.5);
        part(7.6, 0.8, 2.6, 5.4, .6);
        break;
      case 'rifle':
        part(-4.0, -1.7, 5.4, 2.8);       // 枪托
        part(1.0, -1.3, 18.0, 2.6);
        part(7.8, 0.8, 2.8, 6.4, .7);     // 弹匣
        part(11.0, -2.6, 2.6, 1.3);       // 准星
        break;
      case 'shotgun':
        part(-3.8, -2.0, 5.0, 3.8);       // 枪托
        part(1.0, -2.4, 15.5, 1.9);       // 上管
        part(1.0, 0.1, 15.5, 1.9);        // 下管
        part(5.4, 2.2, 5.4, 2.4, .8);     // 泵动护木
        break;
      case 'sniper':
        part(-5.0, -1.8, 5.8, 3.2);       // 枪托
        part(0.6, -1.2, 22.4, 2.4);
        part(7.0, -4.2, 6.6, 2.2, .8);    // 瞄具
        part(8.4, 0.8, 2.4, 4.8, .6);
        break;
      case 'lmg':
        part(-4.2, -2.0, 5.4, 3.6);       // 枪托
        part(1.0, -1.45, 19.0, 2.9);
        part(7.0, 1.0, 5.8, 5.4, .8);     // 弹箱
        part(2.8, 1.8, 1.3, 4.2, .5);     // 脚架
        break;
      default:
        part(2.0, -1.2, 14, 2.4);
    }
    c.fillStyle = 'rgba(255,255,255,.6)'; // 枪口
    c.fillRect(g.len - 1.8, -0.8, 1.8, 1.6);
    c.restore();
  }

  function drawUnit(c, u, st, t) {
    const X = u.x * TILE, Y = u.y * TILE, R0 = 9.2;
    const col = teamColor(u.team);
    c.save();
    if (u.alive === false) {
      c.globalAlpha = .34; c.strokeStyle = col; c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(X - 6, Y - 6); c.lineTo(X + 6, Y + 6); c.moveTo(X + 6, Y - 6); c.lineTo(X - 6, Y + 6); c.stroke();
      c.restore(); return;
    }
    const human = st.yourTeam != null && u.team === st.yourTeam && u.index === 0;
    const fa = Math.atan2(u.facing.y, u.facing.x);
    const isEnemy = !!u.enemy;

    // 地面影子
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.beginPath(); c.ellipse(X + 1, Y + 8, 9.5, 3.6, 0, 0, TAU); c.fill();

    // 身体
    const g = c.createRadialGradient(X - 3, Y - 4, 1, X, Y, R0);
    g.addColorStop(0, '#41546a'); g.addColorStop(1, '#121a24');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, R0, 0, TAU); c.fill();
    c.strokeStyle = col; c.lineWidth = 2.2; c.beginPath(); c.arc(X, Y, R0, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = .8;
    c.beginPath(); c.arc(X, Y, R0 + 1.5, 0, TAU); c.stroke();

    // 朝向楔形
    c.fillStyle = 'rgba(255,255,255,.82)';
    c.beginPath();
    c.moveTo(X + Math.cos(fa) * (R0 + 2.2), Y + Math.sin(fa) * (R0 + 2.2));
    c.lineTo(X + Math.cos(fa + 2.5) * (R0 - 3.0), Y + Math.sin(fa + 2.5) * (R0 - 3.0));
    c.lineTo(X + Math.cos(fa - 2.5) * (R0 - 3.0), Y + Math.sin(fa - 2.5) * (R0 - 3.0));
    c.closePath(); c.fill();

    // 枪画在身体上层，轮廓完整可见
    drawGun(c, u.weapon, X, Y, fa);

    // 编号（压在枪身上方，带描边保证可读）
    c.font = '700 8.5px "Segoe UI",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 2.4; c.strokeStyle = 'rgba(6,10,15,.85)';
    c.strokeText(String((u.index ?? 0) + 1), X - 3, Y - 1.5);
    c.fillStyle = '#eef3fb';
    c.fillText(String((u.index ?? 0) + 1), X - 3, Y - 1.5);
    c.textBaseline = 'alphabetic'; c.textAlign = 'start';

    if (human) {
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.6;
      c.setLineDash([4, 3]); c.beginPath(); c.arc(X, Y, R0 + 5.5, 0, TAU); c.stroke(); c.setLineDash([]);
    } else if (isEnemy) {
      c.strokeStyle = 'rgba(255,100,100,.5)'; c.lineWidth = 1;
      c.beginPath(); c.arc(X, Y, R0 + 3.4, 0, TAU); c.stroke();
    }

    // 换弹指示
    if (u.reloading) {
      c.strokeStyle = 'rgba(255,209,102,.95)'; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath(); c.arc(X, Y, R0 + 4, t * 7, t * 7 + 2.1); c.stroke();
    }

    // HP / 护甲
    if (u.hp != null) {
      const w = 24, hp = clamp(u.hp / (st.rules?.maxHp || 100), 0, 1);
      const bx = X - w / 2, by = Y - R0 - 11;
      c.fillStyle = 'rgba(4,8,12,.78)'; pill(c, bx - 1, by - 1, w + 2, 5.6, 2); c.fill();
      c.fillStyle = hp > .5 ? '#7ee787' : hp > .25 ? '#ffd166' : '#ff6b5b';
      pill(c, bx, by, w * hp, 3.6, 1.6); c.fill();
      if (u.armor > 0) {
        c.fillStyle = 'rgba(4,8,12,.78)'; c.fillRect(bx - 1, by + 5, w + 2, 2.4);
        c.fillStyle = '#6fc8ff'; c.fillRect(bx, by + 5.3, w * clamp(u.armor / (st.rules?.maxHp || 100), 0, 1), 1.8);
      }
    }

    // 武器标识条：颜色 + 缩写
    const gun = gunOf(u.weapon);
    c.font = '700 7.5px "Segoe UI",sans-serif';
    const tw = c.measureText(gun.abbr).width;
    const cw = Math.max(13, tw + 8), cx = X - cw / 2, cy = Y + R0 + 2;
    c.fillStyle = 'rgba(4,8,13,.84)';
    pill(c, cx, cy, cw, 10, 3); c.fill();
    c.strokeStyle = gun.color + '99'; c.lineWidth = 1; c.stroke();
    c.fillStyle = gun.color; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(gun.abbr, X, cy + 5.4);
    c.textBaseline = 'alphabetic'; c.textAlign = 'start';

    // 携带炸弹
    if (st.bomb && st.bomb.state === 'carried' && st.bomb.carrier === u.id) {
      c.strokeStyle = `rgba(224,184,115,${(.45 + pulse(t, .9) * .45).toFixed(3)})`;
      c.lineWidth = 1.6; c.beginPath(); c.arc(X, Y, R0 + 5.5, 0, TAU); c.stroke();
      c.fillStyle = '#e0b873'; c.beginPath(); c.arc(X + R0 + 1, Y - R0 - 1, 3, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawBomb(c, st, t) {
    const b = st.bomb;
    if (!b || b.x == null || b.state === 'carried') return;
    const X = b.x * TILE, Y = b.y * TILE;
    const col = b.state === 'planted' ? '#ff7f63' : b.state === 'defused' ? '#7ee787' : '#e0b873';
    const ph = pulse(t, b.state === 'planted' ? .7 : 1.6);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const rad = 18 + ph * 10;
    const g = c.createRadialGradient(X, Y, 1, X, Y, rad);
    g.addColorStop(0, col + 'aa'); g.addColorStop(.5, col + '33'); g.addColorStop(1, col + '00');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, rad, 0, TAU); c.fill();
    c.restore();

    if (b.state === 'planted') {
      c.strokeStyle = col + '55'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(X, Y, 11 + ph * 8, 0, TAU); c.stroke();
    }

    // 炸弹本体：外壳 + 屏幕 + 指示灯
    c.fillStyle = '#10161f'; c.strokeStyle = col; c.lineWidth = 1.8;
    pill(c, X - 8, Y - 6, 16, 12, 3); c.fill(); c.stroke();
    c.fillStyle = col; c.fillRect(X - 4.5, Y - 3.5, 9, 2.2);
    c.fillStyle = 'rgba(255,255,255,.32)'; c.fillRect(X - 4.5, Y + .4, 5.5, 1.2);

    if (b.state === 'planted') {
      c.fillStyle = col; c.beginPath(); c.arc(X + 5, Y - 8, 2 + pulse(t, .35) * 1.6, 0, TAU); c.fill();

      // 倒计时
      c.font = '800 13px "Segoe UI",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(6,10,15,.82)'; pill(c, X - 17, Y - 27, 34, 15, 4); c.fill();
      c.fillStyle = col; c.fillText((b.timer ?? 0).toFixed(1), X, Y - 19.2);
      c.textBaseline = 'alphabetic'; c.textAlign = 'start';

      // 拆包进度环
      const dp = b.defuseProgress || 0;
      if (dp > 0) {
        const need = st.rules?.defuseTime || 5;
        const p = clamp(dp / need, 0, 1);
        c.strokeStyle = 'rgba(126,231,135,.95)'; c.lineWidth = 2.6; c.lineCap = 'round';
        c.beginPath(); c.arc(X, Y, 13, -Math.PI / 2, -Math.PI / 2 + p * TAU); c.stroke();
      }
    }
  }

  function drawGunfire(c, st) {
    const nowFrame = st.frame || 0;
    for (const e of st.events || []) {
      if (e.type !== 'shot' || !e.from || e.angle === undefined) continue;
      if (e.frame < nowFrame - 2) continue;
      // 刚开火时最亮，两帧内衰减
      const a = 1 - clamp((nowFrame - e.frame) / 2, 0, 1);
      const gun = gunOf(e.weapon);
      const mx = (e.from.x + Math.cos(e.angle) * .5) * TILE;
      const my = (e.from.y + Math.sin(e.angle) * .5) * TILE;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(mx, my, 0, mx, my, 11);
      g.addColorStop(0, `rgba(255,246,224,${(.9 * a).toFixed(3)})`);
      g.addColorStop(.35, gun.color + Math.round(170 * a).toString(16).padStart(2, '0'));
      g.addColorStop(1, gun.color + '00');
      c.fillStyle = g; c.beginPath(); c.arc(mx, my, 11, 0, TAU); c.fill();
      c.strokeStyle = `rgba(255,240,210,${(.5 * a).toFixed(3)})`;
      c.lineWidth = 1.2; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(mx, my);
      c.lineTo(mx + Math.cos(e.angle) * (6 + a * 4), my + Math.sin(e.angle) * (6 + a * 4));
      c.stroke();
      c.restore();
    }
  }

  function drawBullet(c, b, st) {
    const gun = gunOf(b.weapon);
    const X = b.x * TILE, Y = b.y * TILE;
    let dx = b.dx || 0, dy = b.dy || 0;
    const m = Math.hypot(dx, dy);
    if (m > 1e-6) { dx /= m; dy /= m; } else { dx = 1; dy = 0; }
    const speed = st?.weapons?.[b.weapon]?.speed || 8;
    const trail = clamp(speed * .055, .35, .95) * TILE;
    const R0 = gun.bullet;
    c.save();
    c.globalCompositeOperation = 'lighter';
    // 拖尾用武器色、光晕用队伍色：一发子弹同时能看出阵营和枪型
    c.strokeStyle = gun.color + 'bb';
    c.lineWidth = Math.max(1.1, R0 * .8); c.lineCap = 'round';
    c.beginPath(); c.moveTo(X - dx * trail, Y - dy * trail); c.lineTo(X, Y); c.stroke();
    const col = teamColor(b.team);
    const g = c.createRadialGradient(X, Y, .3, X, Y, R0 * 3.6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.30, col); g.addColorStop(1, col + '00');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, R0 * 3.6, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(X, Y, Math.max(1.1, R0 * .5), 0, TAU); c.fill();
    c.restore();
  }

  function drawHud(c, st) {
    const sides = st.sides || {};
    const alive = st.teamAlive || {};
    c.save();

    // 左上：回合 + 比分 + 存活人数
    c.fillStyle = 'rgba(6,10,16,.74)';
    pill(c, 12, 12, 356, 40, 9); c.fill();
    c.strokeStyle = 'rgba(118,188,206,.18)'; c.lineWidth = 1; c.stroke();
    c.font = '700 13px "Segoe UI",sans-serif';
    c.fillStyle = '#e8ecf4'; c.fillText(`第 ${st.round} / ${st.roundsTotal || 6} 回合`, 24, 37);
    let x = 148;
    for (let i = 0; i < 2; i++) {
      c.fillStyle = teamColor(i); c.beginPath(); c.arc(x, 31, 5, 0, TAU); c.fill();
      c.fillStyle = '#e8ecf4'; c.font = '700 15px "Segoe UI",sans-serif';
      c.fillText(String(st.roundWins?.[i] ?? 0), x + 11, 37);
      c.fillStyle = '#8f9bb0'; c.font = '600 10px "Segoe UI",sans-serif';
      c.fillText(`${SIDE_NAME[sides[i]] || ''} · ${alive[i] ?? 0}人`, x + 27, 36);
      c.font = '700 13px "Segoe UI",sans-serif';
      x += 92;
    }

    // 右上：计时
    const planted = st.bomb && st.bomb.state === 'planted';
    c.fillStyle = 'rgba(6,10,16,.74)';
    pill(c, W * TILE - 196, 12, 184, 40, 9); c.fill();
    c.strokeStyle = planted ? 'rgba(255,127,99,.45)' : 'rgba(118,188,206,.18)'; c.stroke();
    c.fillStyle = '#8f9bb0'; c.font = '600 11px "Segoe UI",sans-serif';
    c.fillText(planted ? '炸弹倒计时' : '回合剩余', W * TILE - 184, 30);
    c.fillStyle = planted ? '#ff7f63' : ((st.timeLeft ?? 0) <= 15 ? '#ffd166' : '#e8ecf4');
    c.font = '800 19px "Segoe UI",sans-serif'; c.textAlign = 'right';
    c.fillText(`${planted ? (st.bombTimer ?? 0) : (st.timeLeft ?? 0)}s`, W * TILE - 24, 39);
    c.textAlign = 'start';

    if (st.phase === 'buy') {
      c.fillStyle = 'rgba(224,184,115,.92)'; c.font = '700 20px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText('购买阶段', W * TILE / 2, 64);
      c.textAlign = 'start';
    }
    c.restore();
  }

  // 画布左下角的武器色标：颜色 ↔ 枪型 ↔ 名称
  function drawWeaponLegend(c) {
    const keys = Object.keys(GUN);
    const pad = 10, cell = 64, h = 22;
    const w = pad * 2 + cell * keys.length;
    const x0 = 12, y0 = H * TILE - 12 - h;
    c.save();
    c.fillStyle = 'rgba(6,10,16,.64)';
    pill(c, x0, y0, w, h, 7); c.fill();
    c.strokeStyle = 'rgba(118,188,206,.14)'; c.lineWidth = 1; c.stroke();
    c.font = '700 9.5px "Segoe UI",sans-serif';
    c.textBaseline = 'middle';
    keys.forEach((k, i) => {
      const g = GUN[k], x = x0 + pad + i * cell;
      c.fillStyle = g.color;
      pill(c, x, y0 + h / 2 - 2, 9, 4, 2); c.fill();
      c.fillStyle = g.color;
      c.fillText(g.name, x + 13, y0 + h / 2 + .5);
    });
    c.textBaseline = 'alphabetic';
    c.restore();
  }

  function drawStage(c, st, positions, t) {
    if (!st) {
      c.clearRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#07090d'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#8f9bb0'; c.font = '600 15px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillText(R.loading ? (R.loadingText || '正在载入回放…') : '暂无对局', cv.width / 2, cv.height / 2);
      c.textAlign = 'start'; return;
    }
    if (st.map?.width && st.map?.height) setDims(st.map.width, st.map.height);
    c.clearRect(0, 0, W * TILE, H * TILE);
    c.drawImage(sceneLayer(st), 0, 0);
    drawSites(c, st, t);
    // 视野锥只画自己队伍（有雾视角）
    if (st.visibleEnemies) for (const u of st.units || []) if (u.alive) drawVision(c, st, u);
    drawBomb(c, st, t);
    drawGunfire(c, st);
    for (const b of st.bullets || []) drawBullet(c, positions?.bullets?.get(b.id) || b, st);
    const units = drawableUnits(st);
    units.sort((a, b) => (a.enemy ? 0 : 1) - (b.enemy ? 0 : 1));
    for (const u of units) drawUnit(c, positions?.actors?.get(u.id) || u, st, t);
    drawHud(c, st);
    if (st.status === 'playing') drawWeaponLegend(c);
    if (S.banner && performance.now() < S.bannerUntil) {
      const left = (S.bannerUntil - performance.now()) / 900;
      c.save(); c.globalAlpha = clamp(left, 0, 1);
      c.font = '700 30px "Segoe UI",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.95)'; c.shadowColor = 'rgba(118,188,206,.9)'; c.shadowBlur = 24;
      c.fillText(S.banner, W * TILE / 2, H * TILE / 2 - 8);
      c.restore(); c.textAlign = 'start';
    }
    if (st.status === 'finished') {
      const X = W * TILE / 2, Y = H * TILE / 2;
      c.fillStyle = 'rgba(7,10,16,.68)'; c.fillRect(0, 0, W * TILE, H * TILE);
      c.save(); c.textAlign = 'center';
      c.font = '700 38px "Segoe UI",sans-serif';
      c.fillStyle = st.winner === null ? '#e0b873' : teamColor(st.winner);
      c.fillText(st.winner === null ? '平 局' : `${st.players?.[st.winner]?.name || '?'} 获胜`, X, Y - 6);
      c.font = '600 15px "Segoe UI",sans-serif'; c.fillStyle = '#c3ccd9';
      c.fillText(st.reason || '', X, Y + 26);
      c.font = '600 13px "Segoe UI",sans-serif'; c.fillStyle = '#8f9bb0';
      c.fillText((st.players || []).map(p => `${p.name} ${p.wins ?? 0}`).join('  ·  '), X, Y + 52);
      c.restore(); c.textAlign = 'start';
    }
  }

  /* ==================== 本地输入 / 购买 ==================== */

  function dirFromVector(dx, dy) {
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
    const dirs = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];
    let idx = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    idx = ((idx % 8) + 8) % 8;
    return dirs[idx];
  }

  function ownUnit() {
    return (S.state?.units || []).find(u => u.team === 0 && u.index === 0) || null;
  }

  function readMove() {
    const k = S.keys;
    const up = k.has('KeyW'), down = k.has('KeyS'), left = k.has('KeyA'), right = k.has('KeyD');
    if (up && left) return 'UL'; if (up && right) return 'UR';
    if (down && left) return 'DL'; if (down && right) return 'DR';
    if (up) return 'U'; if (down) return 'D'; if (left) return 'L'; if (right) return 'R';
    return 'N';
  }

  function readAim() {
    const u = ownUnit();
    if (!u || !S.mouse.active) return null;
    return dirFromVector(S.mouse.x - u.x, S.mouse.y - u.y);
  }

  async function sendInput() {
    if (S.mode !== 'local' || R.enabled || !S.match) return;
    if (!S.state || S.state.phase !== 'live') return;
    const u = ownUnit();
    if (!u || !u.alive) return;
    api(`/api/matches/${S.match}/step`, { input: { dir: readMove(), aim: readAim() } }, S.token).catch(() => {});
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
      if (e.type === 'round') { S.banner = e.text || ''; S.bannerUntil = performance.now() + 1200; S.log = []; S.events.clear(); }
      else if (['roundEnd', 'matchEnd', 'plant', 'defuse', 'explode'].includes(e.type)) { S.banner = e.text || ''; S.bannerUntil = performance.now() + 2200; }
      if (e.text && e.type !== 'shot' && e.type !== 'hit') { S.log.push({ t: e.t, text: e.text, type: e.type }); if (S.log.length > 60) S.log.shift(); }
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
    S.buying = false;
  }

  function recommendBuys(st) {
    const ws = S.catalog?.weapons || st.weapons || {};
    const maxHp = st.rules?.maxHp || 100;
    const buys = [];
    for (const u of st.units || []) {
      const p = { unit: u.index };
      let money = u.money ?? 0;
      const cur = ws[u.weapon] || ws.pistol;
      let choice = null;
      if (money >= ws.rifle.cost && (u.weapon === 'pistol' || cur.cost < ws.rifle.cost)) choice = 'rifle';
      else if (money >= ws.smg.cost && (u.weapon === 'pistol' || cur.cost < ws.smg.cost)) choice = 'smg';
      else if (money >= ws.pdw.cost && u.weapon === 'pistol') choice = 'pdw';
      else if (money >= ws.shotgun.cost && u.weapon === 'pistol') choice = 'shotgun';
      if (choice) { p.weapon = choice; money -= ws[choice].cost; }
      if (money >= (st.rules?.armorPrice || 650) && (u.armor ?? 0) < maxHp) p.armor = true;
      if (st.side === 'defend' && money >= (st.rules?.kitPrice || 400) && !u.kit) p.kit = true;
      if (p.weapon || p.armor || p.kit) buys.push(p);
    }
    return buys;
  }

  async function submitBuy(auto) {
    if (!S.state || S.state.phase !== 'buy' || S.buying) return;
    S.buying = true;
    try {
      const buys = auto ? recommendBuys(S.state) : [];
      const res = await api(`/api/matches/${S.match}/buy`, { buys }, S.token);
      S.state = res.state; S.prevState = null;
      handleEvents(res.state);
    } catch (e) { toast(e.message, true); }
    finally { S.buying = false; }
  }

  /* ==================== 侧栏 ==================== */

  // 侧栏每帧都会重算；内容没变就不碰 DOM，避免 60fps 重建 innerHTML。
  const lastHtml = new Map();
  function setHtml(id, html) {
    if (lastHtml.get(id) === html) return false;
    lastHtml.set(id, html);
    $(id).innerHTML = html;
    return true;
  }

  function unitRow(u, st) {
    const ws = st.weapons || S.catalog?.weapons || {};
    const w = ws[u.weapon] || { name: u.weapon };
    const gun = gunOf(u.weapon);
    return `<div class="unitrow${u.alive ? '' : ' dead'}">
      <span class="idx" style="color:${teamColor(u.team)}">${(u.index ?? 0) + 1}</span>
      <span class="un">${esc(u.name || '')}</span>
      <span class="hpbar"><i style="width:${clamp((u.hp ?? 0) / (st.rules?.maxHp || 100) * 100, 0, 100)}%"></i></span>
      <span class="armorbar"><i style="width:${clamp((u.armor ?? 0), 0, 100)}%"></i></span>
      <span class="uw"><i class="gun" style="background:${gun.color};box-shadow:0 0 6px ${gun.color}88"></i>${esc(w.name || u.weapon)}${u.mag != null ? ' ' + u.mag : ''}</span>
      <span class="cash">$${u.money ?? ''}</span>
    </div>`;
  }

  function gunLegend(st) {
    const ws = st.weapons || S.catalog?.weapons || {};
    return Object.entries(GUN).map(([k, g]) => {
      const w = ws[k];
      return `<div class="gunrow"><i style="background:${g.color};box-shadow:0 0 8px ${g.color}99"></i>
        <span class="gn">${esc(g.name)}</span>
        <span class="ga" style="color:${g.color}">${g.abbr}</span>
        <span class="gs">${w ? `伤害 ${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''} · 射程 ${w.range}` : ''}</span></div>`;
    }).join('');
  }

  function renderSide() {
    const st = R.enabled ? replayState() : S.state;
    if (!st) {
      setHtml('matchCard', '<h3>对局</h3><small>等待服务端…</small>');
      for (const id of ['buyCard', 'timeCard', 'teamCard', 'enemyCard', 'weaponCard', 'gunCard', 'logCard', 'legend']) setHtml(id, '');
      return;
    }
    const rules = st.rules || {};
    const pl = st.players || [];
    const sides = st.sides || {};

    setHtml('matchCard', `<h3>对局</h3>
      <div class="scoreboard">${pl.map((p, i) => `<div class="prow">
        <span class="dot" style="background:${teamColor(i)}"></span><span class="nm">${esc(p.name || '')}</span>
        <span style="color:var(--dim);font-size:11px">${SIDE_NAME[sides[i]] || ''}</span>
        <span class="wins">${p.wins ?? 0}</span></div>`).join('')}</div>
      <div class="row"><span class="k">回合</span><span class="v">${st.round} / ${st.roundsTotal || 6}</span></div>
      <div class="row"><span class="k">阶段</span><span class="v">${st.phase === 'buy' ? '购买' : st.phase === 'live' ? '进行中' : '已结束'}</span></div>
      ${st.reason ? `<div class="row"><span class="k">结算</span><span class="v" style="color:#e0b873">${esc(st.reason)}</span></div>` : ''}`);

    const planted = st.bomb && st.bomb.state === 'planted';
    const left = planted ? (st.bombTimer ?? 0) : (st.timeLeft ?? 0);
    const limit = planted ? (rules.bombTimer || 40) : (rules.roundTimeLimit || 100);
    setHtml('timeCard', `<h3>${planted ? '炸弹倒计时' : '回合时间'}</h3>
      ${st.status === 'playing' ? `<div class="row"><span class="k">剩余</span><span class="v timebig ${left <= 10 ? 'danger' : left <= 30 ? 'soon' : ''}" style="${planted ? 'color:#ff7f63' : ''}">${left.toFixed(1)}s</span></div>` : ''}
      <div class="floodbar"><i style="width:${(clamp(left / limit, 0, 1) * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="k">${planted ? '炸弹状态' : '回合上限'}</span><span class="v">${planted ? '已安放 ' + (st.bomb.site || '') : (rules.roundTimeLimit || 100) + 's'}</span></div>
      ${st.bomb && st.bomb.state === 'planted' ? `<div class="row"><span class="k">拆包进度</span><span class="v">${(st.bomb.defuseProgress ?? 0).toFixed(1)}s</span></div>` : ''}`);

    const own = st.yourTeam != null ? (st.units || []) : (st.units || []).filter(u => u.team === 0);
    setHtml('teamCard', `<h3>${st.yourTeam != null ? '我方单位' : '队伍 1'}</h3>${own.map(u => unitRow(u, st)).join('')}`);

    if (st.yourTeam != null) {
      const seen = new Map();
      for (const arr of Object.values(st.visibleEnemies || {})) for (const e of arr) seen.set(e.id, e);
      setHtml('enemyCard', `<h3>已发现敌人</h3>${seen.size ? [...seen.values()].map(e => {
        const g = gunOf(e.weapon);
        return `<div class="enemyline"><span>${esc(e.id)}</span><span style="color:${g.color};border-color:${g.color}55"><i class="gun" style="background:${g.color}"></i>${esc(g.name)}</span><span>${e.x.toFixed(0)},${e.y.toFixed(0)}</span></div>`;
      }).join('') : '<small style="color:#8f9bb0">视野内没有敌人</small>'}`);
    } else {
      const other = (st.units || []).filter(u => u.team === 1);
      setHtml('enemyCard', `<h3>队伍 2</h3>${other.map(u => unitRow(u, st)).join('')}`);
    }

    setHtml('weaponCard', `<h3>购买菜单</h3>${(st.buyable || []).map(k => {
      const w = (st.weapons || {})[k]; if (!w) return '';
      const g = gunOf(k);
      return `<div class="wrow"><span class="wn"><i class="gun" style="background:${g.color}"></i>${esc(w.name)}</span><span class="wc">$${w.cost}</span><span class="wd">伤害 ${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''} · 射程 ${w.range}</span></div>`;
    }).join('')}<div class="wrow"><span class="wn">护甲</span><span class="wc">$${rules.armorPrice || 650}</span><span class="wd">吸收 50% 伤害</span></div>
      ${st.side === 'defend' || st.yourTeam == null ? `<div class="wrow"><span class="wn">拆弹器</span><span class="wc">$${rules.kitPrice || 400}</span><span class="wd">拆包 5s → 2.5s</span></div>` : ''}`);

    setHtml('gunCard', `<h3>武器识别</h3><div class="gunlist">${gunLegend(st)}</div>`);

    if (!R.enabled && st.phase === 'buy') {
      const ready = st.buy?.ready?.[st.yourTeam] ?? false;
      const changed = setHtml('buyCard', `<h3>购买阶段</h3>${ready
        ? '<small style="color:#8f9bb0">已提交购买，等待对手…</small>'
        : `<div class="buypanel">
            <div class="note">你的 5 个单位由你统一购买；AI 队友会执行你的购买。购买完成后回合开始。</div>
            <button class="primary" id="buyAuto">推荐购买并开始</button>
            <button id="buySave">存钱开始（不购买）</button>
          </div>`}`);
      if (changed && !ready) {
        $('buyAuto').onclick = () => submitBuy(true);
        $('buySave').onclick = () => submitBuy(false);
      }
    } else {
      setHtml('buyCard', '');
    }

    const logs = (st === S.state ? S.log : replayLog()).slice(-14).reverse();
    setHtml('logCard', `<h3>战况</h3><div class="log">${logs.length
      ? logs.map(l => `<div class="${l.type === 'death' || l.type === 'explode' ? 'death' : l.type === 'plant' || l.type === 'defuse' || l.type === 'bombPickup' ? 'flood' : ''}"><i>${l.t != null ? l.t.toFixed(1) + 's' : ''}</i><span>${esc(l.text)}</span></div>`).join('')
      : '<div><i></i><span style="color:#8f9bb0">等待开局…</span></div>'}</div>`);

    setHtml('legend', R.enabled
      ? '<b>回放</b> 拖动进度条跳转 · 播放/暂停 · 0.5×–4× 变速<br>逐物理帧回放（20 Hz）'
      : '<b>移动</b> W A S D · <b>瞄准</b> 鼠标方向 · <b>开火</b> 自动<br><b>购买</b> 回合开始后在右侧购买 · <b>视野</b> 每个单位独立视锥，墙体遮挡');
  }

  /* ==================== 主循环 ==================== */

  function loop(ts) {
    const t = ts / 1000;
    const dt = S.lastFrame ? Math.min(64, ts - S.lastFrame) : 16;
    S.lastFrame = ts;
    if (R.enabled) {
      replayAdvance(dt);
      renderSide();
      drawStage(ctx, replayState(), replayPositions(), t);
    } else {
      if (S.mode === 'local' && S.state?.phase === 'live' && ts - S.inputAt >= 30) {
        S.inputAt = ts; sendInput();
      }
      renderSide();
      if (S.state) {
        const a = clamp((performance.now() - S.lastTs) / S.poll, 0, 1);
        drawStage(ctx, S.state, S.prevState ? blend(S.prevState, S.state, a) : null, t);
      } else drawStage(ctx, null, null, t);
    }
    requestAnimationFrame(loop);
  }

  /* ==================== 回放 ==================== */

  const replayState = () => R.data?.frames?.[clamp(R.index, 0, (R.data?.frames?.length || 1) - 1)] || null;
  const replayFrameMs = () => Number(R.frameMs) > 0 ? Number(R.frameMs) : 50;
  function replayAlpha() { return (!R.playing || !R.data) ? 0 : clamp(R.clock / replayFrameMs(), 0, 1); }
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
    return (st.events || []).filter(e => e.type !== 'shot' && e.type !== 'hit').slice(-14).map(e => ({ t: e.t, text: e.text, type: e.type }));
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
      // 存档把静态目录提到顶层；逐帧补回引用，避免每帧重复存地图/规则。
      for (const f of R.data.frames || []) {
        f.map = R.data.map; f.rules = R.data.rules; f.weapons = R.data.weapons; f.buyable = R.data.buyable;
      }
      R.frameMs = Number(R.data?.frameMs) > 0 ? Number(R.data.frameMs) : 50;
      R.index = 0; R.playing = false; R.clock = 0;
      renderGameList();
    } catch (e) { R.error = e.message; }
    finally { if (ticket === R.ticket) R.loading = false; }
    renderReplayPanel();
  }

  function roundLogHtml(st) {
    const log = st.roundLog || [];
    if (!log.length) return '<small style="color:#8f9bb0">本局尚无结算记录</small>';
    return `<div class="rounds">${log.map(r => `<div>
      <span class="${r.winner ? 'win' : 'draw'}">第 ${r.round} 回合</span>
      <span class="${r.winner ? 'win' : 'draw'}">${esc(r.winner || '平局')}</span>
      <em>${esc(r.reason || '')} · ${((r.frames || 0) / 20).toFixed(1)}s</em>
    </div>`).join('')}</div>`;
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
    const finalSt = d.final || ({ winner: d.winner, reason: d.reason, players: [] });
    const st = replayState() || finalSt;
    $('replayCard').innerHTML = `<h3>回放 ${esc(d.id)}</h3>
      ${d.technicalFailure ? `<div class="row"><span class="k">技术中断</span><span class="v" style="color:#e38978">${esc(d.technicalFailure)}</span></div>` : ''}
      <div class="transport">
        <button id="rPlay">${R.playing ? '暂停' : '播放'}</button>
        <input type="range" id="rSeek" min="0" max="${last}" value="${R.index}">
        <div class="speeds">${[0.5, 1, 2, 4].map(s => `<button data-s="${s}" class="${R.speed === s ? 'on' : ''}">${s}×</button>`).join('')}</div>
      </div>
      <div class="row"><span class="k">帧</span><span class="v"><span id="rf">${R.index}</span> / ${last} · 第 ${st.round ?? d.round} 回合</span></div>
      <div class="row"><span class="k">本回合</span><span class="v">${((st.frame || 0) / 20).toFixed(1)}s · ${st.phase === 'buy' ? '购买' : '进行中'}</span></div>
      <div class="row"><span class="k">结果</span><span class="v" style="color:#e0b873">${d.winner === null || d.winner === undefined ? '平局' : esc(nameOf(d.winner)) + ' 胜'}</span></div>
      <div class="row"><span class="k">结算</span><span class="v">${esc(d.reason || finalSt.reason || '')}</span></div>`;
    $('rPlay').onclick = () => { R.playing = !R.playing; renderReplayPanel(); };
    $('rSeek').oninput = e => { R.index = Number(e.target.value); R.playing = false; R.clock = 0; $('rf').textContent = String(R.index); };
    for (const b of $('replayCard').querySelectorAll('.speeds button')) b.onclick = () => { R.speed = Number(b.dataset.s); renderReplayPanel(); };

    const results = R.meta?.results || [];
    const tally = {};
    for (const r of results) if (r.winner) tally[r.winner] = (tally[r.winner] || 0) + 1;
    const ids = Object.keys(R.meta?.models || {});
    $('scoreCard').innerHTML = `<h3>比分与逐回合</h3>
      ${ids.length ? `<div style="display:flex;justify-content:space-around;font-size:18px;font-weight:700">
        ${ids.map(i => `<span style="color:${teamColor(d.seats?.[0] === i ? 0 : 1)}">${esc(labels[i] || i)} <b>${tally[i] || 0}</b></span>`).join('')}
      </div><div class="row"><span class="k">系列场数</span><span class="v">${results.length}</span></div>` : ''}
      <div class="sep"></div>${roundLogHtml(st)}`;
  }

  /* ==================== 模式与启动 ==================== */

  async function enterWatch(runId, skipLatest = false) {
    if (R.enabled) return;
    R.enabled = true; S.keys.clear(); S.banner = null; S.bannerUntil = 0;
    $('setupCard').style.display = 'none'; lastHtml.clear(); $('buyCard').innerHTML = '';
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
      if (!tracked.has(e.code)) return;
      e.preventDefault(); S.keys.add(e.code);
    });
    addEventListener('keyup', e => {
      if (tracked.has(e.code)) { e.preventDefault(); S.keys.delete(e.code); }
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
    $('meta').textContent = `· ${W}×${H} 格 · 5v5 · 20 Hz · 逐单位视野 · CS 购买`;
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
      // ?frame=N 直接停在某一帧，方便复盘/截图（只影响播放位置）
      const at = Number(params.get('frame'));
      if (Number.isFinite(at) && at > 0 && R.data?.frames?.length) {
        R.index = clamp(Math.floor(at), 0, R.data.frames.length - 1);
        R.playing = false; R.clock = 0; renderReplayPanel();
      }
    } else {
      await createLocalMatch();
    }
    S.timer = setInterval(() => {
      if (R.enabled || S.busy) return;
      S.busy = true; fetchState().finally(() => { S.busy = false; });
    }, S.poll);
  }
  init().catch(e => toast('初始化失败：' + e.message, true));
  // 调试入口：控制台可查看当前视角状态（不改变游戏）。
  window.__defusal = { S, R };
})();
