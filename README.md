# AIBattle · 模型对战竞技场

让不同厂商的大模型**各自编写策略程序**，在同一套裁判、同一套规则下打游戏比高低。

仓库内置 **11 个游戏**，全部是零依赖 Node.js（≥ 20），不需要 `npm install`。
每局比赛都是 **20 Hz 定步长确定性模拟**，逐物理帧存档，可以用 `audit.js` 重演校验。

![五子棋](preview.jpg)

---

## 游戏一览

| # | 游戏 | 玩法 | 启动 | 试玩地址 | 观战回放 |
|---|---|---|---|---|---|
| 1 | 五子棋 | 15×15 自由五子，逐局交换黑白 | `Start.bat` | <http://127.0.0.1:8787/> | 页面内回放 |
| 2 | 前线争夺 RTS | 即时战略，2–8 方混战 | `StartRTS.bat` | <http://127.0.0.1:8788/> | `WatchRTSBattle.bat`（8789） |
| 3 | 灰烬王座 | 英雄战争，三级时代 / 10 英雄 / 16 兵种 | `StartHeroRTS.bat` | <http://127.0.0.1:8793/> | `WatchHeroRTSBattle.bat`（8794） |
| 4 | 铁拳谱 | 1v1 帧精确格斗，三人车轮战 | `StartFighting.bat` | <http://127.0.0.1:8795/> | `WatchFightingBattle.bat`（8796） |
| 5 | 泡泡堂 | 2–4 人炸弹对战，破坏软墙掉道具 | `StartBomber.bat` | <http://127.0.0.1:8797/> | `WatchBomberBattle.bat`（8798） |
| 6 | 爆破模式 | 5v5 战术射击，随机大地图 / 逐单位视野 / CS 经济 | `StartDefusal.bat` | <http://127.0.0.1:8799/> | `WatchDefusalBattle.bat`（8800） |
| 7 | 3V3 足球 | 每队 1–6 人随机 / 实体足球 / 红牌罚下 | `StartSoccer.bat` | <http://127.0.0.1:8801/> | `WatchSoccerBattle.bat`（8802） |
| 8 | 俯视角赛车 | 每局随机赛道 / 漂移蓄能喷火 / 车车碰撞 | `StartRacing.bat` | <http://127.0.0.1:8805/> | `WatchRacingBattle.bat`（8806） |
| 9 | 横版羽毛球 | 侧视 1v1 / 起跳杀球 / 体力·蓄力·冲刺 | `StartBadminton.bat` | <http://127.0.0.1:8808/> | `WatchBadmintonBattle.bat`（8809） |
| 10 | 横版闯关竞速 | 随机迷宫关卡 / 推人 / 怪物 / 机关 | `StartPlatformer.bat` | <http://127.0.0.1:8814/> | `WatchPlatformerBattle.bat`（8815） |
| 11 | 无尽弹墙对决 | 1v1 弹墙射击，一枪致命，子弹永不消失 | `StartDuel.bat` | <http://127.0.0.1:8817/> | `WatchDuelBattle.bat`（8818） |

各游戏的完整规则与 AI 接口文档：

[前线争夺](rts/README.md) · [灰烬王座](hero-rts/README.md) · [铁拳谱](fighting/README.md) ·
[泡泡堂](bomber/README.md) · [爆破模式](defusal/README.md) · [3V3 足球](soccer/README.md) ·
[俯视角赛车](racing/README.md) · [横版羽毛球](badminton/README.md) ·
[横版闯关竞速](platformer/README.md) · [无尽弹墙对决](duel/README.md)

---

## 竞技框架：为什么这些对局可以复核

每个游戏目录下的 `arena/` 是同一套流水线，不是各写各的：

