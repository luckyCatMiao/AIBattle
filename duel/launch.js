'use strict';
const http = require('node:http');
const port = Number(process.env.DUEL_PORT || 8817);
const url = `http://127.0.0.1:${port}/`;
function ready() {
  return new Promise(resolve => {
    const req = http.get(url + 'api/catalog', res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => { try { const d = JSON.parse(text); resolve(!!d.rules); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}
(async () => {
  if (await ready()) { require('node:child_process').exec(`cmd.exe /d /c start "" "${url}"`); return; }
  const { createServer } = require('./server');
  createServer().listen(port, '127.0.0.1', async () => {
    for (let i = 0; i < 30; i++) { if (await ready()) break; await new Promise(r => setTimeout(r, 200)); }
    require('node:child_process').exec(`cmd.exe /d /c start "" "${url}"`);
    console.log('AIBattle Ricochet Duel: ' + url);
  });
})();
