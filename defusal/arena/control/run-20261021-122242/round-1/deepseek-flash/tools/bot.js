'use strict';
// Scripted opponent for local testing. Style-tunable attack/defense.
const { W, H, DIRS, dirTo, Grid } = require('./lib');

const NEUTRAL = { dir: 'N', aim: 'N' };
const IDX = { 't0u': 0, 't1u': 0 };

function unitIdx(id) { return Number(String(id).slice(-1)); }

class Bot {
  constructor(style = 'mixed') {
    this.style = style;
    this.grid = null;
    this.round = 0;
    this.side = null;
    this.plan = null;      // per-unit waypoint queues
    this.phaseInfo = null;
  }

  buy(view) {
    const buys = [];
    const side = view.side;
    for (const u of view.units) {
      const p = { unit: u.index };
      const money = u.money;
      const cur = u.weapon;
      const rifle = 2700, armor = 650;
      let spent = 0;
      if (cur === 'pistol' || cur === 'pdw' || cur === 'shotgun') {
        if (money >= rifle + armor) { p.weapon = 'rifle'; spent = rifle; }
        else if (money >= rifle) { p.weapon = 'rifle'; spent = rifle; }
        else if (money >= 1250 + armor) { p.weapon = 'smg'; spent = 1250; }
        else if (money >= 1250) { p.weapon = 'smg'; spent = 1250; }
        else if (money >= 700 && u.index === 0) { p.weapon = 'pdw'; spent = 700; }
      } else if (cur === 'smg' && money >= rifle - 0) {
        // keep smg, save
      }
      if (u.armor < 100 && money - spent >= armor) { p.armor = true; }
      if (side === 'defend' && u.armor >= 100 && money - spent - (p.armor ? 650 : 0) >= 400 && u.index < 2) p.kit = true;
      if (p.weapon || p.armor || p.kit) buys.push(p);
    }
    return { buys };
  }

  initRound(view) {
    this.grid = new Grid(view.map.tiles);
    this.side = view.side;
    this.round = view.round;
    this.plan = {};
    const sites = view.map.sites;
    const A = { x: 9.5, y: 7.4 }, B = { x: 30.5, y: 7.4 };
    const rnd = (view.id.length * 7 + view.round * 13) % 2;
    this.target = rnd ? 'B' : 'A';
    if (this.style === 'rushA') this.target = 'A';
    if (this.style === 'rushB') this.target = 'B';
    const T = this.target === 'A' ? A : B;

    if (this.side === 'attack') {
      const lane = this.target === 'A'
        ? [[9.5, 21.5], [9.5, 7.4]]
        : [[30.5, 21.5], [30.5, 7.4]];
      const mid = this.target === 'A'
        ? [[19.5, 20.5], [19.5, 10.5], [12.5, 9.5], [12.5, 6.5], [10.5, 6.2]]
        : [[19.5, 20.5], [19.5, 10.5], [27.5, 9.5], [27.5, 6.5], [29.5, 6.2]];
      const split = this.style === 'mixed' || this.style === 'split';
      for (let i = 0; i < 5; i++) {
        if (split && i >= 3) this.plan[i] = { q: mid.map(p => p.slice()), hold: null };
        else this.plan[i] = { q: lane.map(p => p.slice()), hold: null };
      }
      // carrier plants
      this.plan[0].q = lane.map(p => p.slice());
    } else {
      // defense: 2 A, 2 B, 1 mid
      const dA = [[9.5, 9.8], [12.5, 8.6]];
      const dB = [[30.5, 9.8], [27.5, 8.6]];
      const dM = [[19.5, 9.8]];
      const assign = this.style === 'stackA'
        ? [[9.5, 9.8], [12.5, 8.6], [7.5, 8.5], [19.5, 9.8], [9.5, 5.5]]
        : this.style === 'stackB'
          ? [[30.5, 9.8], [27.5, 8.6], [32.5, 8.5], [19.5, 9.8], [30.5, 5.5]]
          : [dA[0], dA[1], dB[0], dB[1], dM[0]];
      for (let i = 0; i < 5; i++) this.plan[i] = { q: [assign[i].slice()], hold: assign[i].slice() };
    }
  }

