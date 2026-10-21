const R=require('./rules.js');
for(const name of process.argv.slice(2)){
 const a=require('./'+name+'.js').decide,foes=['continuation_r1','incumbent'];let rows=[];
 for(const foe of foes)for(let seat=0;seat<2;seat++){
  const b=require('./'+foe+'.js').decide,g=R.createMatch({players:[{name:'a'},{name:'b'}]});g.status='playing';let errors=0;
  while(g.status==='playing'){const outs=[0,1].map(i=>(i===seat?a:b)(R.snapshot(g,i)));for(let i=0;i<2;i++)for(const c of outs[i].commands)try{R.command(g,i,c)}catch(e){errors++}for(let j=0;j<20;j++)R.step(g)}
  rows.push([foe,seat,g.winner===seat,Math.round(g.now),R.score(g,g.players[seat])-R.score(g,g.players[1-seat]),errors]);
 }console.log(name,JSON.stringify(rows));
}
