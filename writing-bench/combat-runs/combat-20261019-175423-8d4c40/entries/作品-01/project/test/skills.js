/* Verify all four skills: fire, damage, cooldown, recovery, ultimate severing. */
const H = require('./harness_lib.js');
H.key('Enter', true); H.key('Enter', false); H.frame(16);
const w = H.world(), p = w.player;
for (let i = 0; i < 200; i++) H.frame(16);

function press(code) { H.key(code, true); H.key(code, false); }

// --- 1. Moon Wheel: radial damage to enemies on both sides ---
{
  const a = w.spawnEnemy('gnawer', 1); a.spawnT = 0; a.state = 'idle';
  const b = w.spawnEnemy('gnawer', 1); b.spawnT = 0; b.state = 'idle';
  for (let i = 0; i < 3; i++) H.frame(16);
  a.x = p.x + 70; b.x = p.x - 70; a.vx = b.vx = 0;
  const h0 = a.hp + b.hp, hits0 = w.stats.hitCount;
  press('Digit1');
  for (let i = 0; i < 70; i++) H.frame(16);
  console.log('skill1: dmg', (h0 - (a.hp + b.hp)).toFixed(0), 'hits+', w.stats.hitCount - hits0, 'cd', p.skillCd[0].toFixed(1), 'state', p.state);
  if (a.hp + b.hp >= h0) throw new Error('moon wheel dealt no damage');
  if (p.skillCd[0] <= 0) throw new Error('moon wheel cooldown not set');
  a.dead = true; b.dead = true;
}

// --- 2. Shadow Rend: dash + delayed detonation ---
{
  const e = w.spawnEnemy('samurai', 1); e.spawnT = 0; e.state = 'idle';
  for (let i = 0; i < 3; i++) H.frame(16);
  e.x = p.x + 90; e.vx = 0; p.facing = 1;
  const h0 = e.hp;
  press('Digit2');
  let marked = false;
  for (let i = 0; i < 90; i++) { H.frame(16); if (e._shadowMarked > 0) marked = true; }
  console.log('skill2: marked', marked, 'dmg', (h0 - e.hp).toFixed(0), 'cd', p.skillCd[1].toFixed(1), 'playerX', p.x.toFixed(0));
  if (e.hp >= h0) throw new Error('shadow rend dealt no damage');
  e.dead = true;
}

// --- 3. Blade Rain: falling blades damage nearby enemies ---
{
  const e = w.spawnEnemy('gnawer', 1); e.spawnT = 0; e.state = 'idle';
  for (let i = 0; i < 3; i++) H.frame(16);
  e.x = p.x + 60; e.vx = 0;
  const h0 = e.hp;
  press('Digit3');
  for (let i = 0; i < 130; i++) H.frame(16);
  console.log('skill3: dmg', (h0 - e.hp).toFixed(0), 'cd', p.skillCd[2].toFixed(1), 'rainLeft', w.bladeRain.length);
  if (e.hp >= h0) throw new Error('blade rain dealt no damage');
  e.dead = true;
}

// --- 4. Ultimate: time slow, multi-hit, limbs severed ---
{
  const e = w.spawnEnemy('samurai', 1); e.spawnT = 0; e.state = 'idle';
  for (let i = 0; i < 3; i++) H.frame(16);
  e.x = p.x + 100; e.vx = 0;
  const h0 = e.hp, breaks0 = w.stats.limbBreakCount;
  press('Digit4');
  let slowed = false;
  for (let i = 0; i < 160; i++) { H.frame(16); if (w.slowmoT > 0) slowed = true; }
  console.log('skill4: dmg', (h0 - e.hp).toFixed(0), 'severed+', w.stats.limbBreakCount - breaks0, 'slowmo', slowed, 'cd', p.skillCd[3].toFixed(1));
  if (e.hp >= h0) throw new Error('ultimate dealt no damage');
  if (!slowed) throw new Error('ultimate did not slow time');
  if (w.stats.limbBreakCount <= breaks0) throw new Error('ultimate did not sever any limb');
}

// --- 5. recovery: normal play resumes, cooldowns block reuse ---
{
  for (let i = 0; i < 40; i++) H.frame(16);
  if (p.state === 'skill') throw new Error('stuck in skill state');
  const x0 = p.x;
  H.key('KeyD', true);
  for (let i = 0; i < 30; i++) H.frame(16);
  H.key('KeyD', false);
  console.log('post-skill movement dx', (p.x - x0).toFixed(0), 'state', p.state);
  if (p.x - x0 < 20) throw new Error('cannot move after skills');
  // cooldown must block a fresh cast
  const e2 = w.spawnEnemy('gnawer', 1); e2.spawnT = 0; e2.state = 'idle';
  for (let i = 0; i < 3; i++) H.frame(16);
  p.x = e2.x - 60;
  press('Digit2');            // fresh cast (skill2 is off cooldown by now)
  for (let i = 0; i < 4; i++) H.frame(16);   // still inside cast
  const cdMid = p.skillCd[1];
  for (let i = 0; i < 60; i++) H.frame(16);  // finish cast, cd ticking but > 0
  const stateAfter = p.state;
  press('Digit2');            // must be refused
  for (let i = 0; i < 10; i++) H.frame(16);
  console.log('cooldown gate: cd mid', cdMid.toFixed(1), 'cd now', p.skillCd[1].toFixed(1), 'state', p.state);
  if (p.state === 'skill' && p.skillT < 0.05) throw new Error('skill fired while on cooldown');
  if (p.skillCd[1] <= 0) throw new Error('cooldown expired unexpectedly');
}
console.log('SKILLS OK');
