'use strict';
/* Re-simulate a recorded match with OUR agent replaced by the current agent.py,
 * while the opponent replays its recorded inputs.  The old agent (DUEL_KEEP=0)
 * must reproduce the original result exactly; that is the control.
 * usage: node dev/replay_counterfactual.js <gid> [--env K=V,K=V]
 */
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('../simulation.js');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'D:/extraProj/AIBattle/duel/arena/control/run-20261025-233938';

function load(p) { return JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')); }
function parseEnv(s) { const e={}; if(!s) return e; for(const kv of s.split(',')) { const i=kv.indexOf('='); if(i>0) e[kv.slice(0,i).trim()]=kv.slice(i+1).trim(); } return e; }

async function main() {
  const gid = process.argv[2] || 'r2-g1';
  let envArg = null;
  for (let i=3;i<process.argv.length;i++) if (process.argv[i]==='--env') envArg=process.argv[i+1];
  const d = load(path.join(BASE, gid + '.json.gz'));
  const ours = d.seats.indexOf('deepseek-flash');
  const g = sim.createMatch({ id: gid+'-cf', seed: d.seed, players: d.seats.map(s=>({name:s})) });
  const env = Object.assign({}, process.env, parseEnv(envArg));
  const proc = spawn(process.env.PYTHON || 'python', ['agent.py'], { cwd: ROOT, env, stdio: ['pipe','pipe','pipe'], windowsHide: true });
  const rl = readline.createInterface({ input: proc.stdout });
  let pending = null;
  rl.on('line', line => { if (!pending) return; const p=pending; pending=null; try{p.resolve(JSON.parse(line));}catch(e){p.reject(e);} });
  proc.stderr.on('data', d=>{ if(process.env.HARNESS_DEBUG) process.stderr.write('[agent] '+d); });
  const ask = snap => new Promise((resolve,reject)=>{
    pending={resolve,reject};
    proc.stdin.write(JSON.stringify(snap)+'\n');
  });
  let wi = 0, hit = null, minSep = Infinity, minSepFrame = null, frames = 0, firstDiff = null;
  const sepSeries = [];
  try {
    for (const w of d.windows) {
      if (g.status !== 'playing') break;
      const snap = sim.snapshot(g, ours);
      const ans = await ask(snap);
      const mine = ans && ans.inputs;
      if (!Array.isArray(mine) || mine.length > 3) throw new Error('bad agent input');
      const rec = w.inputs[1-ours]; // opponent recorded inputs
      const pair = [];
      pair[ours] = mine;
      pair[1-ours] = rec;
      // compare with recorded own inputs only while states still match
      if (firstDiff === null && JSON.stringify(mine) !== JSON.stringify(w.inputs[ours])) firstDiff = g.frame;
      sim.advanceWindow(g, pair);
      frames = g.frame;
      for (let f=0; f<3; f++) {
        const me=g.players[ours], op=g.players[1-ours];
        const sep=Math.hypot(me.x-op.x, me.y-op.y);
        sepSeries.push({frame:g.frame-2+f, sep});
        if (sep<minSep){minSep=sep;minSepFrame=g.frame-2+f;}
      }
      wi++;
      if (g.status==='finished') break;
    }
  } finally {
    proc.stdin.end(); proc.kill();
  }
  const me = g.players[ours], op = g.players[1-ours];
  console.log(JSON.stringify({gid, env:envArg||'(default)', status:g.status, winner:g.winner,
    oursIndex:ours, frames, simSeconds:+(frames*.05).toFixed(2), minSep:+minSep.toFixed(3), minSepFrame,
    firstDiffFrame:firstDiff, shots:[me.shots,op.shots], alive:[me.alive,op.alive],
    reason:g.reason, event:g.events.filter(e=>e.type==='hit'||e.type==='end').slice(-2)}, null, 1));
}
main().catch(e=>{console.error(e);process.exit(1);});
