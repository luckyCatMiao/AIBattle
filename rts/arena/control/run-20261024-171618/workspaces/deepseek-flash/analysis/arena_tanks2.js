const R=require('../rules.js');const {run}=require('./arena_tanks.js');
const base={kite:true,kiteLen:50,focus:'nearest',engage:12,retreatHp:0,spread:false};
const V={
  lowhp_spread:{kite:true,kiteLen:50,focus:'lowhp',engage:12,spread:true},
  lowhp_plain:{kite:true,kiteLen:50,focus:'lowhp',engage:12,spread:false},
  centroid_spread:{kite:true,kiteLen:50,focus:'centroid',engage:12,spread:true},
  lowhp_spread45:{kite:true,kiteLen:45,focus:'lowhp',engage:12,spread:true},
  lowhp_spread60:{kite:true,kiteLen:60,focus:'lowhp',engage:12,spread:true},
  lowhp_spread_e30:{kite:true,kiteLen:50,focus:'lowhp',engage:30,spread:true},
  lowhp_spread_e0:{kite:true,kiteLen:50,focus:'lowhp',engage:0,spread:true},
  lowhp_spread_fw08:{kite:true,kiteLen:50,focus:'lowhp',engage:12,spread:true,fireWindow:0.8},
};
for(const [name,cfg] of Object.entries(V)){
  let wa=0,wb=0,tie=0,res=[];
  for(const n of [1,2,3,4,5,6,7,8])for(const sh of [0,80,-80]){
    const r=run(cfg,n,base,n,380,sh);
    if(r.a>0&&r.b===0)wa++;else if(r.b>0&&r.a===0)wb++;else tie++;
    res.push(`${n}:${r.a}-${r.b}`);
  }
  console.log(name.padEnd(18),'W',wa,'L',wb,'T',tie,'|',res.join(' '));
}
