'use strict';
// Original fantasy roster. Data is shared by the authoritative engine, API and UI.
const rules={width:3200,height:2000,hz:20,duration:1200,heroCap:5,unitCap:100,popMax:120,captureSeconds:10,nodeGold:3,nodeWood:1,baseIncome:1,decisionSeconds:.25,commandsPerDecision:20};
const cost=(gold,wood=0)=>({gold,wood});
const skills={};
function skill(id,name,slot,target,effect,opts={}){skills[id]={id,name,slot,target,effect,range:550,radius:110,mana:35,cooldown:12,castTime:.3,delay:0,requiredLevel:slot==='R'?3:1,color:'#d8b76b',description:name,...opts};return id;}
const heroes={};
function hero(id,name,role,color,stats,abilities){heroes[id]={id,name,role,description:role,color,icon:name[0],cost:cost(360,80),build:18,hp:900,mana:280,speed:112,range:38,damage:34,cooldown:1.2,r:19,pop:5,armor:'heavy',attackType:'normal',tier:1,producer:'altar',...stats,skills:abilities};}
hero('vanguard','曙光骑士','突进 · 群体护盾 · 圣光治疗','#f4d888',{},[
 skill('v_charge','破阵冲锋','Q','point','dash',{range:440,amount:85,radius:85,status:'stun',duration:1.1,description:'冲向指定位置，对沿途敌人造成 85 伤害并眩晕 1.1 秒。'}),
 skill('v_shield','誓约之盾','W','point','shield',{range:420,amount:180,radius:150,duration:6,description:'为范围内友军提供 180 护盾，持续 6 秒。'}),
 skill('v_heal','圣光援护','E','ally','heal',{amount:210,cooldown:10,description:'恢复一名友军 210 生命。'}),
 skill('v_sanctuary','圣域','R','point','sanctuary',{mana:100,cooldown:55,radius:200,amount:45,duration:8,description:'建立 8 秒圣域，每秒治疗友军 45 生命，赋予减伤。'})]);
hero('pyromancer','烬焰法师','延迟爆发 · 火线封路 · 闪现','#ff9367',{hp:650,mana:400,range:230,damage:25,armor:'unarmored',attackType:'magic'},[
 skill('p_bolt','灼热火矛','Q','point','line',{amount:145,range:700,radius:32,projectileSpeed:430,cooldown:7,description:'发射可躲避的穿透火矛，对路径敌人造成 145 伤害。'}),
 skill('p_flame','烈焰风暴','W','point','zone',{amount:42,radius:145,delay:1.1,duration:5,description:'预警 1.1 秒后燃烧区域，持续 5 秒，每秒 42 伤害。'}),
 skill('p_blink','余烬闪烁','E','point','blink',{range:340,mana:45,cooldown:16,castTime:0,description:'闪现至 340 范围内可通行位置，可躲避落点技能。'}),
 skill('p_meteor','天陨之火','R','point','blast',{amount:300,radius:210,delay:1.7,mana:120,cooldown:55,status:'stun',duration:1.2,description:'预警 1.7 秒后陨石落地，造成 300 范围伤害与眩晕。'})]);
hero('frost','霜语先知','减速控场 · 冰牢 · 阵地战','#95dfff',{hp:700,mana:380,range:220,damage:24,armor:'unarmored',attackType:'magic'},[
 skill('f_cone','寒霜吐息','Q','point','cone',{amount:90,range:340,radius:180,status:'slow',duration:4,cooldown:8,description:'向前方扇形喷吐寒霜，造成 90 伤害并减速 4 秒。'}),
 skill('f_root','极寒禁锢','W','point','blast',{amount:55,radius:115,delay:.7,status:'root',duration:2.5,description:'预警后冻结范围内敌人，使其无法移动 2.5 秒。'}),
 skill('f_armor','冰晶护甲','E','ally','shield',{amount:250,duration:7,cooldown:12,description:'为友军提供 250 护盾，持续 7 秒。'}),
 skill('f_blizzard','暴风雪','R','point','zone',{amount:58,radius:230,delay:1,duration:7,mana:110,cooldown:55,status:'slow',description:'持续 7 秒的暴风雪，每秒造成 58 伤害并减速。'})]);
