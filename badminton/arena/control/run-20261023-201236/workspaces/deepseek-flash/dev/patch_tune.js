const fs=require('fs');
let s=fs.readFileSync('brain.js','utf8');
const oldA="const READY_OFF = 3.4;    // 常规站位：离网 3.4 格（略深于中线，逼对手往深区打）\nconst DEF_OFF = 3.4;      // 发球后防守站位：离网 3.4 格\nconst FREE_SPEED = 3.18;  // 低于 3.2 的跑动不耗体力";
const newA="const TUNE = {\n  readyOff: 3.4, defOff: 3.4, freeSpeed: 3.18,\n  allowJump: true, jumpMinStamina: 45, jumpCostHigh: 14, jumpCostLow: 24,\n  serveDef: true, serveDefLead: 2, counterDef: true,\n};\nconst FREE_SPEED = 3.18;  // 低于 3.2 的跑动不耗体力";
if(!s.includes(oldA)) throw new Error('A not found');
s=s.replace(oldA,newA);
const reps=[
 ['NET - READY_OFF : NET + READY_OFF','NET - TUNE.readyOff : NET + TUNE.readyOff'],
 ['NET - DEF_OFF : NET + DEF_OFF','NET - TUNE.defOff : NET + TUNE.defOff'],
 ['const canJump = me.stamina > 45 && me.onGround;','const canJump = TUNE.allowJump && me.stamina > TUNE.jumpMinStamina && me.onGround;'],
 ['const jumpCost = me.stamina < 70 ? 24 : 14;','const jumpCost = me.stamina < 70 ? TUNE.jumpCostLow : TUNE.jumpCostHigh;'],
 ['S = g.frame + c.frame - 2;','S = g.frame + c.frame - TUNE.serveDefLead;'],
 ['if (g.rally === 0) return serveDefense(g, team);','if (g.rally === 0 && TUNE.serveDef) return serveDefense(g, team);'],
 ['predictServeContact, serveDefense, DEF_OFF, READY_OFF,','predictServeContact, serveDefense, TUNE,'],
];
for(const [a,b] of reps){ if(!s.includes(a)) throw new Error('missing: '+a); s=s.split(a).join(b); }
fs.writeFileSync('brain.js',s); console.log('patched');
