const {spawn}=require('node:child_process');
const path=require('node:path'),http=require('node:http'),fs=require('node:fs');
const root=__dirname,url='http://127.0.0.1:8788/';
function check(){return new Promise(resolve=>{const r=http.get(url+'api/health',r=>{r.resume();resolve(r.statusCode===200);});r.on('error',()=>resolve(false));r.setTimeout(1500,()=>{r.destroy();resolve(false);});});}
(async()=>{if(!await check()){
 const log=fs.openSync(path.join(root,'server.log'),'a');spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]}).unref();
 for(let i=0;i<30;i++){if(await check())break;await new Promise(r=>setTimeout(r,200));}
 }if(!await check())throw Error('RTS service failed to start; check rts/server.log');
 spawn('cmd.exe',['/c','start','',url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
})();
