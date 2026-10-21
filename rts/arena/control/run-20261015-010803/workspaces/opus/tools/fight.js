const R=require('/workspace/rules.js');
function fight(A,B,lvA=0,lvB=0){const g=R.createMatch({players:[{},{}]});g.status='playing';g.units=[];
g.players[0].level=lvA;g.players[1].level=lvB;
for(const [t,n] of Object.entries(A))for(let i=0;i<n;i++)R.spawn(g,0,t,500+(i%4)*25,300+Math.floor(i/4)*25);
for(const [t,n] of Object.entries(B))for(let i=0;i<n;i++)R.spawn(g,1,t,780+(i%4)*25,300+Math.floor(i/4)*25);
for(const u of g.units)u.order={type:'attackMove',x:u.owner?400:880,y:330};
for(let k=0;k<20*60;k++)R.step(g);
const c=[0,1].map(p=>g.units.filter(u=>u.owner==p).map(u=>u.type[0]+Math.round(u.hp)).join(' '));console.log(JSON.stringify(A),'vs',JSON.stringify(B),'=>',c[0],'|',c[1]);}
fight({raider:10},{tank:10});fight({raider:8},{tank:10});fight({raider:6},{tank:10});fight({raider:10},{tank:6,rifle:4});
fight({rifle:4},{tank:1});fight({raider:2},{tank:1});fight({raider:1},{tank:1});fight({raider:10},{tank:10},0,2);fight({raider:5},{rifle:4});
console.log('---');
fight({raider:15},{tank:10});fight({raider:12},{tank:8});fight({raider:3},{tank:2});fight({raider:6},{tank:4});fight({tank:5,raider:6},{tank:9});fight({rifle:24},{tank:10});
