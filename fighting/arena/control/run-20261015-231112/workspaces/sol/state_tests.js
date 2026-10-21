global.bot=null;const assert=require('assert'),s=require('./simulation'),a=require('./agent');
function game(enemy='sable'){return s.createMatch({players:[{name:'a',kind:'api',team:['kestrel','aegis','vex']},{name:'b',kind:'api',team:[enemy,...['aegis','vex','torv'].filter(x=>x!==enemy).slice(0,2)]}]});}
let g=game();g.fighters[0].x=600;g.fighters[1].x=680;g.fighters[1].guard=0.1;
s.stepFrame(g,[{dir:'DB',btn:'LP'},{dir:'DB',btn:null}]);for(let i=0;i<3;i++)s.stepFrame(g,[{dir:'DB',btn:null},{dir:'DB',btn:null}]);
assert.equal(g.fighters[1].state,'hitstun');let h=a.hydrate(s.snapshot(g,0),null);assert.equal(h.fighters[1].hitstunLeft,g.fighters[1].hitstunLeft);assert.equal(h.fighters[1].hitstunLeft,30);
g=game();g.fighters[0].x=600;g.fighters[1].x=680;
for(let i of [{dir:'D',btn:null},{dir:'DB',btn:null},{dir:'B',btn:'LP'}])s.stepFrame(g,[{dir:'N',btn:null},i]);
s.stepFrame(g,[{dir:'DB',btn:'LP'},{dir:'DB',btn:null}]);for(let i=0;i<3;i++)s.stepFrame(g,[{dir:'DB',btn:null},{dir:'DB',btn:null}]);
assert.equal(g.fighters[1].move.name,'架式反击');h=a.hydrate(s.snapshot(g,0),null);assert.equal(h.fighters[1].move.data.damage,140);assert.equal(h.fighters[1].move.data.knockup,13);
console.log('guard break and parry reconstruction: passed');
