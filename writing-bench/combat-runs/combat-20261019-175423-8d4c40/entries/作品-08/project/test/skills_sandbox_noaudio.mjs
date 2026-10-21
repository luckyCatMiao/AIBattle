import { chromium } from "/workspace/.devtools/node_modules/playwright/index.mjs";
import fs from "node:fs";
const html=fs.readFileSync("/workspace/game.html","utf8");
const browser=await chromium.launch({headless:true, executablePath:"/home/player/.cache/ms-playwright/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const results={};
// sandboxed iframe
{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
 await page.setContent('<!DOCTYPE html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" style="width:1280px;height:720px;border:0"></iframe></body></html>');
 await page.evaluate((html)=>{document.getElementById("f").srcdoc=html;},html);
 await page.waitForTimeout(1300);
 const frame=page.frames().find(f=>f!==page.mainFrame());
 await frame.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",cancelable:true})));
 await page.waitForTimeout(1600);
 const before=await frame.evaluate(()=>window.combatBenchState());
 const starts=[];
 for(const id of [1,2,3,4]){
   await frame.evaluate((id)=>window.dispatchEvent(new KeyboardEvent("keydown",{key:String(id),bubbles:true,cancelable:true})),id);
   await frame.evaluate((id)=>window.dispatchEvent(new KeyboardEvent("keyup",{key:String(id),bubbles:true,cancelable:true})),id);
   await page.waitForTimeout(160);
   starts.push({id, state: await frame.evaluate(()=>window.combatBenchState())});
   await page.waitForTimeout(id===3?2200:1300);
 }
 results.sandbox={before,starts,after:await frame.evaluate(()=>window.combatBenchState()),errors};
 await page.screenshot({path:"/workspace/test/skills-sandbox.png"});
 await page.close();
}
// no audio
{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[]; page.on("pageerror",e=>errors.push(e.stack)); page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
 await page.addInitScript(()=>{delete window.AudioContext; delete window.webkitAudioContext;});
 await page.goto("file:///workspace/game.html?debug=1");
 await page.waitForTimeout(700); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
 const starts=[];
 for(const id of [1,2,3,4]){
   await page.keyboard.press("Digit"+id);
   await page.waitForTimeout(160);
   const d=await page.evaluate(()=>window.__combatDebug());
   starts.push({id,state:d.player.state,skillId:d.player.skill?.id,cd:d.player.skillCd[id]});
   await page.waitForTimeout(id===3?2200:1300);
 }
 results.noaudio={starts,state:await page.evaluate(()=>window.combatBenchState()),errors};
 await page.close();
}
console.log(JSON.stringify(results,null,1));
await browser.close();
