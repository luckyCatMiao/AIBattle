import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ headless: true, executablePath: "/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(700); await page.keyboard.press("Enter"); await page.waitForTimeout(1600);
const dbg=()=>page.evaluate(()=>window.__combatDebug());
const out=[];
const seq=[["Digit1",1,1300],["Digit2",2,1400],["Digit3",3,2400],["Digit4",4,1600]];
for (const [key,id,wait] of seq) {
  const b=await page.evaluate(()=>window.combatBenchState());
  await page.keyboard.press(key);
  await page.waitForTimeout(140);
  const d=await dbg();
  out.push({id,started:d.player.state==="skill"&&d.player.skill?.id===id, state:d.player.state, skillId:d.player.skill?.id, cd:d.player.skillCd[id], hitDelta:(await page.evaluate(()=>window.combatBenchState())).hitCount-b.hitCount});
  await page.waitForTimeout(wait);
}
const fin=await dbg();
out.push({finalState:fin.player.state, cds:fin.player.skillCd, state:await page.evaluate(()=>window.combatBenchState())});
await page.screenshot({path:"/workspace/test/skills-cd-all.png"});
console.log(JSON.stringify({out,errors},null,1));
await browser.close();
