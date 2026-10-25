global.bot=null;const sim=require('./simulation'),op=require('./opponents'),{spawn}=require('child_process'),readline=require('readline'),fs=require('fs');
(async()=>{
let p=spawn('python3',['agent.py'],{stdio:['pipe','pipe','pipe']}),lines=readline.createInterface({input:p.stdout}),next=null,errors='';p.stderr.on('data',x=>errors+=x);lines.on('line',x=>{if(next){let f=next;next=null;f(x);}else throw Error('unsolicited output');});
let g=sim.createMatch({players:[{name:'program',kind:'api',team:['kestrel','aegis','vex']},{name:'opponent',kind:'api',team:['vex','aegis','kestrel']}]}),maxMs=0,n=0;
while(g.status==='playing'&&n++<700){
 let obs={...sim.snapshot(g,0),decisionWindows:true,framesPerWindow:15,lastErrors:[]};let start=performance.now();let answer=new Promise((resolve,reject)=>{let t=setTimeout(()=>reject(Error('response timeout')),5000);next=x=>{clearTimeout(t);resolve(x);};});p.stdin.write(JSON.stringify(obs)+'\n');let r=JSON.parse(await answer);maxMs=Math.max(maxMs,performance.now()-start);if(r.inputs.length!==15)throw Error('length');sim.submitWindow(g,0,r.inputs);
 let c=op.create('artillery');for(let i=0;i<15&&g.status==='playing';i++)sim.stepFrame(g,[r.inputs[i],op.act(g,1,c)]);
}
p.stdin.end();let result={winner:g.winner,frames:g.frames,windows:n,maxMs,stderr:errors,rounds:g.roundLog};fs.writeFileSync('end-to-end-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})();
