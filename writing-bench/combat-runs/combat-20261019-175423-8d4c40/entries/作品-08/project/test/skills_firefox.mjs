import { firefox } from "/workspace/.devtools/node_modules/playwright/index.mjs";
const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
await page.goto("file:///workspace/game.html?debug=1");
await page.waitForTimeout(800); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
const dbg=()=>page.evaluate(()=>window.__combatDebug());
const out=[];
for (const [key,id,wait] of [["Digit1",1,1200],["Digit2",2,1200],["Digit3",3,2200],["Digit4",4,1400]]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(160);
  const d=await dbg();
  out.push({id,started:d.player.state==="skill"&&d.player.skill?.id===id,state:d.player.state,cd:d.player.skillCd[id],skillFx:d.skillFxCount});
  if(id===2) await page.screenshot({path:"/workspace/test/firefox-skill2.png"});
  if(id===4) await page.screenshot({path:"/workspace/test/firefox-skill4.png"});
  await page.waitForTimeout(wait);
}
out.push({state:await page.evaluate(()=>window.combatBenchState()), final:await dbg()});
console.log(JSON.stringify({out,errors},null,1));
await browser.close();
