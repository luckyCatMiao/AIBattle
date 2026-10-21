'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createMatch,command,step,snapshot,DT,catalog}=require('./simulation');
const {handleArena}=require('./arena/http');
function createServer(){
 const sessions=new Map(),tokens=new Map(),id=()=>crypto.randomBytes(12).toString('hex');
 const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function body(req){let text='';for await(const part of req){text+=part;if(text.length>100000)throw Error('请求体过大');}const b=JSON.parse(text||'{}');if(!b||typeof b!=='object'||Array.isArray(b))throw Error('请求体应为对象');return b;}
 function auth(req,match){const token=req.headers.authorization?.replace(/^Bearer /,''),seat=tokens.get(token);if(!seat||seat.match!==match)throw Object.assign(Error('席位凭据无效'),{status:401});return seat;}
 const observation=(s,owner)=>({...snapshot(s.game,owner),mode:s.mode,lastDecision:s.lastDecision||null,waiting:s.mode==='lockstep'?s.game.players.filter(p=>p.alive&&p.kind!=='bot'&&!s.pending.has(p.id)).map(p=>p.id):[]});
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),parts=url.pathname.split('/').filter(Boolean);
  if(handleArena(req,res,url))return;
  if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'跨站请求被拒绝'});
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,game:'hero-rts',version:1});
  if(req.method==='GET'&&url.pathname==='/api/catalog')return json(res,200,catalog);
  if(req.method==='POST'&&url.pathname==='/api/matches'){
   const b=await body(req);let players=b.players;if(!players){const count=Number(b.count??2);if(!Number.isInteger(count)||count<2||count>8)throw Error('支持 2–8 方');players=[{name:'你',kind:'human',hero:b.hero||'vanguard'},...Array.from({length:count-1},(_,i)=>({name:['赤烬军团','月影议会','风暴王庭','翠林盟约','星辉军团','暗夜先锋','岩石卫队'][i],kind:'bot'}))];}
   if(!Array.isArray(players)||players.length<2||players.length>8||players.some(p=>!p||typeof p.name!=='string'||!['human','api','bot'].includes(p.kind)))throw Error('请提供 2–8 名有效选手');
   if(players[0].kind==='bot')throw Error('房主必须是 human 或 api，才能开始战役');
   const mode=b.mode??'realtime';if(!['realtime','lockstep'].includes(mode))throw Error('mode 为 realtime 或 lockstep');
   if(sessions.size>=16){const old=[...sessions].find(([,s])=>s.game.status==='finished');if(!old)return json(res,409,{error:'战役房间已满，请结束旧战役或重启新版服务'});sessions.delete(old[0]);for(const [t,s]of tokens)if(s.match===old[0])tokens.delete(t);}
   const key=id(),game=createMatch({id:key,players,seed:b.seed??1}),s={game,mode,pending:new Map(),touched:Date.now()};sessions.set(key,s);
   const seats=game.players.filter(p=>p.kind!=='bot').map(p=>{const token=crypto.randomBytes(24).toString('hex');tokens.set(token,{match:key,player:p.id,bucket:0,last:Date.now()});return {player:p.id,token};});
   return json(res,201,{match:key,seats,state:observation(s,seats[0]?.player??null)});
  }
  if(parts[0]==='api'&&parts[1]==='matches'&&parts[2]){
   const s=sessions.get(parts[2]);if(!s)return json(res,404,{error:'战役不存在；重启服务后请新建'});s.touched=Date.now();
   if(req.method==='GET'&&parts.length===3)return json(res,200,observation(s,req.headers.authorization?auth(req,parts[2]).player:null));
   if(req.method==='POST'&&(parts[3]==='commands'||parts[3]==='decisions')){
    const seat=auth(req,parts[2]),b=await body(req);
    if(parts[3]==='decisions'){
     if(s.mode!=='lockstep'||s.game.status!=='playing')throw Error('仅开始后的 lockstep 战役接受决策帧');
     if(!s.game.players[seat.player].alive)throw Error('选手已被淘汰');
     if(b.tick!==s.game.tick||s.pending.has(seat.player))return json(res,409,{error:'过期帧或该席位已提交此帧'});
     if(!Array.isArray(b.commands)||b.commands.length>catalog.rules.commandsPerDecision||b.commands.some(c=>!c||typeof c!=='object'||['start','pause'].includes(c.type)))throw Error('决策帧最多 20 条游戏命令');
     s.pending.set(seat.player,b.commands);
     const wait=s.game.players.filter(p=>p.alive&&p.kind!=='bot'&&!s.pending.has(p.id));
     if(!wait.length){const previousTick=s.game.tick,errors={};for(const p of s.game.players){errors[p.id]=[];for(const c of s.pending.get(p.id)||[])try{command(s.game,p.id,c);}catch(e){errors[p.id].push(e.message);}}s.pending.clear();for(let i=0;i<5;i++)step(s.game,DT);s.lastDecision={tick:previousTick,errors};}
     return json(res,200,{accepted:true,tick:s.game.tick,waiting:wait.map(p=>p.id),lastDecision:s.lastDecision||null});
    }
    if(s.mode==='lockstep'&&b.type!=='start')throw Error('同步战役请通过 decisions 提交游戏命令');
    const now=Date.now();seat.bucket=Math.max(0,seat.bucket-(now-seat.last)/40);seat.last=now;if(seat.bucket>=40)return json(res,429,{error:'指令过快，请稍候'});seat.bucket++;
    command(s.game,seat.player,b);return json(res,200,{accepted:true,tick:s.game.tick});
   }
  }
  const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/style.css':['style.css','text/css']};
  if(req.method==='GET'&&files[url.pathname]){const [name,mime]=files[url.pathname],file=path.join(__dirname,'public',name);if(!fs.existsSync(file))return json(res,404,{error:'页面资源尚未就绪'});res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'});return res.end(fs.readFileSync(file));}
  json(res,404,{error:'Not found'});
 }catch(e){json(res,e.status||400,{error:e.message});}});
 let last=performance.now(),acc=0;
 const timer=setInterval(()=>{const now=performance.now();acc+=Math.min((now-last)/1000,.2);last=now;while(acc>=DT){for(const s of sessions.values())if(s.mode==='realtime'&&Date.now()-s.touched<120000)step(s.game,DT);acc-=DT;}},25);timer.unref();
 server.on('close',()=>clearInterval(timer));return server;
}
if(require.main===module){const port=Number(process.env.HERO_RTS_PORT||8793);createServer().listen(port,'127.0.0.1',()=>console.log(`AIBattle Crownfall: http://127.0.0.1:${port}`));}
module.exports={createServer};
