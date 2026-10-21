/* ============================================================
   Constants, shared state, canvas, input
   ============================================================ */
const GROUND_Y = 452;
const WORLD_W = 2400;
const DESIGN_W = 960;
const DESIGN_H = 540;
const STEP = 1 / 120;
const MAX_DPR_PIXELS = 6000000;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const muteBtn = document.getElementById("mute");

const view = {
  w: 960,
  h: 540,
  dpr: 1,
  scale: 1,
  viewW: 960,
  viewH: 540,
  camY: 0,
};

const game = {
  ready: false,
  mode: "title", // title | play | over
  time: 0,
  realTime: 0,
  hitStop: 0,
  timeScale: 1,
  slowmo: 0,
  flash: 0,
  hurtVignette: 0,
  lowHpPulse: 0,

  player: null,
  enemies: [],
  attackerCount: 0,
  enemyId: 0,
  projectiles: [],
  debris: [],
  particles: [],
  particlesBack: [],
  decals: [],
  afterimages: [],
  floaters: [],
  slashes: [],
  skillFx: [],
  portals: [],
  pendingSpawns: [],
  banners: [],

  kills: 0,
  hitCount: 0,
  limbBreakCount: 0,
  combo: 0,
  comboTimer: 0,
  comboPop: 0,
  maxCombo: 0,
  rank: "",
  rankPop: 0,

  wave: 0,
  wavePhase: "none", // none | fight | clear
  waveTimer: 0,
  clearTimer: 0,
  waveRemaining: 0,
  waveHint: 0,

  camera: {
    x: 0,
    targetX: 0,
    shakeT: 0,
    shakeAmp: 0,
    shakeX: 0,
    shakeY: 0,
  },

  dying: false,
  deathTimer: 0,
  deathHold: 0,
  startFade: 0,
  introFade: 0,
  hintTimer: 0,
  lastPlayerHitAt: -99,
};


/* ---------------- input ---------------- */
const input = {
  down: Object.create(null),
  pressed: Object.create(null),
  released: Object.create(null),
  anyGesture: false,
};

const GAME_KEYS = new Set([
  "KeyA", "KeyD", "ArrowLeft", "ArrowRight",
  "Space", "KeyJ", "KeyK", "KeyL", "KeyI", "KeyR", "Enter",
  "Digit1", "Digit2", "Digit3", "Digit4",
]);

const KEY_FALLBACK = {
  a: "KeyA", d: "KeyD", j: "KeyJ", k: "KeyK", l: "KeyL", i: "KeyI", r: "KeyR",
  enter: "Enter", " ": "Space", spacebar: "Space",
  arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4",
};

function normalizeKeyCode(e) {
  let code = e.code;
  if (code && /^Numpad[1-4]$/.test(code)) return "Digit" + code.slice(-1);
  if (code && GAME_KEYS.has(code)) return code;
  const k = (e.key || "").toLowerCase();
  return KEY_FALLBACK[k] || code || "";
}

function clearInputState() {
  for (const k in input.down) input.down[k] = false;
  for (const k in input.pressed) input.pressed[k] = false;
  for (const k in input.released) input.released[k] = false;
}

function onFirstGesture() {
  if (!input.anyGesture) {
    input.anyGesture = true;
    audio.init();
  }
}

function requestStartIfReady() {
  if (!game.ready) {
    game.pendingStart = true;
    return;
  }
  startGame();
}

function handleMetaKey(code) {
  if (code === "Enter") {
    if (game.mode === "title" || game.mode === "over" || (game.player && game.player.dead)) {
      requestStartIfReady();
      return true;
    }
  }
  if (code === "KeyR") {
    if (game.mode === "play" || game.mode === "over" || game.mode === "title") {
      requestStartIfReady();
      return true;
    }
  }
  return false;
}

window.addEventListener("keydown", (e) => {
  const code = normalizeKeyCode(e);
  if (!GAME_KEYS.has(code)) return;
  e.preventDefault();
  onFirstGesture();
  if (e.repeat) {
    input.down[code] = true;
    return;
  }
  input.down[code] = true;
  input.pressed[code] = true;
  handleMetaKey(code);
});

window.addEventListener("keyup", (e) => {
  const code = normalizeKeyCode(e);
  if (!GAME_KEYS.has(code)) return;
  e.preventDefault();
  input.down[code] = false;
  input.released[code] = true;
});

function loseFocusReset() {
  clearInputState();
  if (audio.chargeNodes) audio.chargeStop();
  const p = game.player;
  if (p) {
    p.lightBuffer = 0;
    p.jumpBuffer = 0;
    p.heavyQueued = 0;
    p.dashQueued = 0;
    p.parryQueued = 0;
    if (p.skillQueue) p.skillQueue.length = 0;
    if (p.state === "charge") {
      p.state = "idle";
      p.chargeT = 0;
      p.chargeLevel = 0;
      p.chargeFullNotified = false;
    }
  }
}

window.addEventListener("blur", loseFocusReset);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) loseFocusReset();
});

canvas.addEventListener("pointerdown", (e) => {
  onFirstGesture();
  try { canvas.focus({ preventScroll: true }); } catch (err) {}
  if (e.button !== 0) return;
  if (game.mode === "title" || game.mode === "over" || (game.player && game.player.dead)) {
    requestStartIfReady();
  }
});

muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  audio.init();
  const m = audio.toggleMute();
  muteBtn.textContent = m ? "♪ 音效：关" : "♪ 音效：开";
  muteBtn.classList.toggle("off", m);
  muteBtn.blur();
});

registerMuteClickPreventScroll();

function registerMuteClickPreventScroll() {
  muteBtn.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") e.preventDefault();
  });
}
