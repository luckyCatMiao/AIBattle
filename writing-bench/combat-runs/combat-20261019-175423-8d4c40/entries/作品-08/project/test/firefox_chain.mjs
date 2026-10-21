import { firefox } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser=await firefox.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
await page.goto("file:///workspace/game.html?debug=1"); await page.waitForTimeout(800);
await page.keyboard.press("Enter"); await page.waitForTimeout(1300);
await page.evaluate(()=>{window.__sk=[];window.__si=setInterval(()=>{const d=window.__combatDebug();const id=d.player.skill?d.player.skill.id:null;const l=window.__sk[window.__sk.length-1];if(!l||l.id!==id)window.__sk.push({id,t:d.time});},25);});
for(const k of ["Digit1","Digit2","Digit3","Digit4"]){ await page.keyboard.press(k); await page.waitForTimeout(70); }
await page.waitForTimeout(6500);
const seq=await page.evaluate(()=>{clearInterval(window.__si);return window.__sk;});
console.log(JSON.stringify({seq,state:await page.evaluate(()=>window.combatBenchState()),errors},null,1));
await browser.close();
