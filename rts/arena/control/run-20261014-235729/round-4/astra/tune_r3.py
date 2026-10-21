import pathlib,subprocess
base=pathlib.Path('agent_r2.js').read_text()
variants={
'baseline':[],
'home25':[("const goal=incoming|| (assault?eb:objective);","const goal=incoming|| (now<25?home:assault?eb:objective);"),("if(ec.some(e=>D(e,n)<240))continue;","if((now<25&&n.id!==home.id)||ec.some(e=>D(e,n)<240))continue;")],
'home35':[("const goal=incoming|| (assault?eb:objective);","const goal=incoming|| (now<35?home:assault?eb:objective);"),("if(ec.some(e=>D(e,n)<240))continue;","if((now<35&&n.id!==home.id)||ec.some(e=>D(e,n)<240))continue;")],
'nearshot':[("Math.max(0,range-stats.range-e.r)*2","Math.max(0,range-stats.range-e.r)*8")],
'upgrade':[("(army.filter(u=>u.type==='tank').length>=2||now>75)","(now>28)")],
'spread':[("let d=D(u,closest)||1;intent", "let d=D(u,closest)||1;intent"),("if(fleeing)","if(fleeing&&u.fireAt>now+.25)")],
}
for name,changes in variants.items():
 s=base
 for a,b in changes:s=s.replace(a,b)
 pathlib.Path('r3_'+name+'.js').write_text(s)
print(subprocess.check_output(['node','bench_r3.js',*variants],text=True))
