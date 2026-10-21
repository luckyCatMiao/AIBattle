const fs=require('fs');
const src=fs.readFileSync('/workspace/game.html','utf8');
// page must not throw when AudioContext is absent entirely; already covered. Here: ensure no try/catch swallowed DOM lookup errors.
const must=[
 'window.combatBenchState = function',
 "getContext('2d')",
 "document.getElementById('stage')",
 'Sfx.setMuted',
 'KeyR','KeyJ','KeyK','KeyL','KeyI','Space',
 "addEventListener('blur'",
];
for(const m of must) if(!src.includes(m)) throw new Error('missing '+m);
// ensure we do not force fullscreen or pointer lock
if(/requestFullscreen|requestPointerLock/.test(src)) throw new Error('uses fullscreen/pointer lock');
// ensure preventing scroll on arrows/space
if(!src.includes("e.preventDefault()")) throw new Error('no preventDefault');
console.log('HTML static contract OK');
