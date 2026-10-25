// 列出所有命中事件时双方状态与当帧输入，区分「防御方向错」「抢招被打」「硬直中被追打」。
const fs=require('fs'), zlib=require('zlib');
const sim=require('./simulation.patched.js');
const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])));
const us=d.seats.indexOf('deepseek-flash'), them=1-us;
const g=sim.createMatch({id:d.id+'-hits',players:d.names.map((n,i)=>({name:n,kind:'api',team:d.teams[i]})),seed:d.seed});
let lastInput=[null,null];
for(let wi=0; wi<d.windows.length && g.status==='playing'; wi++){
  const win=d.windows[wi];
  for(let i=0;i<15 && g.status==='playing';i++){
    const ins=[win.inputs[0][i],win.inputs[1][i]];
    const before=g.fighters.map(f=>({state:f.state,air:f.airborne,hp:f.hp,x:f.x,y:f.y,move:f.move&&f.move.name,guard:f.guard}));
    const evBefore=g.events.length;
    sim.stepFrame(g,ins);
    for(const e of g.events.slice(evBefore)){
      if(e.type!=='hit') continue;
      const victim=1-e.owner;
      const b=before[victim], atk=before[e.owner];
      const vi=ins[victim]||{dir:'?',btn:null};
      const ai=ins[e.owner]||{dir:'?',btn:null};
      console.log(`R${g.round} f${e.frame} HIT owner=${e.owner===us?'US':'SOL'} dmg${e.damage} combo${e.combo||1} | victim ${victim===us?'US':'SOL'} before=${b.state}${b.air?'/air':''}${b.move?'/'+b.move:''} vi=${vi.dir}${vi.btn?'/'+vi.btn:''} dx=${Math.round(Math.abs(before[0].x-before[1].x))} | atk before=${atk.state}${atk.move?'/'+atk.move:''} ai=${ai.dir}${ai.btn?'/'+ai.btn:''}`);
    }
  }
}
