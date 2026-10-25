const fs=require('fs');
let s=fs.readFileSync('test.js','utf8');
s=s.replace("program('main')", "program(process.env.PRIMARY || 'main')");
s=s.replace("'test_results.json'", "process.env.RESULT || 'sweep_results.json'");
fs.writeFileSync('round2_test.js',s);
