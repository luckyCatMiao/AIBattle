const sim = require('./simulation.patched.js');
const cat = require('./catalog.patched.js');
const N = {dir:'N',btn:null};
const ALL=['aegis','vex','kestrel','torv','nyx','sable'];
function mk(a,b){ return sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:a},{name:'B',kind:'api',team:b}], seed:1}); }
function W(a){const w=[];for(let i=0;i<15;i++)w.push(a[i]||N);return w;}
function run(g,wA,wB,n){for(let i=0;i<n&&g.status==='playing';i++) sim.advanceWindow(g,[wA,wB]); return g;}
function teamOf(c){ return [c, ...ALL.filter(x=>x!==c).slice(0,2)]; }
function oppOf(c){ return ALL.filter(x=>x!==c).slice(0,3); }

for(const me of ALL){
  for(const dist of [60,90,130]){
    const g = mk(teamOf(me), oppOf(me));
    const c = cat.characters[me];
    g.fighters[0].meter = 100;
    g.fighters[1].x = 420+dist;
    const seq = cat.parseMotion(c.super.motion);
    let wA=[]; let i=0;
    for(let k=0;k<seq.length;k++){ wA[i++]={dir:seq[k], btn:(k===seq.length-1? c.super.button:null)}; }
    while(i<15) wA[i++]=N;
    const wB=[]; for(let k=0;k<15;k++) wB[k]=N;
    run(g,wA,wB,1);
    for(let k=0;k<6;k++){ if(g.status!=='playing')break; run(g,W([]),W([]),1); }
    console.log(me.padEnd(8), 'dist',String(dist).padStart(3), 'dmg', String(1000-g.fighters[1].hp).padStart(4), 'status', g.status, 'hits', g.fighters[1].hitTaken);
  }
}
