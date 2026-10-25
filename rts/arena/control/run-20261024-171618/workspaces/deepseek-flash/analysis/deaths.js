const R=require('../rules.js');
const BOT=process.argv[2]||'bot3';
const {makeBot3}=require('./'+BOT+'.js');
const {makeSol}=require('./solbot.js');
const cfg=JSON.parse(process.argv[3]||'{}');
const swap=+(process.argv[4]||0);
const cfgsol=JSON.parse(process.argv[5]||'{}');
const b=makeBot3(cfg), s=makeSol(cfgsol);
const P=swap?[s,b]:[b,s];
const bs=swap?1:0, ss=swap?0:1;
const m=R.createMatch({id:'sim',players:[{name:'a'},{name:'b'}],seed:1});
R.command(m,0,{type:'start'});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let prev=new Map();
const deaths=[];
while(m.status==='playing'&&m.now<600){
  const snaps=[R.snapshot(m,0),R.snapshot(m,1)];
  const cmds=[P[0](snaps[0])||[],P[1](snaps[1])||[]];
  for(let p=0;p<2;p++)for(const c of cmds[p]){try{R.command(m,p,c)}catch(e){}}
  // record unit positions/orders for later reference
  const snap={t:m.now,units:m.units.map(u=>({id:u.id,o:u.owner,ty:u.type,x:u.x,y:u.y,hp:u.hp,ord:JSON.stringify(u.order)})),cmds};
  for(const u of m.units) prev.set(u.id,{...snap,hp:u.hp});
  for(let k=0;k<20;k++)R.step(m);
  // detect deaths
  const alive=new Set(m.units.map(u=>u.id));
  for(const [id,info] of prev){
    if(!alive.has(id)){
      const before=info.units?info.units:null;
      const unitsAt=info.units||[];
      const owner=info.units.find(x=>x.id===id)?.o;
      if(owner===bs){
        const mine=unitsAt.filter(x=>x.o===bs&&x.id!==id);
        const foes=unitsAt.filter(x=>x.o===ss);
        deaths.push({t:+m.now.toFixed(1),id,ty:info.units.find(x=>x.id===id)?.ty,
          mineNear:mine.filter(x=>Math.hypot(x.x-(unitsAt.find(y=>y.id===id)?.x||0),x.y-(unitsAt.find(y=>y.id===id)?.y||0))<400).length,
          foesNear:foes.filter(x=>Math.hypot(x.x-(unitsAt.find(y=>y.id===id)?.x||0),x.y-(unitsAt.find(y=>y.id===id)?.y||0))<400).length,
          foesTotal:foes.length, mineTotal:mine.length});
      }
      prev.delete(id);
    }
  }
}
const sc=m.players.map(p=>R.score(m,p));
console.log('RESULT winner',m.winner,'t',m.now.toFixed(1),'scores',sc,'level',m.players.map(p=>p.level));
const mineDeaths=deaths.filter(d=>d.ty!=='worker');
const grp={};
for(const d of mineDeaths){const k='foesNear'+d.foesNear+'_mineNear'+d.mineNear;grp[k]=(grp[k]||0)+1;}
console.log('my combat deaths:',mineDeaths.length,JSON.stringify(grp));
console.log(mineDeaths.map(d=>`t${d.t} ${d.ty} mine${d.mineNear}/${d.mineTotal} foes${d.foesNear}/${d.foesTotal}`).join('\n'));
