'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, place, ascii } = require('../game');
const fresh = () => createGame({id:'test',black:{id:'b',name:'B'},white:{id:'w',name:'W'}});
function play(g,x,y){return place(g,{playerId:g.turn===1?'b':'w',x,y,ply:g.moves.length});}
test('rejects wrong player, stale board, invalid coordinates and occupied cells without mutation',()=>{
  const g=fresh();
  assert.throws(()=>place(g,{playerId:'w',x:0,y:0,ply:0}),/轮到/);
  for(const [x,y] of [[-1,0],[15,0],[1.2,0],[0,null]])assert.throws(()=>play(g,x,y),/坐标/);
  play(g,7,7);assert.throws(()=>play(g,7,7),/已有/);
  assert.throws(()=>place(g,{playerId:'w',x:0,y:0,ply:0}),/变化/);
  assert.equal(g.moves.length,1);assert.equal(g.turn,2);
  assert.match(ascii(g),/A B C D/);assert.equal(g.moves[0].coordinate,'H8');
});
for(const [name,coords] of [
 ['horizontal',[[0,0],[1,0],[2,0],[3,0],[4,0]]],
 ['vertical',[[14,0],[14,1],[14,2],[14,3],[14,4]]],
 ['diagonal',[[0,0],[1,1],[2,2],[3,3],[4,4]]],
 ['anti diagonal',[[0,14],[1,13],[2,12],[3,11],[4,10]]],
 ['overline bridge',[[0,0],[1,0],[2,0],[4,0],[5,0],[3,0]]],
])test(`detects ${name} win`,()=>{
 const g=fresh();coords.forEach(([x,y],i)=>{play(g,x,y);if(i<coords.length-1)play(g,i*2,7);});
 assert.equal(g.winner,'b');assert.equal(g.status,'finished');assert.equal(g.winningLine.length,coords.length);
 assert.throws(()=>play(g,14,14),/结束/);
});
test('white can win and separate edge rows are not joined',()=>{
 const g=fresh();for(let i=0;i<5;i++){play(g,i*2,0);play(g,i,14);}
 assert.equal(g.winner,'w');assert.equal(g.moves.length,10);
});
test('full board without a line is a draw',()=>{
 const g=fresh(), cells=[[],[]];for(let y=0;y<15;y++)for(let x=0;x<15;x++)cells[(Math.floor(x/2)+y)%2].push([x,y]);
 if(cells[0].length<cells[1].length)cells.reverse();
 for(let i=0;i<225;i++){const [x,y]=cells[i%2].shift();play(g,x,y);}
 assert.equal(g.status,'finished');assert.equal(g.termination,'draw');assert.equal(g.winner,null);
});
