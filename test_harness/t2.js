const sim=require('./simulation.js');const {execSync}=require('child_process');
const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:1});
for(let w=0;w<12;w++){
 const out=execSync('python agent.py',{cwd:process.argv[2],input:JSON.stringify(sim.snapshot(g,0))+'\n'}).toString();
 const inp=JSON.parse(out).inputs; const f=g.fighters[0];
 console.log(g.roundFrames,f.x,f.y,inp.map(i=>i.dir+(i.btn?'*':'')).join(''),JSON.parse(out).note);
 sim.advanceWindow(g,[sim.submitWindow(g,0,inp),sim.submitWindow(g,1,[])]);
 console.log('  bombs',JSON.stringify(g.bombs),'ev',g.events.filter(e=>e.type=='bomb'||e.type=='explode').length);
}
