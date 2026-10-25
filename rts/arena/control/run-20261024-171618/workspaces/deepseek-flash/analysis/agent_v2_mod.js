'use strict';
// Frontier RTS agent — revision 2 (deepseek-v4.1-flash).
// Protocol: one JSON observation per stdin line -> one {"commands":[...],"note":"..."} per stdout line.
//
// Strategy (see review.md for the evidence):
//  * opening: 2 riflemen to the near outpost, 2 to the north outpost; all workers to the home mine;
//    queue tank then worker.
//  * economy: 4 workers, continuous single-base tank production, upgrades bought as soon as affordable,
//    base repair from surplus.
//  * army: kite (step 55px away from the nearest enemy) whenever the current tank is reloading,
//    focus the enemy nearest to the army centroid, otherwise advance to the nearest unowned outpost;
//    keep the group near home until the base is safe, and push the enemy base only when clearly ahead.
//  * outposts: one spare combat unit is detached to capture uncontested outposts.
// The program keeps per-game memory (capture assignments, per-unit kite flags, mine target).

const readline = require('readline');

const TYPES = {
  worker: {cost: 50, build: 4, hp: 70, speed: 76, range: 0, damage: 0, cooldown: 1, r: 9},
  rifle: {cost: 60, build: 5, hp: 110, speed: 64, range: 115, damage: 13, cooldown: 0.8, r: 8},
  tank: {cost: 160, build: 12, hp: 360, speed: 37, range: 160, damage: 40, cooldown: 2, r: 14},
  raider: {cost: 100, build: 8, hp: 150, speed: 108, range: 94, damage: 16, cooldown: 0.65, r: 11},
};
// Coarse combat value = dps * hp, used only for relative-strength decisions.
const POWER = {rifle: 16.25 * 110, tank: 20 * 360, raider: 24.6 * 150};
const RANGE = {rifle: 115, tank: 160, raider: 94, worker: 0};

