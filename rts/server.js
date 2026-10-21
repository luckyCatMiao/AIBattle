'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createMatch,command,step,snapshot,DT}=require('./simulation');
const PORT=Number(process.env.RTS_PORT||8788),sessions=new Map(),tokens=new Map();
const id=()=>crypto.randomBytes(8).toString('hex');
function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let data='';for await(const c of req){data+=c;if(data.length>20000)throw Error('请求过大');}return JSON.parse(data||'{}');}
function auth(req,match){const key=req.headers.authorization?.replace(/^Bearer /,'');const seat=tokens.get(key);if(!seat||seat.match!==match)throw Object.assign(Error('无效的席位凭据'),{status:401});return seat;}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),parts=url.pathname.split('/').filter(Boolean);
  if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'跨站请求被拒绝'});
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,game:'frontier-rts'});
  if(req.method==='POST'&&url.pathname==='/api/matches'){
   const b=await body(req);let players=b.players;
   if(!players){const n=Number(b.count??2);if(!Number.isInteger(n)||n<2||n>8)throw Error('支持 2–8 方');players=[{name:'你',kind:'human'},...Array.from({length:n-1},(_,i)=>({name:['赤砂军团','暮光先锋','苍蓝旅团','琥珀卫队','绯红之翼','苔原军团','银色哨兵'][i],kind:'bot'}))];}
   if(!Array.isArray(players)||players.some(p=>!p||typeof p.name!=='string'||!['human','bot','api'].includes(p.kind)))throw Error('每位选手需要 name 和 kind（human / bot / api）');
   const key=id(),g=createMatch({id:key,players,seed:b.seed??1});
   // Bound unattended sessions; live matches are never evicted to make room.
   if(sessions.size>=24){const old=[...sessions].find(([,v])=>v.game.status==='finished');if(!old)return json(res,409,{error:'当前战役过多，请重启 RTS 服务清理测试房间'});sessions.delete(old[0]);for(const [t,s]of tokens)if(s.match===old[0])tokens.delete(t);}
   sessions.set(key,{game:g,touched:Date.now()});
   const seats=g.players.filter(p=>p.kind!=='bot').map(p=>{const token=crypto.randomBytes(24).toString('hex');tokens.set(token,{match:key,player:p.id,bucket:0,last:Date.now()});return {player:p.id,token};});
   return json(res,201,{match:key,seats,state:snapshot(g,seats[0]?.player??null)});
  }
  if(parts[0]==='api'&&parts[1]==='matches'&&parts[2]){
   const s=sessions.get(parts[2]);if(!s)return json(res,404,{error:'战役不存在；服务重启后请新建战役'});
   s.touched=Date.now();
   if(req.method==='GET'&&parts.length===3){const seat=req.headers.authorization?auth(req,parts[2]):null;return json(res,200,snapshot(s.game,seat?.player??null));}
   if(req.method==='POST'&&parts[3]==='commands'){
    const seat=auth(req,parts[2]),b=await body(req),now=Date.now();
    seat.bucket=Math.max(0,seat.bucket-(now-seat.last)/100);seat.last=now;
    if(seat.bucket>=15)return json(res,429,{error:'指令过快，请稍候'});seat.bucket++;
    command(s.game,seat.player,b);return json(res,200,{accepted:true,tick:s.game.tick});
   }
  }
  const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
  if(req.method==='GET'&&files[url.pathname]){const [file,mime]=files[url.pathname];res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'});return res.end(fs.readFileSync(path.join(__dirname,'public',file)));}
  json(res,404,{error:'Not found'});
 }catch(e){json(res,e.status||400,{error:e.message});}
});
let last=performance.now(),acc=0;
const ticker=setInterval(()=>{
 const now=performance.now();acc+=Math.min((now-last)/1000,.25);last=now;
 while(acc>=DT){for(const s of sessions.values()){
  if(Date.now()-s.touched>120000)continue; // Unattended tabs do not consume a whole campaign.
  step(s.game,DT);
 }acc-=DT;}
},25);
server.on('close',()=>clearInterval(ticker));
server.listen(PORT,'127.0.0.1',()=>console.log(`AIBattle Frontier: http://127.0.0.1:${PORT}`));
