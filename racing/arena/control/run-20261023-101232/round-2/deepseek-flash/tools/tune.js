'use strict';
/* 参数扫描：并发跑多组参数 × 多个种子，汇总平均圈速 / 越野 / 失败。
 * node tools/tune.js --seeds 1-20 --configs tools/cfgA.json,tools/cfgB.json --jobs 4
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { seeds: '1-20', configs: '', jobs: '4', opponent: 'none' };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--seeds') o.seeds = a[++i];
    else if (a[i] === '--configs') o.configs = a[++i];
    else if (a[i] === '--jobs') o.jobs = a[++i];
    else if (a[i] === '--opponent') o.opponent = a[++i];
  }
  return o;
}

function seedList(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else out.push(Number(part));
  }
  return out;
}

function runOne(cfgPath, seeds, opponent) {
  return new Promise((resolve) => {
    const args = [path.join(__dirname, 'race.js'), '--seeds', seeds.join(','), '--agent', 'python -u agent.py', '--json'];
    if (opponent && opponent !== 'none') args.push('--opponent', opponent);
    execFile(process.execPath, args, {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, cfgPath && cfgPath !== 'default' ? { AGENT_PARAMS: path.resolve(cfgPath) } : {}),
      maxBuffer: 1 << 26,
    }, (err, stdout, stderr) => {
      if (err) return resolve({ cfgPath, error: err.message + stderr.slice(-300) });
      try {
        resolve({ cfgPath, rows: JSON.parse(stdout) });
      } catch (e) {
        resolve({ cfgPath, error: 'parse: ' + stdout.slice(0, 300) });
      }
    });
  });
}

async function main() {
  const o = parseArgs();
  const seeds = seedList(o.seeds);
  let cfgs = o.configs ? o.configs.split(',') : ['default'];
  const jobs = Number(o.jobs);
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < cfgs.length) {
      const c = cfgs[idx++];
      results.push(await runOne(c, seeds, o.opponent));
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, cfgs.length) }, worker));
  results.sort((a, b) => cfgs.indexOf(a.cfgPath) - cfgs.indexOf(b.cfgPath));
  const summary = [];
  for (const r of results) {
    if (r.error) { console.log(r.cfgPath, 'ERROR', r.error); continue; }
    const rows = r.rows;
    const laps = [];
    let offroad = 0, unfinished = 0, maxOff = 0, wins = 0;
    const lapTimes = [];
    for (const row of rows) {
      const l = row.lapTimes[0] || [];
      const lap = l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
      if (lap) laps.push(lap);
      if (l.length < 3) unfinished++;
      offroad += row.offroadWindows[0];
      maxOff = Math.max(maxOff, row.offroadWindows[0]);
      lapTimes.push(lap);
    }
    const mean = laps.length ? laps.reduce((a, b) => a + b, 0) / laps.length : null;
    const worst = laps.length ? Math.max(...laps) : null;
    const row = {
      cfg: r.cfgPath,
      meanLap: mean == null ? null : +mean.toFixed(3),
      worstLap: worst == null ? null : +worst.toFixed(2),
      offroad: offroad,
      maxOff,
      unfinished,
      n: rows.length,
      times: lapTimes.map(x => x == null ? 99 : +x.toFixed(2)),
    };
    summary.push(row);
    console.log(`${r.cfgPath}\tmeanLap=${row.meanLap}\tworst=${row.worstLap}\toffroad=${row.offroad}\tmaxOff=${row.maxOff}\tunfinished=${row.unfinished}/${row.n}`);
    console.log('   times: ' + row.times.join(' '));
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(summary, null, 1));
}
main();
