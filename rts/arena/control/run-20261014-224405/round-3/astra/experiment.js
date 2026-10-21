const R=require('./rules.js'),fs=require('fs');
const a=require('./agent.js').decide,b=require(process.argv[2]||'./agent_r1.js').decide;
for(let seat=0;seat<2;seat++){const g=R.createMatch({players:[{name:'a'},{name:'b'}]});g.status='playing';let errors=0;while(g.status==='playing'){const out=[0,1].map(i=>(i===seat?a:b)(structuredClone(R.snapshot(g,i))));for(let i=0;i<2;i++)for(const c of out[i].commands)try{R.command(g,i,c)}catch(e){errors++}for(let t=0;t<20;t++)R.step(g)}console.log(seat,g.winner,Math.round(g.now),g.players.map(p=>R.score(g,p)),errors)}
