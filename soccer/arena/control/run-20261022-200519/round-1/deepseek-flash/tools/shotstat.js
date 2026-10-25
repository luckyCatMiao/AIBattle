'use strict';
/* Aggregate attack/defence stats over a set of games: goals, kicks, shots
 * (kick ray crosses the opponent goal mouth), saves, possession, fouls. */
const { playGame } = require('./harness.js');
const W = 44, H = 26, DT = 0.05, FR = 0.978, REST = 0.72, BR = 0.22;
const GOAL_LO = 10.5, GOAL_HI = 15.5;
const TILE = 24;

function tileAt(tiles, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 1;
  return tiles[ty * W + tx];
}
function hitsWall(tiles, x, y, r) {
  const k = r * Math.SQRT1_2;
  const pts = [[x - r, y], [x + r, y], [x, y - r], [x, y + r],
    [x - k, y - k], [x + k, y - k], [x - k, y + k], [x + k, y + k]];
  return pts.some(([px, py]) => tileAt(tiles, px, py) === 1);
}
/* Follow a kicked ball; return {goal:bool, x,y} where it first crosses a goal
 * line, or its resting point. */
function flight(tiles, x, y, ang) {
  const rad = ang * Math.PI / 180;
  let vx = Math.cos(rad) * 11, vy = Math.sin(rad) * 11;
  for (let f = 0; f < 90; f++) {
    for (let s = 0; s < 4; s++) {
      x += vx * DT / 4; y += vy * DT / 4;
      if (y >= GOAL_LO && y <= GOAL_HI && (x <= 1.0 || x >= W - 1.0)) {
        return { goal: true, x, y };
      }
      if (hitsWall(tiles, x, y, BR)) {
        const px = x - vx * DT / 4, py = y - vy * DT / 4;
        if (hitsWall(tiles, x, py, BR)) { x = px; vx = -vx * REST; }
        if (hitsWall(tiles, px, y, BR)) { y = py; vy = -vy * REST; }
        if (hitsWall(tiles, x, y, BR)) { x = px; y = py; vx = -vx * REST; vy = -vy * REST; }
      }
    }
    vx *= FR; vy *= FR;
    if (Math.hypot(vx, vy) < 0.05) break;
  }
  return { goal: false, x, y };
}

async function run(spec0, spec1, n, seed) {
  const g = await playGame({ seed, teamSize: n, p0: spec0, p1: spec1 });
  const st = [{ shots: 0, ongoal: 0, kicks: 0, goals: 0, saves: 0 }, { shots: 0, ongoal: 0, kicks: 0, goals: 0, saves: 0 }];
  for (const e of g.events) {
    if (e.type === 'kick') {
      const t = e.team;
      st[t].kicks++;
      const fl = flight(g.tiles, e.x, e.y, e.angle);
      const attGoal = t === 0 ? 43 : 0;
      if (fl.goal && ((t === 0 && fl.x > 30) || (t === 1 && fl.x < 14))) {
        st[t].shots++;
        st[t].ongoal++;
      } else {
        // ray aimed at the mouth still counts as a shot attempt
        const gx = attGoal;
        const ty = 13;
        // does the initial segment point into the goal-mouth corridor?
        const dx = Math.cos(e.angle * Math.PI / 180), dy = Math.sin(e.angle * Math.PI / 180);
        const dist = Math.hypot(gx - e.x, 13 - e.y);
        const lateral = Math.abs(dx * (13 - e.y) - dy * (gx - e.x));
        if (lateral < 6 && dx * (gx - e.x) > 0.3) st[t].shots++;
      }
    } else if (e.type === 'save') st[e.team].saves++;
    else if (e.type === 'goal') st[e.team].goals++;
  }
  return { g, st };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { a: 'python tools/agent_tune.py', b: 'python tools/agent_r2base.py', ns: '1-6', seeds: '7501-7503' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--a') opt.a = args[++i];
    else if (args[i] === '--b') opt.b = args[++i];
    else if (args[i] === '--ns') opt.ns = args[++i];
    else if (args[i] === '--seeds') opt.seeds = args[++i];
  }
  const ns = []; for (const p of opt.ns.split(',')) { const [x, y] = p.includes('-') ? p.split('-').map(Number) : [Number(p), Number(p)]; for (let i = x; i <= y; i++) ns.push(i); }
  const seeds = []; for (const p of opt.seeds.split(',')) { const [x, y] = p.includes('-') ? p.split('-').map(Number) : [Number(p), Number(p)]; for (let i = x; i <= y; i++) seeds.push(i); }
  let agg = { aw: 0, d: 0, l: 0, gf: 0, ga: 0, shots: 0, ongoal: 0, kicks: 0, saves: 0, poss: 0, oppPoss: 0 };
  for (const n of ns) {
    let row = { w: 0, d: 0, l: 0, gf: 0, ga: 0, shots: 0, ongoal: 0, kicks: 0, saves: 0, poss: 0, oppPoss: 0 };
    for (const seed of seeds) {
      for (const seat of [0, 1]) {
        const p0 = seat === 0 ? opt.a : opt.b, p1 = seat === 0 ? opt.b : opt.a;
        const { g, st } = await run(p0, p1, n, seed);
        const mine = st[seat], theirs = st[1 - seat];
        row.gf += g.score[seat]; row.ga += g.score[1 - seat];
        row.shots += mine.shots; row.ongoal += mine.ongoal; row.kicks += mine.kicks; row.saves += mine.saves;
        row.poss += g.stats[seat].possession; row.oppPoss += g.stats[1 - seat].possession;
        if (g.score[seat] > g.score[1 - seat]) row.w++; else if (g.score[seat] < g.score[1 - seat]) row.l++; else row.d++;
      }
    }
    console.log(`n=${n} W-D-L ${row.w}-${row.d}-${row.l} GF-GA ${row.gf}-${row.ga} shots ${row.shots} ongoal ${row.ongoal} kicks ${row.kicks} saves ${row.saves} poss ${row.poss}:${row.oppPoss}`);
    for (const k of Object.keys(agg)) agg[k] += row[k];
  }
  console.log(`ALL W-D-L ${agg.w}-${agg.d}-${agg.l} GF-GA ${agg.gf}-${agg.ga} shots ${agg.shots} ongoal ${agg.ongoal} kicks ${agg.kicks} saves ${agg.saves} poss ${agg.poss}:${agg.oppPoss}`);
}
main().catch(e => { console.error(e); process.exit(1); });
