import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function browser() {
  const libs = ['nspr','nss','alsa'].map(n=>root+'test-tools/downloads/'+n+'/extracted/usr/lib/x86_64-linux-gnu').join(':');
  return chromium.launch({ headless:true, args:['--no-sandbox'], env:{...process.env,LD_LIBRARY_PATH:libs+':'+(process.env.LD_LIBRARY_PATH||'')} });
}
export const gameURL = new URL('../game.html', import.meta.url).href;