| 机制 | 做法 |
|---|---|
| **唯一权威引擎** | `arena/referee.js` 是唯一持有规则的进程。选手程序只通过 stdin 收观察、经 stdout 交输入，拿不到裁判内部状态 |
| **定步长确定性** | 固定 20 Hz、固定决策窗口；同一份输入序列必然得到同一份结果，与机器快慢无关 |
| **逐物理帧存档** | 每局保存 `r*-g*.json.gz`：完整快照 + 逐窗口输入 + 终局，可离线重放 |
| **重演审计** | `arena/audit.js` 用存档里的种子与输入重新跑一遍，逐帧比对哈希，并校验引擎/规则/冻结提交的哈希 |
| **冻结提交** | `freeze()` 在准备结束时把选手工作区复制成只读快照并记录逐文件哈希；比赛只跑这份快照 |
| **座位交换** | 每轮同一套双方各打一局、交换先手，抵消位置优势 |
| **公开记录** | 每轮把上一轮战报与回放发回双方工作区，选手只能看到与自己相同的公开信息 |

回放是**逐物理帧**的：服务端用存档里的种子与逐窗口输入在 `/api/arena/games/:id?full=1` 里按 20 Hz 重演，前端按 50 ms 播放，可以暂停、倍速、拖时间轴。

---

## 快速开始

要求：**Node.js ≥ 20**。没有任何第三方依赖。

```bash
git clone https://github.com/luckyCatMiao/AIBattle.git
cd AIBattle

node server.js              # 五子棋       8787
node rts/server.js          # 前线争夺     8788
node hero-rts/server.js     # 灰烬王座     8793
node fighting/server.js     # 铁拳谱       8795
node bomber/server.js       # 泡泡堂       8797
node defusal/server.js      # 爆破模式     8799
node soccer/server.js       # 3V3 足球     8801
node racing/server.js       # 俯视角赛车   8805
node badminton/server.js    # 横版羽毛球   8808
node platformer/server.js   # 横版闯关     8814
node duel/server.js         # 无尽弹墙对决 8817
```

Windows 下直接双击对应的 `.bat` 也行。所有服务默认只监听 `127.0.0.1`。

### 本地试玩

打开对应地址即可人机对战，操作方式见各游戏 README（例如对决是 WASD 移动、方向键瞄准、空格开火）。

### 观战历史回放

仓库自带各游戏的历史对局存档（`*/arena/control/run-*/`）。启动对应的 `Watch*Battle.bat` 后：

```
http://127.0.0.1:8818/?replay=latest&run=run-20261026-115901   # 最近一局
http://127.0.0.1:8818/?replay=r2-g1&run=run-20261026-115901     # 指定局
```

页面右侧可以选系列、选局，支持暂停、倍速与拖动时间轴。

---

## 模型评测（需要自带 key）

评测脚本用 **Claude Code CLI** 起一个真实会话，让模型阅读规则、写下策略程序、自测，然后由裁判驱动正式对局。

```bash
# 通用形式
python <game>/arena/train.py --players <A> <B> --rounds 3 --port <空闲端口>

# 例：3V3 足球，deepseek-flash 对 sol，3 轮
python soccer/arena/train.py --players deepseek-flash sol --rounds 3 --port 8825 --no-isolation
```

- 可用选手名：`sol`、`luna`、`astra`、`opus`、`deepseek-flash`、`deepseek`（模型 ID 见各 `arena/train.py` 顶部的 `CATALOG`）。
- `--port` 只做占用检查，避免与其他服务冲突。
- 准备时间默认**不设上限**（`--prepare-seconds 0`）；网关假死由停滞看门狗兜底（连续 10 分钟无输出即重试）。

### 两种执行方式

| 模式 | 隔离 | 凭据位置 | 适用 |
|---|---|---|---|
| 默认 | **WSL2 + bubblewrap**：选手只能在 `/workspace` 里活动，工作区只读、无网络 | WSL 内每名选手的私有 home | 想真正防读对方代码 |
| `--no-isolation` | 本机直跑，仅靠**赛前约定**不读取对方工作区 | 系统临时目录，结束后删除 | 不想装 WSL、或本机跑更稳 |

评测流程会把宿主 Claude Code 的配置写给每名选手的**私有 home**，凭据不进入项目目录、日志或回放。

### 现任者模式（冻结对手）

```bash
python <game>/arena/train.py --players deepseek-flash sol --rounds 3 \
  --incumbent sol --from-run <旧系列目录> --source-round 3 --no-isolation
```

被指定的现任者**整个系列 0 次模型调用**：直接把上一系列第 N 轮的冻结提交搬过来只读使用，只有挑战者在迭代。

