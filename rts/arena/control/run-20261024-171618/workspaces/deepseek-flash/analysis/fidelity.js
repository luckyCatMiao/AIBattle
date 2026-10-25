const fs=require('fs');
const {makeSol}=require('./solbot.js');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','r1-g1','r1-g2'];
for(const id of ids){
  const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol');
  const bot=makeSol({});
  let match=0,total=0,typeMatch=0,typeTotal=0;
  const examples=[];
  for(const d of g.decisions){
    const f=g.frames.find(fr=>fr.tick===d.tick);
    if(!f)continue;
    const obs=JSON.parse(JSON.stringify(f));
    obs.yourPlayer=S;
    let pred=[];
    try{pred=bot(obs)||[];}catch(e){}
    const rec=d.commands[S];
    // compare per-command types (count multiset)
    const cnt=cs=>{const o={};for(const c of cs){const k=c.type+(c.unit?(':'+c.unit):'');o[k]=(o[k]||0)+1;}return o;};
    const P=cnt(pred),Rr=cnt(rec);
    total+=Math.max(pred.length,rec.length); typeTotal+=Math.max(pred.length,rec.length);
    for(const k in Rr){const m=Math.min(P[k]||0,Rr[k]);typeMatch+=m;}
    // compare unit-level attack targets for attack commands
    const recAtk={},predAtk={};
    for(const c of rec)if(c.type==='attack'&&c.units)for(const u of c.units)recAtk[u]=c.target;
    for(const c of pred)if(c.type==='attack'&&c.units)for(const u of c.units)predAtk[u]=c.target;
    let mm=0,tt=0;
    for(const u in recAtk){tt++;if(predAtk[u]===recAtk[u])mm++;}
    match+=mm;total+=0; // use separate counters below
    if(examples.length<3&&d.now<40)examples.push({t:d.now,rec:JSON.stringify(rec).slice(0,200),pred:JSON.stringify(pred).slice(0,200)});
  }
  console.log(id,'typeMatch',typeMatch+'/'+typeTotal,'=',(typeMatch/typeTotal*100).toFixed(1)+'%');
  for(const e of examples)console.log('  t'+e.t+'\n   rec '+e.rec+'\n   prd '+e.pred);
}
