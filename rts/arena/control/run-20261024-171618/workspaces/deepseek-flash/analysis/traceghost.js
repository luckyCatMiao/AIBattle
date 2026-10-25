const fs=require('fs');
const R=require('../rules.js');
const {buildGhost}=require('./ghost.js');
const {makeAgent}=require('./agent3.js');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const id=process.argv[2]||'r2-g1';
const rep=a.find(x=>x.id===id);
const solSeat=rep.seats.indexOf('sol'), agentSeat=1-solSeat;
const m=R.createMatch({id:'ghost',players:[{name:'a'},{name:'b'}],seed:1});
R.command(m,0,{type:'start'});
const ghost=buildGhost(rep,solSeat);
const pol=makeAgent({});
const step=+(process.argv[3]||5);
while(m.status==='playing'&&m.now<600){
  const mine=pol(R.snapshot(m,agentSeat))||[];
  const g=ghost({...R.snapshot(m,solSeat),tick:m.tick,units:m.units,bases:m.bases,mines:m.mines})||[];
  const cmds=agentSeat===0?[mine,g]:[g,mine];
  const tt=Math.round(m.now);
  if(Math.abs(m.now-tt)<0.06&&tt%step===0){
    const c=(p,ty)=>m.units.filter(u=>u.owner===p&&u.type===ty&&u.hp>0).length;
    const hp=p=>Math.round(m.units.filter(u=>u.owner===p).reduce((s,u)=>s+u.hp,0));
    console.log(String(tt).padStart(3),'A',`${c(agentSeat,'worker')}w${c(agentSeat,'rifle')}r${c(agentSeat,'tank')}t hp${hp(agentSeat)} c${Math.round(m.players[agentSeat].credits)}`,'B',`${c(solSeat,'worker')}w${c(solSeat,'rifle')}r${c(solSeat,'tank')}t hp${hp(solSeat)} c${Math.round(m.players[solSeat].credits)}`,'base',Math.round(m.bases[agentSeat].hp)+'/'+Math.round(m.bases[solSeat].hp),'nodes',m.nodes.map(n=>n.owner===null?'.':(n.owner===agentSeat?'A':'B')).join(''));
  }
  for(const c of cmds[0].slice(0,10))try{R.command(m,0,c);}catch(e){}
  for(const c of cmds[1].slice(0,10))try{R.command(m,1,c);}catch(e){}
  for(let k=0;k<20;k++)R.step(m);
}
console.log('winner',m.winner,'t',m.now.toFixed(1),'scores',m.players.map(p=>R.score(m,p)).join(':'));
