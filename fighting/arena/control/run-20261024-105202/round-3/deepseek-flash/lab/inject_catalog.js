const fs = require('fs');
let src = fs.readFileSync('agent.py', 'utf8');
if (src.includes('EMBEDDED_CATALOG_JSON')) { console.log('already'); process.exit(0); }
const data = fs.readFileSync('lab/catalog_embed.json', 'utf8');
const q = String.fromCharCode(39, 39, 39); // '''
const block = [
  '',
  '# === 内嵌帧数据 BEGIN（由 catalog.js 生成；真实裁判的观察里没有 catalog 字段）===',
  'EMBEDDED_CATALOG_JSON = r' + q,
  data,
  q,
  'EMBEDDED_CATALOG = json.loads(EMBEDDED_CATALOG_JSON)',
  '# === 内嵌帧数据 END ===',
  '',
].join('\n');
const marker = 'MOT = {';
const i = src.indexOf(marker);
if (i < 0) throw new Error('marker not found');
src = src.slice(0, i) + block + src.slice(i);
fs.writeFileSync('agent.py', src);
console.log('inserted, new size', src.length);
