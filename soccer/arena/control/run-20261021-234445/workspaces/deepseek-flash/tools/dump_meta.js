const c = require('../catalog');
const s = {}; for (let n=1;n<=6;n++) s[n]=c.spawnsFor(n);
console.log(JSON.stringify({rules:c.rules, W:c.W, H:c.H, tiles:Array.from(c.FIELD), spawns:c.SPAWNS,
  spawns_by_n:s, penaltyBoxes:c.PENALTY_BOXES, goals:c.GOALS}));