hero('ranger','逐风游侠','远程点杀 · 扇形箭雨 · 位移','#b8e28a',{hp:720,mana:260,range:280,damage:38,speed:124,armor:'light',attackType:'pierce'},[
 skill('r_arrow','贯穿之箭','Q','point','line',{amount:160,range:800,radius:22,projectileSpeed:620,cooldown:9,description:'发射高速穿透箭，直线上所有敌人受到 160 伤害。'}),
 skill('r_fan','散射齐发','W','point','cone',{amount:110,range:350,radius:190,cooldown:12,description:'扇形散射，对范围敌人造成 110 伤害。'}),
 skill('r_dash','风行步','E','point','blink',{range:280,castTime:0,cooldown:10,mana:25,description:'快速位移到 280 范围内，脱离近战或调整射角。'}),
 skill('r_rain','千羽箭阵','R','point','zone',{amount:65,radius:200,delay:.8,duration:6,mana:100,cooldown:50,description:'指定区域持续落箭 6 秒，每秒 65 伤害。'})]);
hero('assassin','暮影刺客','切入后排 · 沉默 · 残血收割','#c8a5ff',{hp:740,mana:280,speed:145,damage:44,cooldown:.85,armor:'light'},[
 skill('a_step','暗影突袭','Q','enemy','strike',{amount:125,range:420,status:'silence',duration:2,cooldown:10,description:'瞬移至敌人身旁，造成 125 伤害并沉默 2 秒。'}),
 skill('a_smoke','烟幕掩护','W','self','evade',{amount:0,duration:4,cooldown:16,description:'4 秒内减少 65% 普通攻击伤害；不能免疫技能伤害。'}),
 skill('a_venom','淬毒匕首','E','enemy','dot',{amount:28,duration:5,status:'slow',cooldown:9,description:'使目标中毒 5 秒，每秒 28 伤害并减速。'}),
 skill('a_execute','终夜处决','R','enemy','execute',{amount:170,range:180,mana:90,cooldown:40,description:'造成 170 加目标已损失生命 35% 的伤害，上限 500。'})]);
hero('druid','森之先知','缠绕 · 回春 · 树灵召唤','#7fd39a',{hp:780,mana:360,range:210,damage:25,attackType:'magic',armor:'unarmored'},[
 skill('d_root','荆棘缠绕','Q','enemy','blastTarget',{amount:65,status:'root',duration:3,cooldown:11,description:'造成 65 伤害并缠绕目标 3 秒。'}),
 skill('d_heal','生命绽放','W','point','healArea',{amount:150,radius:160,cooldown:14,description:'治疗区域内友军 150 生命。'}),
 skill('d_trees','唤醒树灵','E','point','summon',{summon:'treant',count:2,duration:35,range:280,mana:70,cooldown:25,description:'召唤 2 个树灵作战 35 秒，不能占点。'}),
 skill('d_growth','远古生长','R','point','buff',{status:'haste',duration:12,radius:240,mana:100,cooldown:55,amount:120,description:'恢复范围友军 120 生命，并提升移速和攻速 12 秒。'})]);
hero('necromancer','亡语术士','生命汲取 · 衰弱诅咒 · 亡灵海','#b49ddd',{hp:680,mana:420,range:220,damage:28,armor:'unarmored',attackType:'magic'},[
 skill('n_drain','灵魂汲取','Q','enemy','drain',{amount:150,cooldown:9,description:'造成 150 魔法伤害，并按实际伤害治疗自身。'}),
 skill('n_curse','衰败诅咒','W','point','blast',{amount:45,radius:150,status:'weaken',duration:6,cooldown:13,description:'造成 45 伤害，使敌军造成的伤害降低 30%，持续 6 秒。'}),
 skill('n_raise','骸骨军团','E','point','summon',{summon:'skeleton',count:4,duration:30,range:280,mana:75,cooldown:24,description:'召唤 4 个骷髅战士，存在 30 秒，不能占点。'}),
 skill('n_plague','凋零疫地','R','point','zone',{amount:55,radius:225,delay:.8,duration:8,status:'weaken',mana:120,cooldown:60,description:'制造 8 秒瘟疫区域，持续伤害并削弱敌人。'})]);
