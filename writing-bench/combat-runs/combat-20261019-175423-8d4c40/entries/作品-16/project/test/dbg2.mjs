import puppeteer from 'puppeteer';
const EXE = '/workspace/test/.chrome-cache/chrome/linux-155.0.8059.84/chrome-linux64/chrome';
const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.stack || e.message));
await page.goto('file:///workspace/game.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 800));
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 3000));
// simulate a bit
for (let i = 0; i < 10; i++) { await page.keyboard.down('KeyD'); await new Promise(r=>setTimeout(r,200)); }
await page.keyboard.up('KeyD');
for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await new Promise(r=>setTimeout(r,150)); }
await new Promise(r => setTimeout(r, 2000));
await browser.close();
