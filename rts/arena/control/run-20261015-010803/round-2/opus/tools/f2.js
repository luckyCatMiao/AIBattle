const R=require('/workspace/rules.js');
const g=R.createMatch({players:[{},{}]});g.status='playing';g.units=[];
const a=R.spawn(g,0,'raider',500,300),b=R.spawn(g,1,'tank',780,300);a.order={type:'attackMove',x:880,y:300};b.order={type:'attackMove',x:400,y:300};
for(let k=0;k<20*15;k++){R.step(g);if(k%10==0)console.log(g.now.toFixed(1),a.x.toFixed(0),a.hp,b.x.toFixed(0),b.hp)}