hero('guardian','巨岩守卫','承伤 · 嘲讽 · 重击控制','#d5b397',{hp:1250,mana:250,speed:88,damage:40,armor:'heavy'},[
 skill('g_slam','裂地重击','Q','point','cone',{amount:110,range:240,radius:170,status:'stun',duration:1.5,cooldown:11,description:'重击前方扇形区域，造成伤害并眩晕 1.5 秒。'}),
 skill('g_taunt','震慑咆哮','W','self','taunt',{radius:200,duration:2.5,cooldown:15,description:'迫使附近敌人攻击自己 2.5 秒，可打断正在施法的单位。'}),
 skill('g_stone','岩石壁垒','E','self','shield',{amount:420,duration:7,cooldown:18,description:'获得 420 护盾，持续 7 秒。'}),
 skill('g_quake','大地崩裂','R','point','zone',{amount:70,radius:210,range:400,delay:1,duration:6,status:'slow',mana:100,cooldown:55,description:'引发地震，持续 6 秒伤害并减速范围内敌人。'})]);
hero('engineer','星械工匠','炮台部署 · 手雷 · 机械修复','#eccb7c',{hp:800,mana:340,range:230,damage:30,attackType:'pierce'},[
 skill('e_turret','部署哨炮','Q','point','summon',{summon:'turret',count:1,duration:40,range:320,cooldown:22,mana:65,description:'部署持续 40 秒的固定哨炮，可对地对空。'}),
 skill('e_bomb','震荡手雷','W','point','blast',{amount:130,radius:115,delay:.9,status:'stun',duration:1,cooldown:12,description:'投掷手雷，预警后爆炸，造成 130 伤害并眩晕。'}),
 skill('e_repair','应急修复','E','point','repairArea',{amount:220,radius:145,cooldown:14,description:'修复区域内友军建筑与机械单位 220 生命。'}),
 skill('e_orbit','星火轰击','R','point','blast',{amount:360,radius:190,delay:2,range:800,mana:120,cooldown:60,description:'2 秒预警后轰击指定区域，对建筑同样有效。'})]);
hero('oracle','星辉祭司','治疗 · 驱散 · 团队保护','#e3c5ef',{hp:650,mana:450,range:200,damage:22,armor:'unarmored',attackType:'magic'},[
 skill('o_heal','星光治愈','Q','ally','heal',{amount:260,cooldown:7,mana:40,description:'为友军恢复 260 生命。'}),
 skill('o_dispel','净化之环','W','point','dispel',{radius:180,cooldown:12,description:'清除范围友军负面状态、敌军护盾和增益，并伤害召唤物。'}),
 skill('o_shield','星辉庇佑','E','point','shield',{amount:140,radius:190,duration:8,cooldown:17,description:'为区域友军提供 140 护盾，持续 8 秒。'}),
 skill('o_renew','群星祈愿','R','point','healArea',{amount:430,radius:300,castTime:1.2,mana:130,cooldown:55,description:'吟唱 1.2 秒后治疗大范围友军 430 生命，吟唱可被打断。'})]);
