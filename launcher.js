'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const url = `http://127.0.0.1:${process.env.PORT || 8787}`;
async function ready() {
  try { const r = await fetch(url + '/api/state', {signal: AbortSignal.timeout(800)}); const s = await r.json(); return Array.isArray(s.games) && Array.isArray(s.tournaments); }
  catch { return false; }
}
(async () => {
  if (!await ready()) {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname, detached: true, windowsHide: true,
      stdio: ['ignore', fs.openSync(path.join(__dirname, 'server.log'), 'a'), fs.openSync(path.join(__dirname, 'server-error.log'), 'a')],
    });
    child.unref();
    let alive = false;
    for (let i = 0; i < 30; i++) { if (await ready()) { alive = true; break; } await new Promise(r => setTimeout(r, 200)); }
    if (!alive) throw new Error('服务启动失败，请查看 server-error.log');
  }
  const browser = spawn('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true, detached: true, stdio: 'ignore' });
  browser.unref();
  console.log('AIBattle is running at ' + url);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
