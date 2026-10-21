import { chromium } from '/tmp/pwtest/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const file = 'file:///workspace/game.html';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(file);
await page.waitForTimeout(600);
let st = await page.evaluate(() => window.combatBenchState && window.combatBenchState());
console.log('initial', JSON.stringify(st));
await page.screenshot({ path: '/workspace/test/shot_title.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
st = await page.evaluate(() => window.combatBenchState());
console.log('started', JSON.stringify(st));
await page.screenshot({ path: '/workspace/test/shot_play.png' });
// move toward enemy and attack
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.keyboard.up('KeyD');
for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(160); }
await page.waitForTimeout(300);
st = await page.evaluate(() => window.combatBenchState());
console.log('after attacks', JSON.stringify(st));
await page.screenshot({ path: '/workspace/test/shot_hit.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
