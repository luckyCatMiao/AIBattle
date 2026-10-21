import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const libs = ['nspr','nss','alsa'].map(n=>`/tmp/rust-browser-libs/${n}/extracted/usr/lib/x86_64-linux-gnu`).filter(existsSync);
export async function launch() {
  return chromium.launch({headless:true,args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:[...libs,process.env.LD_LIBRARY_PATH||''].join(':')}});
}
export const debugHook = `Object.defineProperty(window,'__inspectCombat',{value:()=>JSON.parse(JSON.stringify({mode,now,worldTime,freeze,frameCost,wave,kills,combo,camera,player,enemies,debris,slashes,skillObjects,skillFX,input,keys:[...keys]}))});`;
export function inspectable(html) { return html.replace('resize();reset(false);',debugHook+'\nresize();reset(false);'); }
