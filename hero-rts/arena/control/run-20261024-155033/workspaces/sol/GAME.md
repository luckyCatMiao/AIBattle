# 灰烬王座 · 英雄战争

独立的网页英雄 RTS 原型，支持 2–8 方混战、基地建设、黄金与木材采集、三级时代、10 位英雄、16 类战斗兵种和外部程序选手。首发英雄、每位英雄的四个技能、普通兵种的主动技能、建筑与科技参数都来自 [catalog.js](catalog.js)。

双击根目录 `StartHeroRTS.bat`，或在 `AIBattle` 根目录运行：

```powershell
node hero-rts/server.js
```

打开 <http://127.0.0.1:8793/>。`npm run heroes` 也可启动服务。需要 Node.js 20 或更新版本，无需安装 npm 依赖。可通过环境变量 `HERO_RTS_PORT` 更换端口。此项目使用独立目录和端口，原五子棋、前线争夺及历史模型对战服务保持独立。

## 开始与操作

新建战局时选择 2–8 个阵营和首发英雄，其余阵营由内置规则电脑控制。建立战局后开始战役，模拟时间才会推进。

| 操作 | 效果 |
| --- | --- |
| 左键点选 / 拖框 | 选择己方单位；点选建筑查看状态 |
| Shift + 选择 | 添加或移除选择 |
| 双击单位 | 选择当前视野内同类单位 |
| 右键地面 / 敌军 / 资源 | 移动 / 集火 / 工人采集 |
| 选中建筑后右键地面 | 设置该建筑的出兵集结点 |
| `A` 后左键 | 攻击移动，沿途自动交战 |
| `S` / `H` | 停止 / 原地驻守 |
| `Q W E R` | 所选单位的主动技能；点目标或地点确认 |
| `B` | 展开建造菜单；选择建筑后左键放置 |
| `F1`–`F5` | 选择并定位己方英雄 |
| `Ctrl` + `1`–`9` | 保存编队 |
| `1`–`9` / 连按两次 | 选择编队 / 定位编队 |
| 中键拖动、右键拖动、方向键、屏幕边缘 | 平移镜头 |
| 滚轮 / 小地图 | 缩放 / 定位战场 |
| `Home` / 空格 | 回主城 / 定位选择 |
| `Esc` | 取消技能瞄准或建筑放置 |

右上角暂停按钮用于单人对电脑战局；多人和外部程序对战不能暂停。技能栏显示法力、冷却与等级要求；目标不合法时会显示原因。空格用于定位部队。

## 经济、科技与胜负

每方初始拥有城镇大厅、英雄祭坛、兵营、农庄，5 名农民、4 名盾卫、1 位英雄，以及 650 黄金和 250 木材。

- 农民从有限金矿和树林采集资源，送回城镇大厅或伐木场后到账。资源耗尽后会寻找最近的同类资源，也可手动指定。存活阵营每秒获得 1 黄金基础收入。
- 建造时一次扣费，工人要移动到施工点并持续施工。未完成建筑不能生产或提供人口；建筑位置须避开地形、现有建筑、资源、圣坛和敌军。
- 农庄增加人口上限，排队生产也预占人口。每方人口上限 120、单位上限 100；同一生产建筑最多排队 6 项。
- 兵种要求对应的已完成生产建筑和时代。先建铁匠铺，再研究城堡时代；升级王国时代后解锁狮鹫和亡灵巫师。研究消耗资源并占用时间。
- 铁匠铺研究武器与护甲，伐木场研究采集效率。英雄祭坛负责招募与复活。
- 圣坛需要部队驻留 10 秒才能占领，敌我同时在场时争夺暂停。每座已占领圣坛每秒提供 3 黄金和 1 木材；工人和召唤物不能占点。
- 地形阻挡地面部队，飞行部队可越过地形。普通近战无法直接攻击空军；弓手等对空兵种和诱捕技能提供应对手段。
- 摧毁一方全部城镇大厅会淘汰该方。最后存活阵营获胜；20 分钟仍未决出胜者时，按照战役积分结算。

每方最多招募 **5 位不同英雄**，排队和阵亡英雄也占名额。同一英雄不能重复招募。英雄通过附近敌军与野怪死亡获得经验，最高 6 级；`R` 终极技能在 3 级解锁。英雄阵亡后等待 12 秒，再支付黄金进入复活队列，保留等级和经验。

首发英雄免费，之后每位新英雄需要 360 黄金、80 木材和 18 秒生产时间。复活花费 `150 + 40 × 英雄等级` 黄金，排队时间为 `12 + 2 × 英雄等级` 秒。可重复研究的科技采用目录中的基础费用，每已有一级再增加 70 黄金、50 木材；武器与护甲研究级数受时代限制。

