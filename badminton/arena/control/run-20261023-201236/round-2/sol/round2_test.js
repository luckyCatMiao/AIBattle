'use strict';
const fs = require('fs');
const Module = require('module');
const path = require('path');
const readline = require('readline');
const {spawn} = require('child_process');
// The supplied source exports two removed practice helpers. Remove only those
// dangling export references in memory; never edit the supplied rules file.
const engine = new Module(path.join(__dirname, 'simulation-test.js'), module);
engine.filename = path.join(__dirname, 'simulation-test.js');
engine.paths = module.paths;
engine._compile(fs.readFileSync(path.join(__dirname, 'simulation.js'), 'utf8').replace('canSwingNow, predictContact,', ''), engine.filename);
const sim = engine.exports;
function program(style) {
  const child = spawn('python', ['test_bridge.py', style], {cwd: __dirname, stdio:['pipe','pipe','inherit']});
  const queue = [];
  readline.createInterface({input:child.stdout}).on('line', line => {
    const q = queue.shift();
    if (!q) throw Error('unexpected output');
    q(JSON.parse(line));
  });
  return {child, call(obs) {return new Promise(resolve => {queue.push(resolve); child.stdin.write(JSON.stringify(obs)+'\n');});}};
}
function simple(obs, aggressive) {
  const p = obs.batsmen[obs.yourPlayer], s = obs.shuttle, dir = p.facing;
  let target = obs.yourPlayer === 0 ? 3.7 : 9.7;
  if (s.lastTeam !== obs.yourPlayer) {
    let {x,y,vx,vy} = s;
    for(let t=0; t<60; t++) {
      const drag = .025*Math.hypot(vx,vy);
      vx *= 1-drag*.025; vy=vy*(1-drag*.025)-9.8*.025;
      x+=vx*.025; y+=vy*.025;
      if(vy<0 && y<1.8) break;
    }
    target = x-dir*.38;
  }
  const move = Math.max(-1,Math.min(1,(target-p.x)*3));
  const near = s.lastTeam!==obs.yourPlayer && Math.abs(s.x-p.x)<1.8;
  const swing = near ? (s.y<1.15 ? -1 : 1) : 0;
  return {inputs:Array.from({length:10},(_,i)=>[{move,swing,jump:aggressive && near && s.y>2.1,sprint:aggressive && Math.abs(target-p.x)>1.2}])};
}
async function match(style, seat, seed=1) {
  const a = program(process.env.PRIMARY || 'main');
  const b = style === 'simple' || style === 'aggressive' ? null : program(style);
  const g = sim.createMatch({id:'local-'+style+'-'+seat,seed,players:[{name:seat===0?'main':style,kind:'api'},{name:seat===1?'main':style,kind:'api'}]});
  const metrics = {style,seat,score:null,frames:0,windows:0,maxMs:0,hits:[],smashes:[],minStamina:[100,100],reasons:{},hitKinds:{},misses:0};
  let lastEvent = 0;
  while(g.status==='playing') {
    const obsA=sim.view(g,seat), obsB=sim.view(g,1-seat);
    const start=performance.now();
    const [wa,wb] = await Promise.all([a.call(obsA), b ? b.call(obsB):Promise.resolve(simple(obsB,style==='aggressive'))]);
    metrics.maxMs=Math.max(metrics.maxMs,performance.now()-start);
    const windows=[];
    windows[seat]=sim.submitWindow(g,seat,wa.inputs);
    windows[1-seat]=sim.submitWindow(g,1-seat,wb.inputs);
    sim.advanceWindow(g,windows);
    metrics.windows++;
    g.batsmen.forEach((p,i)=>metrics.minStamina[i]=Math.min(metrics.minStamina[i],p.stamina));
    for(const e of g.events) if(e.id>lastEvent) {
      if(e.type==='point') metrics.reasons[e.reason]=(metrics.reasons[e.reason]||0)+1;
      if(e.type==='hit') metrics.hitKinds[e.team+'-'+e.kind]=(metrics.hitKinds[e.team+'-'+e.kind]||0)+1;
    }
    lastEvent=g.eventId;
  }
  metrics.score=g.score;metrics.frames=g.frame;metrics.winner=g.winner;
  metrics.hits=g.batsmen.map(p=>p.hits);metrics.smashes=g.batsmen.map(p=>p.smashes);metrics.longestRally=g.longestRally;
  a.child.kill(); if(b)b.child.kill();
  console.log(JSON.stringify(metrics));
  return metrics;
}
(async()=>{
  const modes=process.argv.slice(2);
  const all=[];
  for(const style of modes.length?modes:['simple','aggressive','lift','main'])
    for(const seat of [0,1]) all.push(await match(style,seat));
  fs.writeFileSync(path.join(__dirname,process.env.RESULT || 'sweep_results.json'),JSON.stringify(all,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
