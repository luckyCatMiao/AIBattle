'use strict';
/* Record full match replay: per-window observations + both inputs.
 * usage: node dev/rec.js --seed 9000 --a "python agent.py" --b "python dev/frozen/v1.py" --out /tmp/m1.json
 * Saves {seed, a, b, seats, frames:[snapshot0...], windows:[{frame,inputs:[[...],[...]]}], final}
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const engine = require('./engine.js');
function parseArgs(argv){const a={};for(let i=2;i<argv.length;i++){const k=argv[i],n=argv[i+1];if(n===undefined||n.startsWith('--'))a[k.slice(2)]=true;else{a[k.slice(2)]=n;i++;}}return a;}
const args=parseArgs(process.argv);
const win20=[];for(let i=0;i<20;i++)win20.push({dir:'N',btn:null});
class Agent{
  constructor(cmd){const p=cmd.split(' ');this.proc=spawn(p[0],p.slice(1),{cwd:path.resolve(__dirname,'..'),stdio:['pipe','pipe','pipe']});this.buf='';this.lines=[];this.waiters=[];this.err='';this.dead=false;
    this.proc.stdout.on('data',d=>{this.buf+=d.toString();let i;while((i=this.buf.indexOf('\n'))>=0){const line=this.buf.slice(0,i).trim();this.buf=this.buf.slice(i+1);if(line)this.push(line);}});
    this.proc.stderr.on('data',d=>{this.err+=d.toString();if(this.err.length>2000)this.err=this.err.slice(-2000);});
    this.proc.on('error',()=>{this.dead=true;this.push(null);});this.proc.on('exit',()=>{this.dead=true;this.push(null);});}
  push(l){const w=this.waiters.shift();if(w)w(l);else this.lines.push(l);}
  next(ms=5000){if(this.lines.length)return Promise.resolve(this.lines.shift());if(this.dead)return Promise.resolve(null);return new Promise(res=>{const t=setTimeout(()=>res(null),ms);this.waiters.push(l=>{clearTimeout(t);res(l);});});}
  send(o){this.proc.stdin.write(JSON.stringify(o)+'\n');}
  kill(){try{this.proc.kill();}catch(e){}}
}
function validate(parsed){if(!parsed||typeof parsed!=='object')return 'no';if(!Array.isArray(parsed.inputs))return 'no';if(parsed.inputs.length>20)return 'many';for(const f of parsed.inputs){if(!f||typeof f!=='object'||Array.isArray(f))return 'bad';const d=f.dir==null?'N':String(f.dir).toUpperCase();const b=f.btn==null?null:String(f.btn).toUpperCase();if(!['N','U','D','L','R'].includes(d))return 'dir';if(b!==null&&b!=='BOMB')return 'btn';}return null;}
(async()=>{
  const seed=parseInt(args.seed||'1',10);
  const g=engine.createMatch({id:'m',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
  const agents=[new Agent(args.a),new Agent(args.b)];
  const lastErrors=[[],[]];
  const frames=[],windows=[];
  let w=0;const maxW=parseInt(args.max||'900',10);
  while(g.status==='playing'&&w<maxW){
    w++;
    const obs=[0,1].map(o=>{const s=engine.snapshot(g,o);s.lastErrors=lastErrors[o];s.decisionWindows=true;s.framesPerWindow=20;s.exampleWindow=win20;return s;});
    frames.push(obs[0]);
    agents.forEach((a,i)=>a.send(obs[i]));
    const rep=await Promise.all(agents.map(a=>a.next()));
    const win={frame:frames.length-1,inputs:[[],[]],notes:['','']};
    const winIn=[null,null];
    for(let i=0;i<2;i++){
      if(rep[i]===null){winIn[i]=win20;continue;}
      let p;try{p=JSON.parse(rep[i]);}catch(e){winIn[i]=win20;continue;}
      if(validate(p)){winIn[i]=win20;continue;}
      winIn[i]=p.inputs.slice(0,20);
      while(winIn[i].length<20)winIn[i].push({dir:'N',btn:null});
      win.notes[i]=p.note||'';
      win.inputs[i]=winIn[i];
    }
    windows.push(win);
    const norm=[0,1].map((i)=>engine.submitWindow(g,i,winIn[i]));
    engine.advanceWindow(g,norm);
  }
  agents.forEach(a=>a.kill());
  const final=engine.snapshot(g,0);
  fs.writeFileSync(args.out||'/tmp/rec.json',JSON.stringify({seed,a:args.a,b:args.b,frames,windows,final,status:g.status,winner:g.winner,roundLog:g.roundLog}));
  console.log(JSON.stringify({seed,status:g.status,winner:g.winner,rounds:g.roundLog.length,deaths:g.roundLog.map(r=>({r:r.round,fr:r.frames,w:r.winner,c:r.cause}))}));
})();
