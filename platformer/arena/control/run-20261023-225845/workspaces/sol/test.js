'use strict';
const sim = require('./simulation');
const {spawn} = require('child_process');
const readline = require('readline');
const fs = require('fs');
const proc = spawn('python', ['-u', 'agent.py'], {stdio:['pipe','pipe','inherit']});
let resolveLine;
readline.createInterface({input:proc.stdout}).on('line', line => { if(resolveLine) {const r=resolveLine;resolveLine=null;r(JSON.parse(line));} });
function ask(obs) { return new Promise(resolve => {resolveLine=resolve;proc.stdin.write(JSON.stringify(obs)+'\n');}); }
function baseline(g, team, mode) {
  const p=g.runners[team], other=g.runners[1-team];
  let jump=mode==='bunny';
  if(mode!=='bunny') {
    const ahead=p.x+Math.max(.8,p.vx*.19);
    jump=sim.solidBox(g,ahead-.36,p.y,ahead+.36,p.y+1.35) ||
      !sim.solidWorld(g,p.x+Math.max(.4,p.vx*.12),p.y-.1) ||
      g.monsters.some(m=>Math.abs(m.x-p.x)<2.4 && m.x>p.x-.5);
  }
  let move=1;
  if(mode==='block' && other.x<p.x && p.x-other.x<1.5) move=0;
  if(mode==='surge') {move=(Math.floor(g.frame/7)%3===0)?0:1;jump=jump||g.frame%17<5;}
  if(mode==='chase') jump=jump || (other.x>p.x && other.x-p.x<1 && other.y>p.y+.3);
  return [{move,jump}];
}
async function run(seed, team, mode, scenario) {
  const g=sim.createMatch({seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  if(scenario) {
    g.phase='race';
    // Synthetic flat track with a three-tile gap and a raised landing.
    g.tiles.fill(0);
    for(let x=0;x<g.w;x++) for(let row=13;row<16;row++) if(x<16||x>=19) g.tiles[row*g.w+x]=1;
    for(const p of g.runners) {p.x=team===p.team?12.0:12.8;p.y=3.0001;p.vx=6.8;}
    if(scenario==='rear') {g.runners[team].x=12.8;g.runners[1-team].x=12.1;}
    if(scenario==='monster') {g.monsters=[{id:'test',x:21,y:3,dir:-1,alive:true}];g.runners[1-team].x=2.5;}
    if(scenario==='ceiling') {for(let x=13;x<17;x++)g.tiles[9*g.w+x]=2;}
  }
  const startRound=g.round;let decisions=0,totalMs=0,maxMs=0;
  const trace=[];
  let lastRunners=sim.view(g,team).runners;
  let recordedDeaths=0;
  while(g.status==='playing' && g.round===startRound && decisions<380) {
    const before=g.runners[team].deaths;
    let t=performance.now();const a=await ask(sim.view(g,team));t=performance.now()-t;totalMs+=t;maxMs=Math.max(t,maxMs);
    const windows=[];windows[team]=sim.submitWindow(g,team,a.inputs);
    // The opponent really reacts every physics frame, a stronger baseline than
    // a frozen five-frame heuristic window.
    for(let i=0;i<5 && g.status==='playing' && g.round===startRound;i++) {
      g.runners[team].held=windows[team][i][0];
      g.runners[1-team].held=baseline(g,1-team,mode)[0];
      sim.step(g);
      if(g.round===startRound) {
        lastRunners=sim.view(g,team).runners;
        if(g.runners[team].deaths>recordedDeaths) {
          recordedDeaths=g.runners[team].deaths;
          trace.push({frame:g.frame,p:lastRunners,events:g.events.slice(-3)});
        }
      }
    }
    decisions++;
  }
  const round=g.events.find(e=>e.type==='round');
  const out={seed,team,mode,scenario:scenario||'random',winner:round?.team,reason:round?.reason,decisions,meanMs:Math.round(totalMs/decisions),maxMs:Math.round(maxMs),deaths:recordedDeaths,final:lastRunners.map(p=>({x:p.x,maxX:p.maxX,deaths:p.deaths})),trace};
  console.log(JSON.stringify({...out,trace:undefined}));return out;
}
(async()=>{
 const results=[];
 const count=Number(process.argv[2]||6);
 for(let i=0;i<count;i++) results.push(await run(101+i, i%2, ['bunny','chase','block'][i%3]));
 for(const scenario of ['rear','front','monster','ceiling']) results.push(await run(901,0,'chase',scenario));
 for(const scenario of ['rear','front']) for(const mode of ['bunny','block','surge']) results.push(await run(1901,0,mode,scenario));
 fs.writeFileSync('test_results.json',JSON.stringify(results,null,2));proc.stdin.end();
})().catch(e=>{console.error(e);proc.kill();process.exitCode=1;});
