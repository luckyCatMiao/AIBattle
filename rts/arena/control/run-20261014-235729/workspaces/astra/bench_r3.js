const R=require('./rules.js'),fs=require('fs');
let source=fs.readFileSync('test.js','utf8');const opp=Function('R',source.slice(source.indexOf('function opp('),source.indexOf('for(let variant=0;variant<3'))+'; return opp;')(R);
const foes=[require('./agent_r2.js').decide,require('./agent_r1.js').decide,s=>opp(s,2),s=>opp(s,0)];
for(const name of process.argv.slice(2)){
const a=require('./r3_'+name+'.js').decide;let rows=[];
for(let j=0;j<foes.length;j++)for(let seat=0;seat<2;seat++){const g=R.createMatch({players:[{name:'a'},{name:'b'}]});g.status='playing';let errors=0;while(g.status==='playing'){const out=[0,1].map(i=>(i===seat?a:foes[j])(R.snapshot(g,i)));for(let i=0;i<2;i++)for(const c of out[i].commands)try{R.command(g,i,c)}catch(e){errors++}for(let t=0;t<20;t++)R.step(g)}rows.push([j,seat,g.winner===seat,Math.round(g.now),R.score(g,g.players[seat])-R.score(g,g.players[1-seat]),errors]);}console.log(name,JSON.stringify(rows));}
