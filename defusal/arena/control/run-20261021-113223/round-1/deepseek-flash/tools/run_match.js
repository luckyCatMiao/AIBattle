'use strict';
const sim = require('../simulation');
const { Bot } = require('./bot');
const { spawn } = require('child_process');
const readline = require('readline');

class PyAgent {
  constructor(cmd = ['python3', '/workspace/agent.py'], tag = 'py', env = null) {
    this.proc = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(process.env.PYDEBUG ? { AGENT_DEBUG: '1' } : {}), ...(env || {}) } });
    this.tag = tag;
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.queue = [];
    this.waiters = [];
    this.errBuf = [];
    this.rl.on('line', (l) => {
      const w = this.waiters.shift();
      if (w) w(l); else this.queue.push(l);
    });
    this.proc.stderr.on('data', (d) => { const t = String(d); this.errBuf.push(t); if (this.errBuf.length > 40) this.errBuf.shift(); if (process.env.PYDEBUG) process.stderr.write('[' + this.tag + '] ' + t); });
    this.proc.on('exit', (c) => { while (this.waiters.length) this.waiters.shift()(null); });
  }
  async ask(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
    const line = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout waiting for ' + this.tag)), 5000);
      this.waiters.push((l) => { clearTimeout(t); res(l); });
      if (this.queue.length) { clearTimeout(t); res(this.queue.shift()); }
    });
    if (line === null) throw new Error('process died: ' + this.errBuf.join(''));
    return JSON.parse(line);
  }
  async buy(view) { return this.ask({ ...view, phase: 'buy' }); }
  async live(view) { return this.ask(view); }
  kill() { try { this.proc.kill(); } catch (e) {} }
}

class JsBot {
  constructor(style) { this.bot = new Bot(style); this.style = style; }
  async buy(view) { return this.bot.buy(view); }
  async live(view) { return this.bot.makeWindow(view); }
  kill() {}
}

function validateInputs(inputs) {
  const ok = ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];
  if (!Array.isArray(inputs) || inputs.length !== 20) return 'bad window length ' + (inputs && inputs.length);
  for (const fr of inputs) {
    if (!Array.isArray(fr) || fr.length !== 5) return 'bad frame';
    for (const c of fr) {
      if (!c || typeof c !== 'object') return 'bad cell';
      if (!ok.includes(c.dir)) return 'bad dir ' + c.dir;
      if (c.aim !== undefined && c.aim !== null && !ok.includes(c.aim)) return 'bad aim ' + c.aim;
    }
  }
  return null;
}

async function runMatch(ctrl0, ctrl1, seed, opts = {}) {
  const g = sim.createMatch({ id: 'test' + seed, players: [{ name: opts.n0 || 'P0', kind: 'api' }, { name: opts.n1 || 'P1', kind: 'api' }], seed });
  let guard = 0;
  const errors = [];
  while (g.status === 'playing' && guard++ < 5000) {
    if (g.phase === 'buy') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [b0, b1] = await Promise.all([ctrl0.buy(v0), ctrl1.buy(v1)]);
      try { sim.submitBuys(g, 0, b0.buys || []); } catch (e) { errors.push('buy0 ' + e.message); }
      try { sim.submitBuys(g, 1, b1.buys || []); } catch (e) { errors.push('buy1 ' + e.message); }
    } else if (g.phase === 'live') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [i0, i1] = await Promise.all([ctrl0.live(v0), ctrl1.live(v1)]);
      const e0 = validateInputs(i0.inputs), e1 = validateInputs(i1.inputs);
      if (e0) throw new Error('P0 invalid: ' + e0);
      if (e1) throw new Error('P1 invalid: ' + e1);
      const w0 = sim.submitWindow(g, 0, i0.inputs);
      const w1 = sim.submitWindow(g, 1, i1.inputs);
      sim.advanceWindow(g, [w0, w1]);
    } else break;
  }
  if (guard >= 5000) throw new Error('guard exceeded');
  return {
    winner: g.winner, reason: g.reason, roundWins: g.roundWins, roundLog: g.roundLog, errors,
    stats: g.roundLog.map(r => ({ round: r.round, winner: r.winnerTeam, reason: r.reason, frames: r.frames, bomb: r.bomb })),
  };
}

async function main() {
  const seeds = (process.argv[2] || '1').split(',').map(Number);
  const style = process.argv[3] || 'mixed';
  const swap = process.argv[4] === 'swap';
  let mine = 0, theirs = 0, draws = 0;
  for (const seed of seeds) {
    const py = new PyAgent();
    const isMirror = style.startsWith('mirror');
    const mv = style.match(/^mirror(\w*)$/);
    const other = isMirror
      ? new PyAgent(['python3', '/workspace/agent.py'], 'py2', mv && mv[1] ? { AGENT_VARIANT: mv[1] } : null)
      : new JsBot(style);
    let r;
    try {
      if (swap) r = await runMatch(py, other, seed, { n0: 'Mine', n1: isMirror ? 'Mine2' : 'Bot' });
      else r = await runMatch(other, py, seed, { n0: isMirror ? 'Mine2' : 'Bot', n1: 'Mine' });
    } finally {
      py.kill(); other.kill();
    }
    const myTeam = swap ? 0 : 1;
    const w = r.winner === null ? -1 : r.winner === myTeam ? 1 : 0;
    if (w === 1) mine++; else if (w === 0) theirs++; else draws++;
    const rounds = r.roundLog.map(x => `${x.winnerTeam === myTeam ? 'W' : 'L'}(${x.reason},${x.bomb.state}${x.bomb.site ? '@' + x.bomb.site : ''})`).join(' ');
    console.log(`seed ${seed} style ${style} swap=${swap}: ${r.roundWins.join(':')} -> ${w === 1 ? 'WIN' : w === 0 ? 'LOSS' : 'DRAW'} | ${rounds}`);
  }
  console.log(`TOTAL mine=${mine} theirs=${theirs} draws=${draws}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { runMatch, PyAgent, JsBot };