十位英雄分别为曙光骑士、烬焰法师、霜语先知、逐风游侠、暮影刺客、森之先知、亡语术士、巨岩守卫、星械工匠和星辉祭司。技能包含位移、治疗、护盾、直线弹道、延迟范围攻击、召唤、控制和驱散。预警圈中的范围攻击可以通过移动躲避；眩晕或嘲讽能打断尚未完成的施法。技能在开始施法时扣法力并进入冷却，被打断后不会返还。具体数值以游戏面板和 `/api/catalog` 为准。

## 外部程序 API

服务端固定以 20 Hz 计算战场，网页、规则电脑和 API 选手共用同一套战斗规则。地图为 3200 × 2000，原点在左上。全部战场信息公开，没有战争迷雾。

创建战役：

```http
POST /api/matches
Content-Type: application/json

{"players":[{"name":"Agent A","kind":"api","hero":"pyromancer"},{"name":"Agent B","kind":"api","hero":"guardian"}],"seed":1,"mode":"lockstep"}
```

响应为 `{match, seats:[{player,token}], state}`。`player` 从 0 开始；支持任意混合的 `human`、`api`、`bot`，机器人没有凭据。房主为选手 0；需要非机器人房主席位发送 `start`。创建者应将每个 token 单独交给对应选手。

```http
GET /api/catalog
GET /api/health
GET /api/matches/MATCH_ID
Authorization: Bearer YOUR_TOKEN
```

状态包括当前时间和 tick、玩家经济与科技、单位、建筑及生产队列、资源、圣坛、投射物和范围预警。认证观察还带有 `yourPlayer`。只读观战可以不带凭据，公开状态不包含任何席位 token。

```http
POST /api/matches/MATCH_ID/commands
Authorization: Bearer HOST_TOKEN
Content-Type: application/json

{"type":"start"}
```

### 实时模式

创建时省略 `mode` 或设置 `"mode":"realtime"`。开始后时间持续推进，发送单条指令到 `/commands`：

```json
{"type":"train","unit":"worker"}
{"type":"train","unit":"footman","building":"b3"}
{"type":"build","building":"farm","units":["u5"],"x":650,"y":900}
{"type":"summon","hero":"oracle"}
{"type":"revive","hero":"oracle"}
{"type":"research","tech":"tier2"}
{"type":"move","units":["u10","u11"],"x":800,"y":900}
{"type":"attackMove","units":["u10","u11"],"x":1100,"y":1000}
{"type":"attack","units":["u10"],"target":"u22"}
{"type":"gather","units":["u5"],"target":"res0gold"}
{"type":"stop","units":["u10"]}
{"type":"hold","units":["u10"]}
{"type":"rally","building":"b3","x":700,"y":1000}
{"type":"cast","unit":"u14","skill":"p_flame","x":1000,"y":1000}
{"type":"cast","unit":"u14","skill":"v_heal","target":"u10"}
```

示例 ID 必须替换为当前状态中的真实 ID。生产的 `building` 可省略，由系统选择合适建筑；技能要属于施法单位。编队指令先统一验证所有单位及参数，任何越权或无效单位都会拒绝整条指令，不会只移动其中一部分。资源不足、人口不足、依赖未完成、超出距离、法力不足或冷却中也会拒绝。

实时指令限额按每秒 25 条补充，短时突发最多 40 条，超限返回 429。单位会持续执行已下达的命令，无需每帧重新发送。

### 同步决策模式

`lockstep` 用于比较程序策略：所有仍存活的非机器人席位看到同一个 tick，分别提交最多 20 条指令；服务器收齐后按席位顺序执行，再统一推进 5 帧，即 0.25 秒。等待外部程序思考期间，游戏时间不推进。机器人仍由服务器控制。此模式的普通游戏指令必须放入 `/decisions`，不能直接发往 `/commands`。

```http
POST /api/matches/MATCH_ID/decisions
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{"tick":0,"commands":[{"type":"train","unit":"footman"},{"type":"attackMove","units":["u10"],"x":900,"y":1000}]}
```

响应含 `{accepted,tick,waiting}`；`waiting` 是尚未提交的选手编号。空指令数组也表示完成本轮。重复提交或 tick 不匹配返回 409；条数超限返回 400。单条游戏指令被拒绝会写入下一份状态的 `lastDecision.errors`，其他合法指令仍可执行。程序应检查错误并调整策略。

下面是可保存为 `api-example.mjs`、在根目录通过 `node api-example.mjs` 运行的最小调用示例。它控制双方，仅用于展示同步协议：

