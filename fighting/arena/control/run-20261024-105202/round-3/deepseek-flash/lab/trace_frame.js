// 逐物理帧回放录像输入。用法: node trace_frame.js <replay.gz> <from> <to>
const fs=require('fs'), zlib=require('zlib');
const sim=require('./simulation.patched.js');
const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const from=+process.argv[3], to=+process.argv[4];
const g=sim.createMatch({id:d.id+'-trace',players:d.names.map((n,i)=>({name:n,kind:'api',team:d.teams[i]})),seed:d.seed});
function brief(f){const m=f.move?`#${f.move.frame}${f.move.name}`:'';return `${f.char} ${f.state}${m} x${Math.round(f.x)} hp${Math.round(f.hp)} m${Math.round(f.meter)} g${Math.round(f.guard)}`}
for(let wi=0; wi<d.windows.length && g.status==='playing'; wi++){
  const win=d.windows[wi];
  const start=win.frame-14;
  if(win.frame<from-15 || start>to+15) { for(let i=0;i<15 && g.status==='playing';i++) sim.stepFrame(g,[win.inputs[0][i],win.inputs[1][i]]); continue; }
  for(let i=0;i<15 && g.status==='playing';i++){
    const a=win.inputs[0][i]||{}, b=win.inputs[1][i]||{};
    sim.stepFrame(g,[a,b]);
    const fr=g.frames, F=g.fighters;
    if(fr>=from && fr<=to){
      const evs=(g.events||[]).filter(e=>e.frame===fr).map(e=>e.type+(e.name?':'+e.name:'')+(e.damage?'('+e.damage+')':''));
      console.log(fr, `[0 ${a.dir}${a.btn?'/'+a.btn:''}] [1 ${b.dir}${b.btn?'/'+b.btn:''}]`, '|', brief(F[0]), '||', brief(F[1]), '| dx',Math.round(Math.abs(F[0].x-F[1].x)), evs.join(','));
    }
  }
}
console.log('END status',g.status,'winner',g.winner,'frames',g.frames);
