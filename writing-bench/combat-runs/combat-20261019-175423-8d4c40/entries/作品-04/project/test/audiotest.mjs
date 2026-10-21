import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', e => errs.push('ERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto('file:///workspace/game.html');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
console.log('audio state', JSON.stringify(await page.evaluate(() => ({ unlocked: Audio_.unlocked, hasCtx: !!Audio_.ctx, state: Audio_.ctx && Audio_.ctx.state, muted: Audio_.muted }))));
// mute via M key
await page.keyboard.press('KeyM');
await page.waitForTimeout(100);
console.log('after M', JSON.stringify(await page.evaluate(() => ({ muted: Audio_.muted, btn: document.getElementById('muteBtn').textContent }))));
await page.keyboard.press('KeyM');
// click button
await page.click('#muteBtn');
await page.waitForTimeout(100);
console.log('after click', JSON.stringify(await page.evaluate(() => ({ muted: Audio_.muted, btn: document.getElementById('muteBtn').textContent, pressed: document.getElementById('muteBtn').getAttribute('aria-pressed') }))));
await page.click('#muteBtn');
// play for a bit with sounds
for (let i=0;i<20;i++){ await page.keyboard.press('KeyJ'); await page.waitForTimeout(120); }
await page.waitForTimeout(300);
console.log('errors', errs.length ? errs.slice(0,5) : 'none');
console.log('state', JSON.stringify(await page.evaluate(()=>window.combatBenchState())));
// blur clears keys
await page.keyboard.down('KeyD');
console.log('held right', await page.evaluate(()=>Input.held['KeyD']));
await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
console.log('after blur', await page.evaluate(()=>Input.held['KeyD']));
await browser.close();
