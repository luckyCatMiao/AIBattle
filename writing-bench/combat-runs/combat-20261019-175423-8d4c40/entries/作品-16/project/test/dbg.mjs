import puppeteer from 'puppeteer';
const EXE = '/workspace/test/.chrome-cache/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 300)));
await page.goto('file:///workspace/game.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1200));
console.log('bench fn:', await page.evaluate(() => typeof window.combatBenchState));
console.log('game:', await page.evaluate(() => typeof window.__game));
await browser.close();