const units={};
function troop(id,name,role,producer,tier,gold,wood,stats,ability){units[id]={id,name,description:role,role,producer,tier,cost:cost(gold,wood),build:10,hp:240,mana:80,speed:96,range:32,damage:20,cooldown:1.2,r:12,pop:2,armor:'light',attackType:'normal',color:'#acb8a6',icon:name[0],...stats,skills:ability?[ability]:[]};}
troop('worker','农民','采金 · 伐木 · 建造','townhall',1,60,0,{hp:140,mana:0,damage:5,speed:100,pop:1,build:6},null);
troop('footman','盾卫','前排承伤 · 主动举盾','barracks',1,90,10,{hp:340,armor:'heavy'},skill('u_guard','盾墙','Q','self','shield',{mana:0,amount:140,duration:5,cooldown:18,castTime:0}));
troop('spearman','长枪兵','反骑兵 · 对空投网','barracks',1,90,20,{hp:250,range:60,bonus:'cavalry'},skill('u_net','诱捕','Q','enemy','blastTarget',{mana:0,amount:0,status:'root',duration:3,range:360,cooldown:16,description:'禁锢目标 3 秒，使飞行单位暂时落地。'}));
troop('archer','巡林弓手','远程轻兵 · 对空','range',1,95,25,{hp:180,range:250,damage:22,attackType:'pierce',antiAir:true},skill('u_rapid','疾射','Q','self','buff',{mana:0,status:'haste',duration:5,cooldown:20}));
troop('crossbow','重弩手','远程破甲 · 长射程','range',2,130,45,{hp:230,range:320,damage:40,cooldown:2.2,attackType:'pierce',antiAir:true},skill('u_snipe','蓄力狙击','Q','enemy','blastTarget',{mana:0,amount:100,range:430,castTime:1,cooldown:16}));
troop('knight','银甲骑士','高速冲锋 · 重甲','stable',2,180,45,{hp:560,speed:145,damage:36,pop:3,armor:'heavy',tag:'cavalry'},skill('u_charge','骑兵冲锋','Q','point','dash',{mana:0,amount:55,radius:55,range:300,status:'stun',duration:.7,cooldown:17}));
troop('berserker','狂战士','近战爆发 · 范围斩击','barracks',2,140,35,{hp:380,damage:34,speed:110},skill('u_cleave','旋风斩','Q','self','blast',{mana:0,amount:85,radius:100,cooldown:13}));
troop('rogue','夜刃','快速绕后 · 沉默法师','barracks',2,125,40,{hp:230,speed:145,damage:28,cooldown:.8},skill('u_silence','封喉','Q','enemy','blastTarget',{mana:0,amount:40,status:'silence',duration:3,range:75,cooldown:14}));
troop('priest','牧师','自动治疗 · 主动净化','arcane',1,110,50,{hp:180,mana:220,range:210,damage:9,armor:'unarmored',attackType:'magic',heal:20},skill('u_cleanse','驱散','Q','point','dispel',{mana:40,radius:110,cooldown:12}));
troop('sorceress','女巫','减速控场 · 魔法伤害','arcane',2,135,65,{hp:190,mana:200,range:240,damage:25,armor:'unarmored',attackType:'magic'},skill('u_slow','迟缓术','Q','enemy','blastTarget',{amount:20,status:'slow',duration:6,cooldown:10}));
troop('shaman','萨满','嗜血加速 · 魔法输出','arcane',2,150,60,{hp:240,mana:220,range:190,damage:22,armor:'unarmored',attackType:'magic'},skill('u_blood','嗜血','Q','ally','buff',{status:'haste',duration:8,cooldown:12}));
troop('dryad','树妖','远程消耗 · 毒素','range',2,145,60,{hp:260,mana:140,speed:120,range:230,attackType:'pierce',antiAir:true},skill('u_poison','剧毒标枪','Q','enemy','dot',{amount:15,duration:5,status:'slow',cooldown:12}));
troop('warlock','亡灵巫师','召唤骷髅 · 后排法术','arcane',3,180,80,{hp:250,mana:250,range:220,damage:28,armor:'unarmored',attackType:'magic'},skill('u_raise','骸骨召唤','Q','point','summon',{summon:'skeleton',count:2,duration:25,mana:60,range:240,cooldown:25}));
troop('mortar','迫击炮组','超远程溅射 · 拆建筑','workshop',2,200,100,{hp:250,range:480,damage:65,cooldown:3.2,speed:65,attackType:'siege',splash:85,projectileSpeed:270,pop:3,mechanical:true,minRange:120},skill('u_shell','爆破弹','Q','point','blast',{mana:0,amount:130,radius:140,range:650,delay:1.4,cooldown:18}));
troop('ballista','重型弩车','直线穿透 · 攻城机械','workshop',2,190,110,{hp:340,range:400,damage:60,cooldown:2.6,speed:70,attackType:'siege',pop:3,mechanical:true},skill('u_bolt','穿城巨矢','Q','point','line',{mana:0,amount:140,range:700,radius:26,projectileSpeed:500,cooldown:18}));
troop('griffin','狮鹫骑士','空中重兵 · 魔法溅射','aviary',3,240,120,{hp:420,range:220,damage:46,cooldown:1.8,speed:125,flying:true,antiAir:true,attackType:'magic',splash:45,pop:4,armor:'light'},skill('u_thunder','雷击','Q','enemy','blastTarget',{amount:110,status:'stun',duration:1,cooldown:18}));
troop('gargoyle','石像鬼','高速制空 · 石化恢复','aviary',2,130,70,{hp:270,range:160,damage:24,speed:150,flying:true,antiAir:true,attackType:'pierce',bonus:'flying'},skill('u_stone','石像恢复','Q','self','stone',{mana:0,amount:120,duration:3,cooldown:25,description:'石化 3 秒不能行动，恢复 120 生命。'}));
const summons={
 treant:{name:'树灵',hp:320,speed:72,range:36,damage:22,cooldown:1.4,r:16,armor:'heavy',attackType:'normal'},
 skeleton:{name:'骷髅',hp:100,speed:105,range:30,damage:16,cooldown:1.1,r:10,armor:'light',attackType:'normal'},
 turret:{name:'哨炮',hp:280,speed:0,range:300,damage:28,cooldown:1,r:16,armor:'heavy',attackType:'pierce',antiAir:true,mechanical:true},
 sentinel:{name:'遗迹守卫',hp:520,speed:90,range:42,damage:35,cooldown:1.5,r:19,armor:'heavy',attackType:'normal'},
 ancient:{name:'远古巨像',hp:3000,speed:72,range:190,damage:75,cooldown:1.8,r:32,armor:'heavy',attackType:'magic',splash:90,antiAir:true}
};
const buildings={};
function building(id,name,description,gold,wood,opts={}){buildings[id]={id,name,description,icon:name[0],cost:cost(gold,wood),build:18,hp:1000,r:38,tier:1,pop:0,...opts};}
building('townhall','城镇大厅','资源交纳 · 生产农民 · 升级时代；失去全部大厅即败北',420,220,{hp:3200,r:58,build:45,pop:20,range:260,damage:35,cooldown:1.3});
building('altar','英雄祭坛','召唤和复活英雄，每方最多 5 名不同英雄',180,100,{hp:1200,r:40,build:22});
building('barracks','兵营','盾卫、长枪兵；二级解锁狂战士和夜刃',150,70,{});
building('range','靶场','弓手；二级解锁重弩手和树妖',150,85,{});
building('stable','骑士营地','二级兵营 · 生产银甲骑士',210,130,{tier:2});
building('arcane','奥术圣所','牧师、女巫、萨满与亡灵巫师',175,120,{});
building('workshop','攻城工坊','二级兵营 · 生产迫击炮和重弩车',220,160,{tier:2});
building('aviary','飞行兽栏','二级生产石像鬼；三级解锁狮鹫',220,150,{tier:2});
building('forge','铁匠铺','研究武器与护甲，支持时代升级',150,100,{});
building('lumbermill','伐木场','附近工人可交纳木材与金矿，研究采集效率',100,60,{hp:850,r:30});
building('farm','农庄','增加 12 人口上限',70,40,{hp:550,r:25,build:12,pop:12});
building('tower','守望塔','防御建筑，自动对地对空攻击',140,100,{hp:950,r:25,build:25,range:340,damage:38,cooldown:1.4});
const techs={
 tier2:{id:'tier2',name:'城堡时代',description:'解锁二级部队、骑士营地、工坊和兽栏；需要铁匠铺',cost:cost(350,220),build:40,building:'townhall',tier:1,maxLevel:1,requires:'forge'},
 tier3:{id:'tier3',name:'王国时代',description:'解锁狮鹫、亡灵巫师与第三级军备',cost:cost(550,320),build:55,building:'townhall',tier:2,maxLevel:1,requires:'forge'},
 weapons:{id:'weapons',name:'精铸武器',description:'每级提高 12% 普通攻击伤害，当前时代限制研究级数',cost:cost(180,110),build:25,building:'forge',tier:1,maxLevel:3},
 armor:{id:'armor',name:'强化护甲',description:'每级减少 8% 受到的普通攻击伤害',cost:cost(160,120),build:25,building:'forge',tier:1,maxLevel:3},
 gathering:{id:'gathering',name:'高效采集',description:'每级提高 30% 采集速度与携带上限',cost:cost(130,100),build:25,building:'lumbermill',tier:1,maxLevel:2}
};
const catalog={heroes,units,buildings,skills,techs,summons,rules};
module.exports=catalog;
