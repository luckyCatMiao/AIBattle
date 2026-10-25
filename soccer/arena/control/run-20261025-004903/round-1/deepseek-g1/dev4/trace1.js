// 单局跟踪：node dev4/trace1.js <me.py> <opp.py|idle> <size> <seed> [swap]
const path=require('path');
const sim=require('../simulation.js');
const {PyAgent}=require('../dev/arena.js');
const PY=process.env.PYEXE||'python';
const ROOT=path.resolve(__dirname,'..');
const me=process.argv[2], oppSpec=process.argv[3];
const size=Number(process.argv[4]||3), seed=Number(process.argv[5]||1);
const swap=(process.argv[6]||'0')==='1';
function mk(spec,tag){
  if(spec==='idle') return async v=>Array.from({length:20},()=>Array.from({length:v.teamSize},()=>({dir:'N',aim:null,kick:false})));
  const ag=new PyAgent(PY,spec,ROOT,tag);
  return async v=>JSON.parse(await ag.ask(v)).inputs;
}
(async()=>{
  const A=mk(me,'me'), B=mk(oppSpec,'opp');
  const players=[{name:'Me',kind:'api'},{name:'Opp',kind:'api'}];
  const g=sim.createMatch({id:'t',players,seed,teamSize:size});
  const fns=swap?[B,A]:[A,B];
  let last=0;
  const STEP=Number(process.env.STEP||20);
  while(g.status==='playing'){
    const views=[sim.view(g,0),sim.view(g,1)];
    if(process.env.DUMP){require('fs').appendFileSync(process.env.DUMP, JSON.stringify(views[0])+String.fromCharCode(10));}
    const w=await Promise.all([fns[0](views[0]),fns[1](views[1])]);
    sim.advanceWindow(g,[sim.submitWindow(g,0,w[0]),sim.submitWindow(g,1,w[1])]);
    if(process.env.VERBOSE && g.frame%STEP===0){
      const b=g.ball;
      console.log((g.frame/20).toFixed(1)+'s ball('+b.x.toFixed(1)+','+b.y.toFixed(1)+') v('+b.vx.toFixed(1)+','+b.vy.toFixed(1)+') own='+b.owner+' score='+g.score.join(':')+' | '+g.units.map(u=>'t'+u.team+'#'+u.index+'('+u.x.toFixed(1)+','+u.y.toFixed(1)+(g.ball.owner===u.id?'B':'')+')').join(' '));
    }
  }
  console.log('FINAL',g.score,'winner',g.winner,'reason',g.reason,'frames',g.frame);
})();
