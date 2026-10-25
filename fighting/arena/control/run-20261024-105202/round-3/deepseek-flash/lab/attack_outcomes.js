// 统计我方每次出招的起手上下文与结果（命中/被防/落空/被打断）。
const fs=require('fs'), zlib=require('zlib');
const sim=require('./simulation.patched.js');
for(const file of process.argv.slice(2)){
  const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const us=d.seats.indexOf('deepseek-flash');
  const g=sim.createMatch({id:d.id+'-atk',players:d.names.map((n,i)=>({name:n,kind:'api',team:d.teams[i]})),seed:d.seed});
  const starts=[]; let prevState=g.fighters[us].state;
  for(let wi=0; wi<d.windows.length && g.status==='playing'; wi++){
    const win=d.windows[wi];
    for(let i=0;i<15 && g.status==='playing';i++){
      const ins=[win.inputs[0][i],win.inputs[1][i]];
      const f=g.fighters[us], o=g.fighters[1-us];
      const before={state:f.state, move:f.move&&f.move.name, opp:o.state, oppMove:o.move&&o.move.name, dx:Math.abs(f.x-o.x), hp:o.hp, myhp:f.hp, meter:f.meter, frame:g.frames+1};
      const evBefore=g.events.length;
      sim.stepFrame(g,ins);
      const f2=g.fighters[us];
      if(before.state!=='attack' && f2.state==='attack' && f2.move){
        starts.push({...before, name:f2.move.name, kind:f2.move.kind, input:ins[us], id:starts.length, hit:false, blocked:false, interrupted:false, dmg:0});
      }
      for(const e of g.events.slice(evBefore)){
        const cur=starts[starts.length-1];
        if(!cur) continue;
        if(e.type==='hit' && e.owner===us && g.frames-cur.frame<80){cur.hit=true;cur.dmg+=e.damage;}
        else if(e.type==='block' && e.owner!==us && g.frames-cur.frame<80) cur.blocked=true;
        else if(e.type==='hit' && e.owner!==us && g.frames-cur.frame<80) cur.interrupted=true;
      }
    }
  }
  console.log('='*70); console.log(file,'us seat',us,'attacks',starts.length);
  const groups={};
  for(const s of starts){
    const ctx=s.opp==='attack'?(s.oppMove||'?')+'/attack':s.opp;
    const k=`${s.name} (${s.kind}) <- opp ${ctx} dx${Math.round(s.dx)}`;
    groups[k]=groups[k]||{n:0,hit:0,blocked:0,int:0,dmg:0};
    const gg=groups[k];gg.n++;gg.hit+=s.hit?1:0;gg.blocked+=s.blocked?1:0;gg.int+=s.interrupted?1:0;gg.dmg+=s.dmg;
  }
  const rows=Object.entries(groups).sort((a,b)=>b[1].n-a[1].n);
  for(const [k,v] of rows) if(v.n>=1) console.log(`  ${k}: n${v.n} hit${v.hit} blk${v.blocked} int${v.int} dmg${v.dmg}`);
  // 汇总
  const tot=starts.reduce((a,s)=>({n:a.n+1,hit:a.hit+(s.hit?1:0),int:a.int+(s.interrupted?1:0),dmg:a.dmg+s.dmg}),{n:0,hit:0,int:0,dmg:0});
  console.log('  TOTAL',tot);
}
