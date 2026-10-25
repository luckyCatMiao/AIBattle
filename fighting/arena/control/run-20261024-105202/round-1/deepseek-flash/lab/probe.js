// node probe.js <myChar> <opChar> <meter> <dx> <opState> [extraJson]
// 直接给 agent 一份合成观察，看它输出什么。
const path = require('path');
const { spawn } = require('child_process');
const cat = require('./catalog.patched.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const myChar = process.argv[2] || 'vex';
const opChar = process.argv[3] || 'torv';
const meter = parseInt(process.argv[4] || '100', 10);
const dx = parseInt(process.argv[5] || '100', 10);
const opState = process.argv[6] || 'stand';
const extra = process.argv[7] ? JSON.parse(process.argv[7]) : {};

const myTeam = [myChar, ...['aegis', 'kestrel', 'torv', 'nyx', 'sable'].filter(x => x !== myChar).slice(0, 2)];
const opTeam = [opChar, ...['aegis', 'kestrel', 'torv', 'nyx', 'sable'].filter(x => x !== opChar).slice(0, 2)];
const op = {
  id: 'f2', owner: 1, char: opChar, name: cat.characters[opChar].name, archetype: cat.characters[opChar].archetype,
  x: 420 + dx, y: 500, vx: 0, vy: 0, facing: -1, hp: 1000, maxHp: 1000, meter: 100, guard: 120,
  state: opState, airborne: false, move: null, invulnerable: false, armored: false, combo: 0, ...(extra.op || {}),
};
const me = {
  id: 'f1', owner: 0, char: myChar, name: cat.characters[myChar].name, archetype: cat.characters[myChar].archetype,
  x: 420, y: 500, vx: 0, vy: 0, facing: 1, hp: 1000, maxHp: 1000, meter, guard: 120,
  state: 'stand', airborne: false, move: null, invulnerable: false, armored: false, combo: 0, ...(extra.me || {}),
};
const obs = {
  id: 'probe', seed: 1, now: 0, tick: 0, frame: extra.frame || 0, roundFrame: 0, status: 'playing',
  winner: null, reason: '', yourPlayer: 0, round: 1, roundLog: [],
  players: [{ id: 0, name: 'A', kind: 'api', team: myTeam, active: 0, eliminated: false, wins: 0, damageDealt: 0, hits: 0, blocks: 0, throws: 0, parries: 0, maxCombo: 0, score: 0 },
            { id: 1, name: 'B', kind: 'api', team: opTeam, active: 0, eliminated: false, wins: 0, damageDealt: 0, hits: 0, blocks: 0, throws: 0, parries: 0, maxCombo: 0, score: 0 }],
  fighters: [me, op], projectiles: [], events: [],
  stage: cat.rules.stage,
  rules: cat.rules,
  catalog: { rules: cat.rules, characters: cat.characters },
};
const p = spawn(PY, [path.join(WS, 'agent.py')], { cwd: WS, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
p.stdout.on('data', d => { buf += d.toString(); let i;
  while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1);
    const o = JSON.parse(l);
    console.log('note:', o.note);
    console.log(JSON.stringify(o.inputs.map(x => (x.dir || 'N') + (x.btn ? '+' + x.btn : '')))); } });
p.stdin.write(JSON.stringify(obs) + '\n');
setTimeout(() => p.kill(), 2000);
