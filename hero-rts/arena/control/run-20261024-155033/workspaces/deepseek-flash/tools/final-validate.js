const {play}=require('./tourney.js');
const {stress}=require('./stress.js');
const baseOpts={};
const variants={
  'sol-r3 (frost@0, 2-camp)':{solr3:true,workerQueue:6},
  'sol-r3 workers5':{solr3:true,workerQueue:5},
  'sol-r1 style':{},
  'sol turtle':{solr3:true,workerQueue:6,turtle:true},
  'sol early push@80':{solr3:true,workerQueue:6,pushAt:80},
};
let total=0,wins=0;
const rows=[];
for(const [name,so] of Object.entries(variants)){
  for(const seed of [1,2,3]){
    for(const seat of [0,1]){
      const r=play('necromancer',baseOpts,so,{agentSeat:seat,maxSeconds:420,seed});
      total++;if(r.win)wins++;
      rows.push({kind:'normal',name,seed,seat,win:r.win,dur:r.dur});
    }
  }
}
// robustness: option perturbations
for(const [pname,opt] of Object.entries({march44:{marchAt:44},march48:{marchAt:48},workers11:{workers:11},workers13:{workers:13}})){
  for(const seat of [0,1]){
    const r=play('necromancer',opt,{solr3:true,workerQueue:6},{agentSeat:seat,maxSeconds:420,seed:1});
    total++;if(r.win)wins++;
    rows.push({kind:'perturb',name:pname,seed:1,seat,win:r.win,dur:r.dur});
  }
}
// stress: boosted economy opponents (not part of headline rate)
let sw=0,st=0;const srows=[];
for(const [sname,extra] of Object.entries({boost20:{goldPerSec:20,woodPerSec:6},rich:{goldPerSec:30,woodPerSec:10,startGold:2500},richHome:{goldPerSec:30,woodPerSec:10,startGold:2500,solOpts:{solr3:true,turtle:true,workerQueue:6}}})){
  for(const seat of [0,1]){
    const solOpts=extra.solOpts||{solr3:true,workerQueue:6};
    const r=stress(baseOpts,Object.assign({agentSeat:seat,solOpts,hero:'necromancer'},extra));
    st++;if(r.win)sw++;
    srows.push({name:sname,seat,win:r.win,dur:r.dur});
  }
}
const byName={};
for(const r of rows){const k=r.kind+':'+r.name;byName[k]=byName[k]||{w:0,n:0,durs:[]};byName[k].n++;if(r.win)byName[k].w++;byName[k].durs.push(r.dur);}
console.log('=== headline: win rate',wins+'/'+total,'=',(100*wins/total).toFixed(1)+'%');
for(const [k,v] of Object.entries(byName))console.log(' ',k.padEnd(34),v.w+'/'+v.n,'avg '+ (v.durs.reduce((a,b)=>a+b,0)/v.n).toFixed(0)+'s', 'max '+Math.max(...v.durs).toFixed(0)+'s');
console.log('=== stress (boosted opponents):',sw+'/'+st);
for(const r of srows)console.log(' ',r.name,'seat'+r.seat,r.win?'WIN':'LOSS',r.dur.toFixed(0)+'s');