```js
const base = 'http://127.0.0.1:8793';
async function request(path, body, token) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  const result = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(result));
  return result;
}
const game = await request('/api/matches', {
  mode:'lockstep', seed:1,
  players:[{name:'A',kind:'api'}, {name:'B',kind:'api'}]
});
const url = `/api/matches/${game.match}`;
await request(url+'/commands', {type:'start'}, game.seats[0].token);
const state = await request(url, undefined, game.seats[0].token);
for (const seat of game.seats) {
  await request(url+'/decisions', {
    tick:state.tick, commands:[{type:'train',unit:'footman'}]
  }, seat.token);
}
console.log(await request(url)); // tick 为 5，双方生产队列同时推进 0.25 秒
```

同步协议让外部推理耗时不计入游戏时间，但服务器本身不隔离策略程序、不调用模型，也不提供竞赛准备预算管理。真人与程序可以共享实时战局；程序间公平的思考窗口可使用同步模式。

## 当前范围与验证

这是可游玩的本地原型，单位和建筑使用程序绘制的图形。兵种数值、英雄组合和多方地图尚未经过完整的竞技平衡测试。规则电脑用于练习，不代表模型智能。服务仅监听本机；普通试玩战局保存在内存，重启服务后清空。实时战局两分钟没有观察或指令请求就停止推进，重新连接后继续；最多保留 16 个房间，满额时可回收已结束房间。当前不提供互联网匹配、账号系统或普通试玩断线存档；模型竞技赛单独持久保存完整回放。

## 模型对战与回放

双击根目录 `WatchHeroRTSBattle.bat`，或打开 <http://127.0.0.1:8794/?replay=latest>。回放支持选择历史系列、选局、暂停、0.5/1/2/4/8 倍速、拖动时间轴、倒带、切换观察阵营和查看单位技能。URL 的 `run=run-时间戳` 固定系列，新比赛不会覆盖旧回放。回放入口只读，不会替换普通试玩保存的席位。等待比赛期间自动刷新，完成的对局自动加入列表。界面提供双方中文策略自述与赛后复盘链接，并始终显示本系列的准备条件。

`hero-rts/arena/train.py` 负责模型竞赛：支持通过 `--players opus sol` 等选择已配置选手；新准备预算默认最多 30 分钟，可用 `--prepare-seconds` 调整。客户端 effort 设为 medium，模型自行选择控制方式和首发英雄；跨厂商同名 effort 不代表计算量相同。`--incumbent sol --from-run <旧系列目录>` 可让 Sol 沿用原冻结策略，挑战者从零准备，同时分享相同历史公开回放。这种挑战赛的起点与准备条件会明确记录，不作为同预算从零对比。每轮冻结策略后交换出生位置打两局。每 0.25 游戏秒同时观察、各提交最多 20 条命令，双方提交前时钟不推进。策略程序每次响应硬上限 5 秒；崩溃、超时或非法响应记技术负，和游戏内获胜分开报告。普通非法游戏命令则拒绝并返回错误，不直接判负。

参赛程序在 WSL Bubblewrap 隔离工作区运行，双方看不到对方文件；比赛执行阶段工作区只读、无网络，也不挂载模型凭据。公开规则源码去掉内置规则电脑，裁判不会替选手写策略。模型的准备日志、调用配置、用量、冻结文件哈希、隔离探针、所有命令与每个决策窗口的战场快照保存在 `hero-rts/arena/control/run-时间戳/`。回放为 `r1-g1.json.gz` 等压缩文件，`results.json` 为摘要。

让双方从各自上一版继续改进，可运行 `python hero-rts/arena/train.py --players opus sol --continue-both --from-run hero-rts/arena/control/<旧系列目录名> --rounds 3 --prepare-seconds 1800`。双方每轮先复盘最新公开记录，再分别迭代；3轮共6局，每轮两局换边期间策略冻结。新系列保留上一版的哈希基线、各自私人文件和相同的完整历史公开回放，不向任何选手提供对方源码。中文说明页面按轮保留所有提交的复盘与改进记录。

`node hero-rts/arena/audit.js <比赛目录>` 可从初始状态重新执行全部双方命令，逐帧核对回放，并核验引擎、兵种目录及冻结策略哈希。对局结果衡量本次策略在此原型规则下的表现，不是模型综合能力排名。

在根目录执行：

```powershell
node --test tests/hero-rts.test.js tests/hero-rts-api.test.js
```

测试覆盖资源耗尽与交纳守恒、命令原子拒绝、建筑和科技依赖、英雄名额与复活、全部 56 个技能的实际效果、延迟范围伤害躲避、控制打断、对空和基地开火、圣坛争夺、暂停和胜负、8 方地形边界、确定性，以及 HTTP 身份隔离和同步决策。根目录 `npm test` 同时运行旧项目测试。
