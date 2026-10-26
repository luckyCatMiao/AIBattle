const SIM = require('../simulation.js');
function blank(){const g=SIM.createMatch({id:'d',players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}],seed:7,teamSize:6});g.units.length=0;g.freeze=0;g.events.length=0;return g;}
function addUnit(g,team,index,x,y){g.units.push({id:'t'+team+'u'+index,team,index,name:'x',x,y,facing:{x:team===0?1:-1,y:0},held:{dir:'N',aim:null,kick:false},inputHistory:[],kickCd:0,controlLock:0,stealLock:0,foulLock:0,goals:0,kicks:0,touches:0});}
const g=blank();
addUnit(g,1,0,42.6,10.9); addUnit(g,1,1,42.6,15.1);
addUnit(g,0,1,10,25);
const ang=1.09,x=39.1,y=3.2;
g.ball={x,y,vx:11*Math.cos(ang),vy:11*Math.sin(ang),owner:null,lastTouch:'t0u1',lastTeam:0};
for(let f=0;f<40;f++){
  for(const u of g.units) u.held={dir:'N',aim:null,kick:false};
  SIM.step(g);
  const b=g.ball;
  console.log(f, 'ball', b.x.toFixed(3), b.y.toFixed(3), 'v', b.vx.toFixed(2), b.vy.toFixed(2), 'owner', b.owner, 'score', g.score.join(':'));
  if(g.score[0]>0){console.log('GOAL');break;}
  if(b.owner){console.log('caught by',b.owner);break;}
}
