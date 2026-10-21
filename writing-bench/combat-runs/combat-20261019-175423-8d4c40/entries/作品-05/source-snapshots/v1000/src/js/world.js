/* =========================================================
   World renderer + camera
   ========================================================= */
const Camera = {
  x: 0, y: 0, zoom: 1, shake: 0, shakeR: 0, shakeAng: 0,
  targetZoom: 1, lookX: 0, focusY: 470,
  reset() {
    this.x = 0; this.y = 0; this.zoom = 1.3; this.shake = 0; this.shakeR = 0;
    this.targetZoom = 1.3; this.lookX = 0;
  },
  addShake(amount, ang) {
    this.shake = Math.min(this.shake + amount, 13);
    this.shakeAng = ang == null ? Math.random() * TAU : ang;
    this.shakeR = Math.random() * TAU;
  },
  update(dt, player) {
    this.shake *= Math.pow(0.0025, dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shakeR += dt * 64;
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 12);
    this.targetZoom += (1.3 - this.targetZoom) * Math.min(1, dt * 5);
    if (player) {
      const halfW = (WORLD.W / 2) / this.zoom;
      const desiredX = clamp(player.x + player.facing * 46, WORLD.left + halfW, WORLD.right - halfW);
      this.x += (desiredX - this.x) * Math.min(1, dt * 7.5);
      this.x = clamp(this.x, WORLD.left + halfW, WORLD.right - halfW);
      const desiredY = clamp((player.y - WORLD.groundY) * 0.22, -48, 20);
      this.y += (desiredY - this.y) * Math.min(1, dt * 5);
    }
  },
  shakeOffset() {
    if (!this.shake) return [0, 0, 0];
    const a = this.shake;
    return [Math.cos(this.shakeR * 1.7) * a, Math.sin(this.shakeR * 2.3) * a, Math.sin(this.shakeR) * a * 0.0014];
  },
};

