const sim = require('./simulation.patched.js');
const N = {dir:'N',btn:null};
function mk(a,b){ return sim.createMatch({id:'t', players:[{name:'A',kind:'api',team:a},{name:'B',kind:'api',team:b}], seed:1}); }
function W(a){const w=[];for(let i=0;i<15;i++)w.push(a[i]||N);return w;}
function run(g,wA,wB,n){for(let i=0;i<n&&g.status==='playing';i++) sim.advanceWindow(g,[wA,wB]); return g;}

let g = mk(['aegis','vex','kestrel'],['torv','nyx','sable']);
g.fighters[0].meter = 100;
g.fighters[1].x = 500;
let wA=[],wB=[];
wA[0]={dir:'D',btn:null}; wA[1]={dir:'DF',btn:null}; wA[2]={dir:'F',btn:'HP'};
for(let i=3;i<15;i++) wA[i]=N;
for(let i=0;i<15;i++) wB[i]=N;
run(g,wA,wB,1);
console.log('after win1: torv hp',g.fighters[1].hp,'state',g.fighters[1].state,'combo',g.fighters[1].hitTaken,'meterA',g.fighters[0].meter,'status',g.status);
for(let k=0;k<10;k++){ if(g.status!=='playing')break; run(g,W([]),W([]),1); }
console.log('later: torv hp',g.fighters[1].hp,'status',g.status,'round',g.round);
console.log(JSON.stringify(g.roundLog));
console.log('events:', g.events.filter(e=>e.type==='hit'||e.type==='ko'||e.type==='super').map(e=>e.type+':'+(e.damage||e.text)).slice(0,40).join(' | '));
