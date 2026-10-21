import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true, executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(700); await page.keyboard.press("Enter"); await page.waitForTimeout(1700);
const dbg=()=>page.evaluate(()=>window.__combatDebug());
const st=()=>page.evaluate(()=>window.combatBenchState());
const summary={};
// key-only fallback for "1"
const before=await st();
await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"1",bubbles:true,cancelable:true})));
await page.waitForTimeout(120);
let d=await dbg();
summary.keyFallbackStart = d.player.skill && d.player.skill.id;
await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{key:"1",bubbles:true,cancelable:true})));
await page.waitForTimeout(700);
// denial while cd
const cdBefore=(await dbg()).player.skillCd[1];
await page.keyboard.press("Digit1");
await page.waitForTimeout(120);
d=await dbg();
summary.denial = { state:d.player.state, deny:(await page.evaluate(()=>window.__combatDebug())).player.skillCd[1], cdBefore };
// use 2,3,4, all while 1 cooling
const starts=[];
for (const [key,id] of [["Digit2",2],["Digit3",3],["Digit4",4]]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(90);
  const dd=await dbg();
  starts.push({key,state:dd.player.state,skill:dd.player.skill&&dd.player.skill.id,cd:dd.player.skillCd[id]});
  if (id===2) await page.waitForTimeout(700);
  else if (id===3) await page.waitForTimeout(1700);
  else await page.waitForTimeout(700);
}
summary.starts=starts;
const d2=await dbg();
summary.cds=d2.player.skillCd;
summary.state=await st();
summary.errors=errors;
await page.screenshot({path:"/workspace/test/skills-allcd.png"});
console.log(JSON.stringify(summary,null,1));
await browser.close();
