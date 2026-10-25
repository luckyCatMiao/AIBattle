'use strict';
/* 把外部 node 选手（如 sol 的 agent.js）接进离线对战台。只用于自测。 */
const { spawn } = require('child_process');

class NodeAgent {
  constructor(script, cwd, tag) {
    this.tag = tag || script;
    this.proc = spawn('node', [script], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.pending = []; this.err = '';
    this.proc.stdout.on('data', d => {
      this.buf += d.toString('utf8');
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const r = this.pending.shift();
        if (r) r(line);
      }
    });
    this.proc.stderr.on('data', d => { this.err += d.toString('utf8'); if (this.err.length > 40000) this.err = this.err.slice(-20000); });
    this.proc.on('error', e => { this.err += 'SPAWN ERROR ' + e.message; });
  }
  ask(obs) {
    return new Promise((res, rej) => {
      if (this.proc.exitCode !== null) return rej(new Error('agent exited: ' + this.err.slice(-500)));
      const timer = setTimeout(() => rej(new Error('agent timeout (10s) tag=' + this.tag)), 10000);
      this.pending.push(line => { clearTimeout(timer); res(line); });
      this.proc.stdin.write(JSON.stringify(obs) + '\n');
    });
  }
  kill() { try { this.proc.stdin.end(); this.proc.kill(); } catch (e) {} }
}

module.exports = { NodeAgent };