const CFG = {
  workers: 4,
  maxQueue: 2,
  upgrades: true, upRes1: 0, upRes2: 0,
  repair: true, repairRes: 250,
  earlyNodes: true, captureN: 1, captureSafe: 170,
  kiteMode: 'alt', kiteLen: 55, spread: 0, form: 0,
  focusR: 218, armyR: 560,
  retreatAt: 1.9,
  posture: 'home', anchorD: 0, anchorR: 260,
  pushMul: 1.0, pushTime: 60,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeAgent(cfgOverride) {
  const C = Object.assign({}, CFG, cfgOverride || {});
  const st = {cap: {}, kite: {}};
  return function decide(obs) {
    const p = obs.yourPlayer, t = obs.now;
    const base = obs.bases.find(b => b.owner === p && b.hp > 0);
    const ebase = obs.bases.find(b => b.owner !== p && b.hp > 0);
    if (!base) return [];
    const my = obs.units.filter(u => u.owner === p && u.hp > 0);
    const foes = obs.units.filter(u => u.owner !== p && u.hp > 0);
    const army = my.filter(u => u.type !== 'worker');
    const workers = my.filter(u => u.type === 'worker');
    const eCombat = foes.filter(u => u.type !== 'worker');
    const nodes = obs.nodes || [];
    const cmds = [];
    const dir = base.x < 640 ? 1 : -1;
    const southNodes = nodes.filter(n => n.y > 400).sort((a, b) => dist(a, base) - dist(b, base));
    const nearNode = southNodes[0];
    const northNode = nodes.filter(n => n.y < 300)[0] || nodes[0];

    // ---------------- opening ----------------
    if (t === 0) {
      cmds.push({type: 'train', unit: 'tank'});
      cmds.push({type: 'train', unit: 'worker'});
      cmds.push({type: 'rally', x: 640, y: 420});
      const mine = obs.mines.filter(m => m.ore > 0).sort((a, b) => dist(a, base) - dist(b, base))[0];
      if (mine && workers.length) cmds.push({type: 'gather', units: workers.map(u => u.id), target: mine.id});
      const rifles = army.filter(u => u.type === 'rifle').sort((a, b) => (a.id < b.id ? -1 : 1));
      if (rifles.length >= 4 && nearNode && northNode) {
        if (C.earlyNodes) {
          cmds.push({type: 'attackMove', units: rifles.slice(0, 2).map(u => u.id), x: nearNode.x, y: nearNode.y});
          cmds.push({type: 'attackMove', units: rifles.slice(2, 4).map(u => u.id), x: northNode.x, y: northNode.y});
        } else {
          cmds.push({type: 'attackMove', units: [rifles[0].id], x: nearNode.x, y: nearNode.y});
          cmds.push({type: 'attackMove', units: rifles.slice(1, 4).map(u => u.id), x: northNode.x, y: northNode.y});
        }
      }
      return cmds.slice(0, 10);
    }

    // ---------------- production ----------------
    const cr = obs.players[p].credits, lvl = obs.players[p].level, q = base.queue;
    let spent = 0;
    const qWorkers = q.filter(x => x.type === 'worker').length;
    if (workers.length + qWorkers < C.workers && cr - spent >= 50 && q.length < 3 && my.length + q.length < 40) {
      cmds.push({type: 'train', unit: 'worker'}); spent += 50;
    }
    if (cr - spent >= TYPES.tank.cost && q.length < C.maxQueue && my.length + q.length < 40) {
      cmds.push({type: 'train', unit: 'tank'}); spent += TYPES.tank.cost;
    }
    if (C.upgrades && lvl < 2) {
      const cost = 180 + lvl * 120;
      if (cr - spent >= cost + (lvl === 0 ? C.upRes1 : C.upRes2)) { cmds.push({type: 'upgrade'}); spent += cost; }
    }
    if (C.repair && base.hp < base.maxHp - C.repairRes && cr - spent >= 100 && (t - obs.players[p].repairAt) >= 30) {
      cmds.push({type: 'repair'}); spent += 100;
    }

    // ---------------- army ----------------
    if (army.length) {
      const combat = army.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
      const cent = {x: combat.reduce((s, u) => s + u.x, 0) / combat.length,
                    y: combat.reduce((s, u) => s + u.y, 0) / combat.length};
      const myPow = combat.reduce((s, u) => s + POWER[u.type], 0);
      const threats = eCombat.slice().sort((a, b) => dist(a, cent) - dist(b, cent));
      const near = threats.filter(u => dist(u, cent) <= C.armyR);
      const ePow = near.reduce((s, u) => s + POWER[u.type], 0);
      const baseThreat = eCombat.filter(u => dist(u, base) < 420);

      // capture detachments
      const capIds = new Set();
      for (const uid of Object.keys(st.cap)) {
        const u = combat.find(x => x.id === uid);
        const nd = nodes.find(n => n.id === st.cap[uid]);
        if (!u || !nd || nd.owner === p) { delete st.cap[uid]; continue; }
        if (eCombat.some(v => dist(v, nd) < 155)) { delete st.cap[uid]; continue; }
        capIds.add(uid);
      }
      if (C.captureN > 0 && !baseThreat.length) {
        for (const nd of nodes) {
          if (nd.owner === p || Object.values(st.cap).includes(nd.id)) continue;
          if (eCombat.some(v => dist(v, nd) < C.captureSafe)) continue;
          if (capIds.size >= C.captureN) continue;
          if (combat.length - capIds.size < 3) break;
          const cand = combat.filter(u => !capIds.has(u.id)).sort((a, b) => dist(a, nd) - dist(b, nd))[0];
          if (!cand) break;
          st.cap[cand.id] = nd.id; capIds.add(cand.id);
        }
      }
      const main = combat.filter(u => !capIds.has(u.id));

      // posture
      const anchor = {x: base.x + dir * C.anchorD, y: base.y};
      let mode;
      if (baseThreat.length && ePow > myPow * 0.4) mode = 'defend';
      else if (near.length > 0) mode = (myPow > 0 && ePow > myPow * C.retreatAt) ? 'retreat' : 'fight';
      else mode = 'push';
      let obj;
      if (mode === 'retreat') obj = {x: base.x + dir * 40, y: base.y};
      else if (mode === 'defend') obj = {x: base.x + dir * 110, y: base.y};
      else {
        const unowned = nodes.filter(n => n.owner !== p).sort((a, b) => dist(a, cent) - dist(b, cent));
        if (C.posture === 'home' && dist(cent, anchor) > C.anchorR) obj = anchor;
        else if (ebase && ePow < myPow * C.pushMul && t > C.pushTime && near.length === 0) obj = {x: ebase.x, y: ebase.y};
        else if (unowned.length) obj = {x: unowned[0].x, y: unowned[0].y};
        else if (ebase) obj = {x: ebase.x, y: ebase.y};
        else obj = {x: 640, y: 420};
      }

      const mainCent = main.length
        ? {x: main.reduce((s, u) => s + u.x, 0) / main.length, y: main.reduce((s, u) => s + u.y, 0) / main.length}
        : cent;
      const focusPool = (mode === 'defend' ? baseThreat : near);
      const focus = focusPool.length ? focusPool.slice().sort((a, b) => dist(a, mainCent) - dist(b, mainCent))[0] : null;
      const eCent = eCombat.length
        ? {x: eCombat.reduce((s, u) => s + u.x, 0) / eCombat.length, y: eCombat.reduce((s, u) => s + u.y, 0) / eCombat.length}
        : null;
      const atk = [];
      main.forEach((u, idx) => {
        const fs = eCombat.slice().sort((a, b) => dist(u, a) - dist(u, b));
        const nu = fs[0];
        if (nu && dist(u, nu) <= RANGE[u.type] + nu.r) {
          const ready = u.fireAt <= t + 1e-9;
          let kite = false;
          if (!ready && u.type !== 'rifle') {
            if (C.kiteMode === 'always') kite = true;
            else if (C.kiteMode === 'alt') kite = !st.kite[u.id];
          }
          if (kite) {
            st.kite[u.id] = true;
            const dx = (u.x - nu.x) || 1, dy = (u.y - nu.y) || 1, d = Math.hypot(dx, dy);
            let vx = dx / d, vy = dy / d;
            if (C.spread > 0) {
              const sgn = (idx % 2 === 0 ? 1 : -1);
              const nx = vx * (1 - C.spread) + (-dy / d) * C.spread * sgn;
              const ny = vy * (1 - C.spread) + (dx / d) * C.spread * sgn;
              const l = Math.hypot(nx, ny) || 1; vx = nx / l; vy = ny / l;
            }
            cmds.push({type: 'move', units: [u.id],
              x: Math.max(20, Math.min(1260, u.x + vx * C.kiteLen)),
              y: Math.max(20, Math.min(820, u.y + vy * C.kiteLen))});
            return;
          }
          st.kite[u.id] = false;
          if (dist(u, nu) <= C.focusR) atk.push(u.id);
          else cmds.push({type: 'attack', units: [u.id], target: nu.id});
          return;
        }
        st.kite[u.id] = false;
        if (nu && (mode === 'fight' || mode === 'defend')) {
          if (C.form > 0 && eCent) {
            const ddx = eCent.x - mainCent.x, ddy = eCent.y - mainCent.y, dl = Math.hypot(ddx, ddy) || 1;
            const px = -ddy / dl, py = ddx / dl, off = (idx - (main.length - 1) / 2) * C.form;
            cmds.push({type: 'attackMove', units: [u.id],
              x: Math.max(20, Math.min(1260, nu.x + px * off)),
              y: Math.max(20, Math.min(820, nu.y + py * off))});
          } else cmds.push({type: 'attackMove', units: [u.id], x: nu.x, y: nu.y});
        } else cmds.push({type: 'attackMove', units: [u.id], x: obj.x, y: obj.y});
      });
      if (atk.length && focus) cmds.push({type: 'attack', units: atk.slice(0, 30), target: focus.id});
      for (const u of combat) {
        if (capIds.has(u.id) && cmds.length < 10) {
          const nd = nodes.find(n => n.id === st.cap[u.id]);
          if (nd) cmds.push({type: 'move', units: [u.id], x: nd.x, y: nd.y});
        }
      }
    }
    return cmds.slice(0, 10);
  };
}


module.exports={makeAgent,CFG};