  makeWindow(view) {
    if (!this.plan || this.round !== view.round || this.side !== view.side) { this.initRound(view); this.lastBombState = null; }
    const grid = this.grid;
    const units = view.units;
    const vis = view.visibleEnemies || {};
    const bomb = view.bomb || {};
    const frames = [];
    const pos = {};
    for (const u of units) pos[u.index] = [u.x, u.y];

    if (!this.plan) this.initRound(view);
    // replan on bomb state changes
    if (this.side === 'attack' && this.lastBombState !== bomb.state) {
      if (bomb.state === 'planted') {
        for (let i = 0; i < 5; i++) {
          if (this.plan[i] && this.plan[i].hold === 'post') continue;
          const holds = this.target === 'A'
            ? [[9.5, 9.6], [6.5, 9.2], [12.5, 8.8], [11.5, 10.4], [8.0, 11.0]]
            : [[30.5, 9.6], [33.5, 9.2], [27.5, 8.8], [28.5, 10.4], [32.0, 11.0]];
          this.plan[i] = { q: [holds[i]], hold: 'post', face: this.target === 'A' ? [9.5, 6.5] : [30.5, 6.5] };
        }
      } else if (bomb.state === 'dropped') {
        // nearest alive goes to bomb
        let best = -1, bd = 1e9;
        for (const u of units) {
          if (!u.alive) continue;
          const d = Math.hypot(u.x - bomb.x, u.y - bomb.y);
          if (d < bd) { bd = d; best = u.index; }
        }
        if (best >= 0) this.plan[best] = { q: [[bomb.x, bomb.y], [this.target === 'A' ? 9.5 : 30.5, 7.4]], hold: null };
      }
    } else if (this.side === 'defend' && bomb.state === 'planted' && this.lastBombState !== 'planted') {
      // nearest defender defuses, rest converge
      let best = -1, bd = 1e9;
      for (const u of units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.x - bomb.x, u.y - bomb.y);
        if (d < bd) { bd = d; best = u.index; }
      }
      for (let i = 0; i < 5; i++) {
        if (i === best) this.plan[i] = { q: [[bomb.x, bomb.y]], hold: 'defuse' };
        else if (this.plan[i] && this.plan[i].hold === 'defuse') this.plan[i] = { q: [[bomb.x, bomb.y]], hold: null };
      }
    }

    this.lastBombState = bomb.state;
    for (let f = 0; f < 20; f++) {
      const frame = [];
      for (const u of units) {
        if (!u.alive) { frame.push(NEUTRAL); continue; }
        const [x, y] = pos[u.index];
        const p = this.plan[u.index];
        const seen = (vis[u.id] || []).filter(e => true);
        let aimv = null, dir = 'N';
        if (seen.length) {
          let n = seen[0], nd = 1e9;
          for (const e of seen) { const d = Math.hypot(e.x - x, e.y - y); if (d < nd) { nd = d; n = e; } }
          aimv = [n.x - x, n.y - y];
        }
        let holding = false;
        if (p) {
          while (p.q.length && Math.hypot(p.q[0][0] - x, p.q[0][1] - y) < 0.45) p.q.shift();
          if (p.q.length) {
            const path = grid.astar(x, y, p.q[0][0], p.q[0][1]);
            let nxt = null;
            if (path) {
              // string pulling
              let k = 0;
              for (let j = path.length - 1; j >= 0; j--) { if (grid.clear(x, y, path[j][0], path[j][1])) { k = j; break; } }
              nxt = path[k];
            }
            if (nxt) {
              dir = dirTo(nxt[0] - x, nxt[1] - y);
              if (!aimv) aimv = [nxt[0] - x, nxt[1] - y];
            }
          } else holding = true;
        }
        if (!aimv) {
          if (this.side === 'attack') {
            const sc = this.target === 'A' ? [7.5, 5.5] : [32.5, 5.5];
            aimv = [sc[0] - x, sc[1] - y];
          } else if (holding && p && p.face) {
            aimv = [p.face[0] - x, p.face[1] - y];
          } else if (holding) {
            aimv = [0, -1];
          }
        }
        if (p && p.hold === 'defuse' && holding) dir = 'N';
        const aim = aimv ? dirTo(aimv[0], aimv[1]) : 'N';
        // move simulation
        pos[u.index] = grid.step(x, y, dir);
        frame.push({ dir, aim });
      }
      frames.push(frame);
    }
    return { inputs: frames };
  }
}

module.exports = { Bot };
