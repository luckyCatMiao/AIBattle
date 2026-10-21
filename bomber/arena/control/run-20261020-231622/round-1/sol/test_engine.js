const fs = require('fs');
const vm = require('vm');
const readline = require('readline');
const source = fs.readFileSync('/workspace/simulation.js', 'utf8');
// The public file retains names of removed practice bots in its export list.
// Supply inert placeholders only for those missing exports; rules stay unchanged.
const context = {require: x => require('/workspace/' + x.replace('./','')), module:{exports:{}}, console};
vm.runInNewContext('function bot(){} function dangerMap(){} function blastDanger(){} function escapeAfterBomb(){} function bestMove(){}\n'+source, context);
const sim = context.module.exports;
let game;
readline.createInterface({input:process.stdin}).on('line', line => {
  try {
    const req = JSON.parse(line);
    if (req.op === 'init') {
      game = sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}], seed:req.seed || 1});
      if(req.patch) {
        if(req.patch.empty) game.tiles = Uint8Array.from(game.tiles, v=>v===2?0:v);
        if(req.patch.fighters) req.patch.fighters.forEach((v,i)=>Object.assign(game.fighters[i],v));
        if(req.patch.bombs) game.bombs=req.patch.bombs;
      }
    } else if(req.op==='advance') {
      sim.advanceWindow(game,req.inputs);
    } else if(req.op==='frame') {
      const inputs=req.inputs || [{dir:'N',btn:null},{dir:'N',btn:null}];
      game.fighters.forEach((f,i)=>{f.inputHistory.push(inputs[i]); if(f.inputHistory.length>8)f.inputHistory.shift(); f.held=inputs[i];});
      sim.step(game);
    }
    const state = sim.snapshot(game,0);
    state.raw = game.fighters.map(f=>({moveProgress:f.moveProgress, movingTo:f.movingTo}));
    process.stdout.write(JSON.stringify(state)+'\n');
  } catch(e) { process.stdout.write(JSON.stringify({error:e.stack})+'\n'); }
});
