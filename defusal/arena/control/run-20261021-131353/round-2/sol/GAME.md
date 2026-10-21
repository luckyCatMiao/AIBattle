# 爆破模式 / BOMB DEFUSAL

一个无需安装依赖的网页 **5v5 俯视战术射击** 游戏。双击项目根目录 `StartDefusal.bat`，或运行 `npm run defusal` 后打开 <http://127.0.0.1:8799/>。

两名 AI（或本机玩家 + 4 个 AI 队友）各指挥 **5 个单位**：每回合一方进攻、一方防守，3 回合后交换阵营。**每个单位有独立视野**（视锥 + 近身、墙体遮挡），没有全队共享真视；武器不在场上刷新，而是每回合按 CS 式经济**自行购买**。地图 **56×34**，每场比赛用种子**随机生成**一张左右镜像的大图（出生点/包点连通性自检）。

## 本地练习

页面默认「你 + 4 个 AI 队友 vs 5 个 AI」。你控制 1 号单位，其余 4 名队友和敌方 5 人由练习电脑控制。

| 操作 | 按键 |
| --- | --- |
| 移动 | `W` `A` `S` `D`（八方向） |
| 瞄准 | 鼠标方向（八方向） |
| 开火 | 自动：视野、朝向、射程内出现敌人即射击 |
| 下包 / 拆包 | 站在包点或炸弹旁保持不动，自动进行 |

每回合开始先进入**购买阶段**：右侧点「推荐购买并开始」会自动给 5 个单位买当前买得起的最好武器/护甲；也可以存钱。AI 对手会在同一阶段自行购买。

## 规则要点

- **生命 100**；护甲吸收 50% 伤害并损耗。阵亡后本回合不再行动。
- **武器全部发射可见的实体子弹**：手枪、冲锋枪、步枪、霰弹、狙击、机枪的子弹速度 6.5–13 格/秒，明显慢于旧版即时命中；角色可以用走位或侧移躲开。子弹会被掩体挡住。
- **视野**：每个单位前方约 100° 视锥、8 格；近身 2 格 360° 感知；墙体遮挡视线与射击。
- **武器**（购买后本回合/存活跨回合保留，阵亡后回手枪）：
  - 手枪：免费、无限备用弹药
  - 微型冲锋枪 $700 / 冲锋枪 $1250 / 步枪 $2700 / 霰弹枪 $1000 / 狙击枪 $4750 / 机枪 $4000
  - 护甲 $650；防守方拆弹器 $400（拆包 5s → 2.5s）
- **经济**：初始 $800/单位；击杀 +$300；回合胜 +$3250、负 +$1900；下包/拆包 +$300。
  存活单位保留武器/护甲；阵亡后下一回合回手枪。第 4 回合半场交换阵营，经济与武器重置。
- **炸弹**：进攻方 1 号单位携带。携带者在 A/B 包点内静止 3 秒下包；炸弹倒计时 40 秒。
  防守方在炸弹 1 格内静止 5 秒（拆弹器 2.5 秒）拆除；移动会重置进度。
- **回合**：未下包 100 秒；时间到防守方胜；炸弹爆炸进攻方胜，拆除防守方胜；
  一方全灭的胜负判定见 `arena/RULES.md`。
- **赛制**：每场 6 回合（3 攻 + 3 守），先赢 4 回合；3:3 平局。

## 地图与公平性

地图左右镜像，两个包点 A/B；每局开局跑一次自检：

```json
{"asymmetric":0, "walls":598, "spawnBlocked":0, "siteOpen":true, "sitesReachable":true, "defendReachable":true, "fair":true}
```

## 外部程序 API

服务端以固定 20 Hz 推进。创建对局：

```http
POST /api/matches
Content-Type: application/json

{"players":[{"name":"Agent A","kind":"api"},{"name":"Agent B","kind":"api"}],"seed":1,"mode":"lockstep"}
```

响应 `{match, seats:[{player,token}], state}`。`state` 是**自己队伍的视野**（5 个单位 + `visibleEnemies`）；无凭据 GET 才是完整观战。

```http
GET /api/catalog                  # 规则、武器、购买价格、包点
GET /api/matches/MATCH_ID         # 有 Bearer：己方视野；无凭据：完整观战
```

### 购买阶段

```http
POST /api/matches/MATCH_ID/buy
Authorization: Bearer YOUR_TOKEN

{"buys":[{"unit":0,"weapon":"rifle","armor":true,"kit":false}, …]}
```

双方都提交后自动进入 `live`；买不起/非法条目忽略。提交空数组表示存钱。

### 比赛阶段

```http
POST /api/matches/MATCH_ID/decisions
Authorization: Bearer YOUR_TOKEN

{"inputs":[[{"dir":"R","aim":"U"}, … 5 个单位 …], … 共 20 帧 …]}
```

`dir` / `aim`：`N/U/D/L/R/UL/UR/DL/DR`。开火、换弹、下包、拆包均自动。
不足 20 帧补中立；超过 20 帧或名称非法整条拒绝；同一窗口重复提交 `409`。

真人练习使用逐帧 `/step`：

```http
POST /api/matches/MATCH_ID/step
{"input":{"dir":"R","aim":"U"}}
```

观察字段：`phase`（buy/live）、`round`、`roundWins`、`sides`、`timeLeft`/`bombTimer`、`bomb`（按队伍过滤）、`units`（己方 5 人完整状态）、`visibleEnemies`（每个单位各自看到的敌人）、`bullets`（己方子弹 + 己方视野内看到的敌方子弹）、`map.tiles`、`map.sites`、`weapons`、`buyable`、`rules`。

## 模型对战与回放

双击 `WatchDefusalBattle.bat`，或打开 <http://127.0.0.1:8800/?replay=latest>。回放按**逐物理帧**存档（20 Hz），支持选系列、选局、暂停、倍速、拖动时间轴。存档把地图/规则抽到文件顶层，逐帧只存动态状态。

```powershell
python defusal/arena/train.py --players deepseek-flash sol --rounds 3 --port 8799
```

每轮冻结策略后打两场；每场 6 回合。准备阶段默认不设时间上限，所有模型走 Claude Code CLI（effort medium）；GPT 系经本地流顺序修正代理。选手通过 stdin/stdout 交互：`phase:"buy"` 时输出 `{"buys":[…]}`，`phase:"live"` 时输出 `{"inputs":[[20 帧 × 5 单位]]}`。

参赛程序在 WSL Bubblewrap 隔离工作区运行，双方看不到对方文件；比赛执行阶段工作区只读、无网络，也不挂载模型凭据。程序单次响应硬上限 5 秒；崩溃、超时或非法响应记技术负。

`node defusal/arena/audit.js <比赛目录>` 从购买阶段重新应用全部购买、重新执行全部输入，逐物理帧核对存档，并校验引擎/冻结策略哈希。

## 验证

根目录运行 `npm test`。覆盖：地图对称与连通、5v5 出生、购买扣款与生效、逐单位视锥/近身/墙体遮挡、队伍视野过滤、护甲/伤害/击杀奖励、下包/拆包/爆炸、全灭与时间到、半场换边与经济重置、3:3 平局、20×5 输入校验、同种子确定性、练习电脑完整对局，以及 HTTP 购买/同步决策/凭据隔离/静态文件安全。
