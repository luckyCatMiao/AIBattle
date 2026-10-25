'use strict';
/* Diversity benchmark: same rules, but each game starts from a seeded random
 * perturbation of the kickoff state (unit positions +-1.5 cells, ball offset
 * +-3 cells with a random velocity).  Used only to check that a tactic change
 * is robust beyond the two deterministic kickoff trajectories. */
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

class ProcAgent {
  constructor(name, cmd) {
    this.name = name;
    this.child = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.queue = []; this.waiters = [];
    this.rl.on('line', line => { if (this.waiters.length) this.waiters.shift()(line); else this.queue.push(line); });
    this.child.stderr.on('data', () => {});
    this.child.on('exit', () => { while (this.waiters.length) this.waiters.shift()(null); });
  }
  request(obs) {
    return new Promise((resolve, reject) => {
      this.child.stdin.write(JSON.stringify(obs) + '\n');
      const timer = setTimeout(() => reject(new Error(this.name + ' timeout')), 5000);
      const take = l => {
        clearTimeout(timer);
        if (l == null) return reject(new Error(this.name + ' died'));
        try { resolve(JSON.parse(l)); } catch (e) { reject(new Error(this.name + ' bad json')); }
      };
      if (this.queue.length) take(this.queue.shift()); else this.waiters.push(take);
    });
  }
  close() { try { this.child.stdin.close(); this.child.kill(); } catch (e) {} }
}

function rng(seed) {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

async function playJitter({ seed, teamSize, p0, p1 }) {
  const agents = [new ProcAgent('p0', p0.split(' ')), new ProcAgent('p1', p1.split(' '))];
  const g = sim.createMatch({ id: 'j' + seed, seed, players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], teamSize });
  const rand = rng(seed * 7919 + teamSize * 104729);
  for (const u of g.units) {
    u.x = Math.max(1.0, Math.min(43.0, u.x + (rand() * 2 - 1) * 1.5));
    u.y = Math.max(1.0, Math.min(25.0, u.y + (rand() * 2 - 1) * 1.5));
  }
  g.ball.x = 22 + (rand() * 2 - 1) * 3;
  g.ball.y = 13 + (rand() * 2 - 1) * 3;
  const a = rand() * Math.PI * 2, v = rand() * 3;
  g.ball.vx = Math.cos(a) * v; g.ball.vy = Math.sin(a) * v;
  g.freeze = 0;
  let windows = 0;
  try {
    while (g.status === 'playing' && windows < 200) {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [r0, r1] = await Promise.all([agents[0].request(v0), agents[1].request(v1)]);
      sim.advanceWindow(g, [sim.submitWindow(g, 0, r0.inputs), sim.submitWindow(g, 1, r1.inputs)]);
      windows++;
    }
  } finally { agents.forEach(a => a.close()); }
  return g;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { a: 'python agent.py', b: 'python tools/agent_r2base.py', ns: '2-6', seeds: '9001-9010', swap: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--a') opt.a = args[++i];
    else if (args[i] === '--b') opt.b = args[++i];
    else if (args[i] === '--ns') opt.ns = args[++i];
    else if (args[i] === '--seeds') opt.seeds = args[++i];
  }
  const ns = [], seeds = [];
  for (const p of opt.ns.split(',')) { const [x, y] = p.includes('-') ? p.split('-').map(Number) : [Number(p), Number(p)]; for (let i = x; i <= y; i++) ns.push(i); }
  for (const p of opt.seeds.split(',')) { const [x, y] = p.includes('-') ? p.split('-').map(Number) : [Number(p), Number(p)]; for (let i = x; i <= y; i++) seeds.push(i); }
  let tw = 0, td = 0, tl = 0, tgf = 0, tga = 0;
  for (const n of ns) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const seed of seeds) {
      for (const seat of [0, 1]) {
        const p0 = seat === 0 ? opt.a : opt.b, p1 = seat === 0 ? opt.b : opt.a;
        const g = await playJitter({ seed, teamSize: n, p0, p1 });
        const mine = g.score[seat], theirs = g.score[1 - seat];
        gf += mine; ga += theirs;
        if (mine > theirs) w++; else if (mine < theirs) l++; else d++;
      }
    }
    tw += w; td += d; tl += l; tgf += gf; tga += ga;
    console.log(`n=${n} W-D-L ${w}-${d}-${l} GF-GA ${gf}-${ga}`);
  }
  console.log(`ALL W-D-L ${tw}-${td}-${tl} GF-GA ${tgf}-${tga}`);
}
main().catch(e => { console.error(e); process.exit(1); });