---

## 目录结构

```
.
├─ server.js / public/            五子棋服务与网页
├─ rts/ hero-rts/ fighting/       竞技游戏：catalog.js（规则与参数）、simulation.js（引擎）、
│  bomber/ defusal/ soccer/        server.js（页面与本地对战）、public/（前端）、
│  racing/ badminton/              arena/（referee.js 裁判、audit.js 重演校验、
│  platformer/ duel/                 train.py 评测编排、report.py 中文战报、http.js 回放服务）
├─ tests/                         Node 测试：规则、胜负、确定性、API 权限、回放审计、隔离边界
├─ writing-bench/                 写作/对战评测工具（可选，需 Python）
├─ training/                      早期训练脚本
└─ */arena/control/run-*/         历史对局存档与回放
```

---

## 测试

```bash
npm test        # node --test tests/*.test.js
```

覆盖各游戏规则与胜负判定、帧精确推进、回放重演一致性、HTTP API 权限边界与隔离探针。

---

## 安全与隐私

**这个仓库里没有任何 API key。**

- 评测所需的凭据只来自**你自己的机器**：`~/.claude/settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN`（或等价的环境变量），在评测开始时读取，写进临时/隔离的私有 home，进程结束后删除。
- `.gitignore` 明确排除：`data/`、`players/`、凭据探针脚本、历史路径 bug 生成的目录（名字里带 `aibattle-tools` 的那类），以及选手工作区里上百 MB 的分析产物与一次性实验目录。
- 维护时做过的核查（可用同样命令复现）：

  ```bash
  # 1) 当前提交里有没有真实凭据值
  git grep -I -n "ANTHROPIC_AUTH_TOKEN" HEAD -- "*.json" "*.py" "*.js" "*.md"

  # 2) 全部历史提交里有没有常见密钥格式
  git rev-list --all | while read c; do
    git grep -I -l -E "sk-[A-Za-z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |OPENSSH )?PRIVATE KEY" \
      $c -- "*.json" "*.py" "*.js" "*.md" "*.txt";
  done

  # 3) 直接拿本地真实 token 去仓库里搜（不打印 token 本身）
  git grep -I -l -F -f <只含 token 的临时文件> origin/main
  ```

  上述检查当前均为空：**HEAD、`origin/main` 与 6 次历史提交中都没有出现任何真实凭据**。

- `training/control/run-*/private-credentials-*.json` 是五子棋**对局席位 token**（本地临时对局的 join 凭据，早已失效），不是模型 API 凭据。
- 本机直跑模式（`--no-isolation`）只靠口头约定隔离，**不是安全沙箱**；需要强隔离请用默认的 WSL2 + bubblewrap 模式。

---

## 已知限制

- 每个系列是**相关样本**：同一批准备产生的策略打几局，不能据此推断模型的综合能力。
- 同名 `reasoning_effort` 不代表跨厂商的实际推理投入相同。
- 对局全部在本机运行，默认只监听 `127.0.0.1`，不是公网竞赛平台。
- 引擎改动会使旧系列的 `audit.js` 拒绝重演（哈希校验），但旧回放仍可正常播放。

---

## 五子棋 HTTP API

`GET /api/state`：公开对局与系列赛列表。
`GET /api/games/{id}`：完整棋盘、棋谱与结果（`board[y][x]`，0=空、1=黑、2=白）。
`POST /api/games`：创建真人对局，返回双方 token。
`POST /api/tournaments`：创建 AI 系列赛，`{"players":[{"name":"gpt-6-luna"},{"name":"gpt-6.1-sol"}],"rounds":6}`。

带 `Authorization: Bearer <token>` 的席位接口：

- `GET /api/agent/state`：自己的席位、是否轮到自己、当前棋盘与系列赛状态；
- `POST /api/move`：`{"matchId":"…","ply":0,"x":7,"y":7}`，每次一手。

传输助手：

```bash
python client.py --token YOUR_TOKEN observe --wait 25
python client.py --token YOUR_TOKEN move --match MATCH_ID --ply 0 --at H8
```

15×15，黑先，横/竖/斜连续至少五子获胜，无禁手；系列赛逐局交换黑白。
