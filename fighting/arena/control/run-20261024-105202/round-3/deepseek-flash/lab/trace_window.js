// 逐帧回放真实录像输入，打印指定帧区间的状态/事件/双方输入。
// 用法: node trace_window.js <replay.json.gz> <from> <to>
const fs=require('fs'), zlib=require('zlib');
const sim=require('./simulation.patched.js');
const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const from=+process.argv[3], to=+process.argv[4];
const g=sim.createMatch({id:d.id+'-trace',players:d.names.map((n,i)=>({name:n,kind:'api',team:d.teams[i]})),seed:d.seed});
let wi=0; const total=d.windows.length;
function brief(f){const m=f.move?`#${f.move.frame}${f.move.name}`:'';return `${f.char} ${f.state}${m} x${Math.round(f.x)} hp${Math.round(f.hp)} m${Math.round(f.meter)} g${Math.round(f.guard)}`}
while(g.status==='playing' && wi<total){
  const win=d.windows[wi];
  if(win.frame>=from-15 && win.frame<=to+15){
    console.log(`--- window ${wi} frame ${win.frame}`);
    for(let i=0;i<15;i++){
      const a=win.inputs[0][i]||{}, b=win.inputs[1][i]||{};
      const fr=win.frame-15+i+1;
      if(fr>=from && fr<=to){
        const F=g.fighters;
        console.log(fr, `[0 ${a.dir}${a.btn?'/'+a.btn:''}] [1 ${b.dir}${b.btn?'/'+b.btn:''}]`, '|', brief(F[0]), '||', brief(F[1]), '| dx',Math.round(Math.abs(F[0].x-F[1].x)));
      }
    }
  }
  sim.advanceWindow(g, win.inputs);
  wi++;
}
console.log('END status',g.status,'winner',g.winner,'frames',g.frames);