const World = (() => {
  let bgCanvas = null;
  let fgCanvas = null;
  let lanterns = [];
  let motes = [];
  let threads = [];
  let t = 0;

  function makeBackdrop() {
    const c = document.createElement('canvas');
    c.width = WORLD.W; c.height = WORLD.H;
    const g = c.getContext('2d');
    // sky gradient: deep indigo to ember horizon
    const sky = g.createLinearGradient(0, 0, 0, WORLD.H);
    sky.addColorStop(0, '#0a0b16');
    sky.addColorStop(0.32, '#151126');
    sky.addColorStop(0.58, '#2b1a2a');
    sky.addColorStop(0.72, '#5a2a26');
    sky.addColorStop(0.82, '#8a3c26');
    sky.addColorStop(1, '#1a0f0e');
    g.fillStyle = sky; g.fillRect(0, 0, WORLD.W, WORLD.H);

    // huge pale moon
    const mx = 1020, my = 150, mr = 92;
    const mg = g.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 2.6);
    mg.addColorStop(0, 'rgba(255,226,190,0.30)');
    mg.addColorStop(0.42, 'rgba(255,180,130,0.09)');
    mg.addColorStop(1, 'rgba(255,120,80,0)');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr * 2.6, 0, TAU); g.fill();
    g.fillStyle = '#e9dcc3'; g.globalAlpha = 0.82;
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.globalAlpha = 1;
    // moon craters
    g.fillStyle = 'rgba(160,140,120,.25)';
    g.beginPath(); g.arc(mx - 30, my - 20, 18, 0, TAU); g.fill();
    g.beginPath(); g.arc(mx + 28, my + 24, 26, 0, TAU); g.fill();
    g.beginPath(); g.arc(mx + 8, my - 40, 9, 0, TAU); g.fill();

    // far mountains
    function mountains(baseY, amp, color, seed, step) {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, WORLD.H);
      g.lineTo(0, baseY);
      let x = 0;
      let k = seed;
      while (x <= WORLD.W) {
        k += 0.7;
        const h = baseY - (Math.sin(k * 1.7) * 0.5 + 0.5) * amp - Math.sin(k * 0.43 + 1.2) * amp * 0.4;
        g.lineTo(x, h);
        x += step;
      }
      g.lineTo(WORLD.W, baseY); g.lineTo(WORLD.W, WORLD.H); g.closePath(); g.fill();
    }
    mountains(420, 120, 'rgba(26,20,34,.75)', 1.2, 44);
    mountains(452, 90, 'rgba(34,24,34,.9)', 5.6, 34);

    // mist bands
    for (let i = 0; i < 4; i++) {
      const y = 380 + i * 46;
      const mg2 = g.createLinearGradient(0, y - 30, 0, y + 40);
      mg2.addColorStop(0, 'rgba(180,120,110,0)');
      mg2.addColorStop(0.5, `rgba(190,130,120,${0.05 + i * 0.012})`);
      mg2.addColorStop(1, 'rgba(180,120,110,0)');
      g.fillStyle = mg2; g.fillRect(0, y - 30, WORLD.W, 70);
    }

    // distant torii silhouette
    function torii(x, y, s, col) {
      g.fillStyle = col;
      g.fillRect(x - 70 * s, y - 120 * s, 8 * s, 120 * s);
      g.fillRect(x + 62 * s, y - 120 * s, 8 * s, 120 * s);
      g.beginPath();
      g.moveTo(x - 96 * s, y - 128 * s);
      g.quadraticCurveTo(x, y - 142 * s, x + 96 * s, y - 128 * s);
      g.lineTo(x + 96 * s, y - 118 * s);
      g.quadraticCurveTo(x, y - 131 * s, x - 96 * s, y - 118 * s);
      g.closePath(); g.fill();
      g.fillRect(x - 74 * s, y - 106 * s, 148 * s, 7 * s);
    }
    torii(212, 505, 0.72, 'rgba(20,14,20,.85)');
    torii(1088, 512, 0.52, 'rgba(22,15,20,.8)');

    // mid trees silhouettes (gnarled)
    function tree(x, y, s, col) {
      g.strokeStyle = col; g.fillStyle = col;
      g.lineCap = 'round';
      function branch(x0, y0, ang, len, w, depth) {
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        g.lineWidth = w;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        if (depth > 0) {
          branch(x1, y1, ang - 0.42 + Math.random() * 0.1, len * 0.68, w * 0.66, depth - 1);
          branch(x1, y1, ang + 0.5 + Math.random() * 0.1, len * 0.6, w * 0.6, depth - 1);
          if (Math.random() < 0.5) branch(x1, y1, ang + 0.05, len * 0.7, w * 0.5, depth - 1);
        }
      }
      branch(x, y, -Math.PI / 2 - 0.12, 92 * s, 7 * s, 4);
      branch(x, y, -Math.PI / 2 + 0.5, 60 * s, 4 * s, 3);
    }
    g.save();
    g.globalAlpha = 0.9;
    tree(96, 560, 1.05, 'rgba(14,10,14,.92)');
    tree(1196, 566, 0.85, 'rgba(14,10,14,.9)');
    g.restore();

    // mid silhouette railing / hanging cloths
    g.fillStyle = 'rgba(16,11,16,.9)';
    g.fillRect(0, 520, WORLD.W, 8);
    for (let x = 30; x < WORLD.W; x += 164) { g.fillRect(x, 528, 7, 62); }

    // ground stone platform
    const gr = g.createLinearGradient(0, 596, 0, 720);
    gr.addColorStop(0, '#2a2320');
    gr.addColorStop(0.12, '#191413');
    gr.addColorStop(1, '#0a0808');
    g.fillStyle = gr; g.fillRect(0, 596, WORLD.W, 124);
    // top edge highlight
    g.fillStyle = '#4a3c30'; g.fillRect(0, 594, WORLD.W, 4);
    g.fillStyle = 'rgba(255,160,90,.22)'; g.fillRect(0, 592, WORLD.W, 2);
    // stone slabs
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
    let sx = -20;
    while (sx < WORLD.W) {
      const w = 70 + ((sx * 13) % 60 + 60) % 60;
      g.beginPath(); g.moveTo(sx, 600); g.lineTo(sx + 6, 720); g.stroke();
      sx += w;
    }
    for (let y = 628; y < 720; y += 26) {
      g.strokeStyle = 'rgba(0,0,0,.32)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD.W, y); g.stroke();
    }
    // cracks + moss
    g.strokeStyle = 'rgba(90,70,52,.28)'; g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      let cx = rnd(WORLD.W), cy = rnd(620, 700);
      g.beginPath(); g.moveTo(cx, cy);
      for (let j = 0; j < 4; j++) { cx += rnd(30, -30); cy += rnd(14, -6); g.lineTo(cx, cy); }
      g.stroke();
    }

    // vignette
    const vg = g.createRadialGradient(WORLD.W / 2, WORLD.H * 0.46, WORLD.H * 0.24, WORLD.W / 2, WORLD.H * 0.46, WORLD.H * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vg; g.fillRect(0, 0, WORLD.W, WORLD.H);

    return c;
  }

  function makeForeground() {
    // Only low silhouettes that hug the ground line, so they never cover characters.
    const c = document.createElement('canvas');
    c.width = WORLD.W; c.height = 120;
    const g = c.getContext('2d');
    const base = 26;
    // grass tufts growing from the ground edge
    for (let i = 0; i < 120; i++) {
      const x = rnd(WORLD.W);
      const h = rnd(16, 4);
      g.strokeStyle = `rgba(${(26 + rnd(18)) | 0},${(20 + rnd(14)) | 0},${16},${0.35 + Math.random() * 0.35})`;
      g.lineWidth = rnd(2.0, 0.7);
      g.beginPath(); g.moveTo(x, base + 2);
      const lean = rnd(14, -14);
      g.quadraticCurveTo(x + lean * 0.25, base - h * 0.6, x + lean, base - h);
      g.stroke();
    }
    // a few small stones sitting on the edge
    for (let i = 0; i < 9; i++) {
      const x = rnd(WORLD.W), w = rnd(26, 10);
      g.fillStyle = 'rgba(12,10,11,.75)';
      g.beginPath();
      g.ellipse(x, base + 6, w, w * 0.28, 0, Math.PI, TAU);
      g.fill();
    }
    return c;
  }

  function reset() {
    if (!bgCanvas) bgCanvas = makeBackdrop();
    if (!fgCanvas) fgCanvas = makeForeground();
    lanterns = [];
    for (let i = 0; i < 7; i++) {
      lanterns.push({
        x: 80 + i * 186 + rnd(20, -20),
        y: 66 + Math.sin(i * 1.7) * 26 + rnd(16),
        ph: rnd(TAU), sw: rnd(0.8, 0.4),
        len: rnd(120, 60),
      });
    }
    motes = [];
    for (let i = 0; i < 48; i++) {
      motes.push({ x: rnd(WORLD.W), y: rnd(WORLD.H), vx: rnd(14, -8), vy: rnd(-4, -18), r: rnd(2.0, 0.6), a: rnd(0.5, 0.12), ph: rnd(TAU) });
    }
    threads = [];
    for (let i = 0; i < 9; i++) {
      threads.push({
        x: rnd(WORLD.W), y: rnd(120, -40), len: rnd(260, 120),
        ph: rnd(TAU), sp: rnd(0.7, 0.2), a: rnd(0.15, 0.05), w: rnd(1.6, 0.6),
      });
    }
  }

  function update(dt) {
    t += dt;
    for (const m of motes) {
      m.x += (m.vx + Math.sin(t * 0.7 + m.ph) * 8) * dt;
      m.y += m.vy * dt;
      if (m.y < -10) { m.y = WORLD.H + 10; m.x = rnd(WORLD.W); }
      if (m.x < -10) m.x = WORLD.W + 10;
      if (m.x > WORLD.W + 10) m.x = -10;
    }
  }

  function drawBg(ctx) {
    const [sx, sy] = Camera.shakeOffset();
    ctx.save();
    ctx.translate(WORLD.W / 2, WORLD.H / 2);
    ctx.scale(Camera.zoom, Camera.zoom);
    ctx.translate(-WORLD.W / 2 - (Camera.x - WORLD.W / 2) * 0.12 + sx * 0.4,
                  -WORLD.H / 2 - Camera.y * 0.35 + sy * 0.4);
    ctx.drawImage(bgCanvas, 0, 0);

    // moonbeam / light shaft
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(760, 40, 980, 640);
    lg.addColorStop(0, 'rgba(255,190,140,.07)');
    lg.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(940, 30); ctx.lineTo(1090, 40); ctx.lineTo(820, 640); ctx.lineTo(660, 640);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // hanging threads
    for (const th of threads) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,50,${th.a})`;
      ctx.lineWidth = th.w;
      ctx.beginPath();
      ctx.moveTo(th.x, th.y);
      const sway = Math.sin(t * th.sp + th.ph) * 10;
      ctx.quadraticCurveTo(th.x + sway * 0.6, th.y + th.len * 0.55, th.x + sway, th.y + th.len);
      ctx.stroke();
      ctx.restore();
    }

    // lanterns
    for (const L of lanterns) {
      const sway = Math.sin(t * L.sw + L.ph) * 6;
      ctx.save();
      ctx.strokeStyle = 'rgba(30,20,20,.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(L.x, 0); ctx.lineTo(L.x + sway, L.y); ctx.stroke();
      ctx.translate(L.x + sway, L.y + 16);
      ctx.rotate(sway * 0.006);
      const glowR = 46;
      const gg = ctx.createRadialGradient(0, 6, 2, 0, 6, glowR);
      gg.addColorStop(0, 'rgba(255,140,70,.55)');
      gg.addColorStop(0.45, 'rgba(255,90,40,.15)');
      gg.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 6, glowR, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8402a';
      ctx.beginPath(); ctx.ellipse(0, 6, 13, 18, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,120,.5)'; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.ellipse(0, 6, Math.abs(13 * Math.cos(i * 0.45)) + 0.4, 18, 0, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(-6, -10, 12, 5); ctx.fillRect(-6, 19, 12, 4);
      ctx.restore();
    }

    // drifting motes
    ctx.save();
    for (const m of motes) {
      ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(t * 2 + m.ph));
      ctx.fillStyle = '#ffcf9a';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function drawFg(ctx) {
    const [sx, sy] = Camera.shakeOffset();
    ctx.save();
    ctx.translate(WORLD.W / 2, WORLD.H / 2);
    ctx.scale(Camera.zoom, Camera.zoom);
    ctx.translate(-WORLD.W / 2 - Camera.x * 1.12 + sx, -WORLD.H / 2 - Camera.y * 1.12 + sy);
    ctx.drawImage(fgCanvas, 0, WORLD.H - 220 + 0);
    ctx.restore();
  }

  return { reset, update, drawBg, drawFg, get time() { return t; } };
})();
