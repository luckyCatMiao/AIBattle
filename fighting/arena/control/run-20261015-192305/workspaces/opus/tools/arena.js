// 用真实 JS 引擎跑整场车轮战。用法: node arena.js <A> <B> teamA teamB
// A/B: "agent" (python3 ../agent.py) 或内置基线 turtle|rush|zoner|random
const S = require('./loadsim');
const { spawn } = require('child_process');
const readline = require('readline');
const ex = require('../example.json').exampleWindow;
const [,, A, B, ta, tb, seedArg] = process.argv;
let seed = +(seedArg||1); const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const W = (arr) => arr.map(([d,b]) => ({dir:d, btn:b||null}));
const rep = (x,n)=>Array(n).fill(x);
function baseline(kind, obs) {
  const me = obs.fighters[obs.yourPlayer], op = obs.fighters[1-obs.yourPlayer];
  const dist = Math.abs(me.x-op.x); const c = (obs.catalog.characters||obs.catalog)[me.char];
  const proj = Object.values(c.specials).find(s=>s.projectile && s.projectile.speed>0 && !s.airOnly);
  const k = kind==='random' ? ['turtle','rush','zoner'][Math.floor(rnd()*3)] : kind;
  if (k==='turtle') return W(rep(['DB',null],15));
  if (k==='zoner' && proj) {
    if (dist < 160) return W([['N','LK'],...rep(['DB',null],14)]);
    const m = {qcf:['D','DF','F'],qcb:['D','DB','B'],dp:['F','D','DF']}[proj.motion];
    return W([[m[0],null],[m[1],null],[m[2],proj.button],...rep(['DB',null],12)]);
  }
  // rush
  if (dist > 140) { if (rnd()<0.3) return W([['UF',null],...rep(['N',null],9),['N','HK'],...rep(['DB',null],4)]); return W(rep(['F',null],15)); }
  const r = rnd();
  if (r<0.3) return W([['N','LP'],...rep(['N',null],3),['N','LK'],['N',null],['N','LK'],['N',null],['N','HP'],['N',null],['N','HP'],...rep(['DB',null],4)]);
  if (r<0.5) return W([['N','LK'],...rep(['DB',null],14)]);
  if (r<0.7) return W([['N','HK'],...rep(['DB',null],14)]);
  return W(rep(['DB',null],15));
}
function mkAgent(cmd) {
  if (cmd !== 'agent' && !cmd.startsWith('agent:')) return { decide: async obs => baseline(cmd, obs), close(){} };
  const path = cmd==='agent' ? '../agent.py' : cmd.slice(6);
  const p = spawn('python3', [path], { stdio: ['pipe','pipe', process.env.DBG ? 'inherit':'ignore'] });
  const rl = readline.createInterface({ input: p.stdout }); const q = [];
  rl.on('line', l => q.shift()(l));
  return { decide: obs => new Promise(res => { const t=Date.now(); q.push(l => { const dt=Date.now()-t; if (dt>5000) console.log('TIMEOUT',dt); maxT=Math.max(maxT,dt); res(JSON.parse(l).inputs); }); p.stdin.write(JSON.stringify(obs)+'\n'); }), close(){ p.kill(); } };
}
let maxT = 0;
(async () => {
  const g = S.createMatch({ players: [{name:'A',kind:'api',team:ta.split(',')},{name:'B',kind:'api',team:tb.split(',')}] });
  const ag = [mkAgent(A), mkAgent(B)];
  while (g.status === 'playing') {
    const ins = await Promise.all([0,1].map(o => ag[o].decide({ ...S.snapshot(g, o), catalog: { rules: S.rules, characters: S.characters }, lastErrors: [], decisionWindows: true, framesPerWindow: 15, exampleWindow: ex })));
    const norm = ins.map((x,o)=>S.submitWindow(g,o,x));
    S.advanceWindow(g, norm);
  }
  ag.forEach(a=>a.close());
  console.log(JSON.stringify({A,B,ta,tb,winner:g.winner,reason:g.reason,maxT,log:g.roundLog.map(r=>`${r.winnerChar}>${r.loserChar} ${r.winnerHp}/${r.loserHp} ${r.reason} ${r.frames}`)}));
})();
