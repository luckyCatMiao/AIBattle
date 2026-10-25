'use strict';
const sim=require('./simulation'),{spawn}=require('child_process'),rl=require('readline'),fs=require('fs');
function worker(file){const p=spawn('python3',['-u',file,'fast']);let pending;rl.createInterface({input:p.stdout}).on('line',s=>{pending(JSON.parse(s))});p.stderr.on('data',s=>process.stderr.write(s));return {p,ask:o=>new Promise(r=>{pending=r;p.stdin.write(JSON.stringify(o)+'\n')})}}
async function main(){const file=process.argv[2]||'agent.py',a=worker(file),b=worker('rival.py');let results=[];
for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++)for(let mode=0;mode<4;mode++){
 let g=sim.createMatch({teamSize:n,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 g.frame=200;g.tick=200;g.events=[];
 const s=seat===0?1:-1,mirror=x=>seat===0?x:44-x;
 for(const u of g.units){const ours=u.team===seat;u.x=mirror((ours?13:29)+(u.index%2)*2);u.y=3+(u.index+.5)*20/n;}
 let f=g.units.find(u=>u.team===seat),e=g.units.find(u=>u.team!==seat);f.x=mirror(19);f.y=12;e.x=mirror(25);e.y=14;
 g.ball.x=22;g.ball.y=13;
 if(mode===0){g.ball.vx=-s*11;g.ball.vy=2;}
 if(mode===1){g.ball.owner=e.id;g.ball.x=e.x-s*.62;g.ball.y=e.y;}
 if(mode===2){g.ball.owner=f.id;g.ball.x=f.x+s*.62;g.ball.y=f.y;}
 if(mode===3){f.x=mirror(6);f.y=12;e.x=mirror(12);e.y=14;g.ball.x=mirror(9);g.ball.y=13;g.ball.vx=-s*10;g.ball.vy=-.8;}
 while(g.frame<600 && g.score[0]+g.score[1]===0){
 const [aa,bb]=await Promise.all([a.ask(sim.view(g,seat)),b.ask(sim.view(g,1-seat))]);
 const wa=sim.submitWindow(g,seat,aa.inputs),wb=sim.submitWindow(g,1-seat,bb.inputs);sim.advanceWindow(g,seat===0?[wa,wb]:[wb,wa]);}
 results.push({n,seat,mode,score:g.score,frame:g.frame});
}
a.p.stdin.end();b.p.stdin.end();let counts={for:0,against:0,none:0};for(let r of results){if(r.score[r.seat])counts.for++;else if(r.score[1-r.seat])counts.against++;else counts.none++;}console.log(JSON.stringify({file,counts,results}));fs.writeFileSync(`/workspace/r2_scenarios_${file.replace('.py','')}.json`,JSON.stringify({file,counts,results},null,2));}
main().catch(e=>{console.error(e);process.exit(1)});
