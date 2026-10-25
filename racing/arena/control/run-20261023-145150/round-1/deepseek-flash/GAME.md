# 俯视角赛车 · RACING ARENA

双人俯视角竞速：**每一局的赛道都按种子随机生成**，漂移蓄能、喷火加速、车车碰撞。
服务端以 **20 Hz** 固定步长推进，每 **20 帧（1 秒）** 双方同时提交一次逐帧输入。

- 游戏服务：<http://127.0.0.1:8805/>（`StartRacing.bat` / `npm run racing`）
- 观战回放：<http://127.0.0.1:8806/>（`WatchRacingBattle.bat`）

## 比赛

| 项目 | 数值 |
|---|---|
| 地图 | 128×88 格，四周有墙；闭合环道路宽 6.4–8.8 格 |
| 赛道 | 每局按种子重新生成蛇形环道，约 450–650 格长（多条横向直道 + 发夹弯 + 外环回归） |
| 圈数 | 3 圈，16 个顺序检查点 |
| 时长 | 300 秒上限；先跑完 3 圈者胜 |
| 平局 | 时间到按 `progress` 判定，差 < 0.5 格判平 |
| 发车 | 1.5 秒倒计时；两车并排发车 |
| 换位 | 系列赛中双方逐局交换座位 |

## 车辆

| 参数 | 数值 |
|---|---|
| 车身半径 | 0.55 格 |
| 加速度 / 刹车 | 17 / 26 格·秒⁻² |
| 最高速度 | 常规 14，喷火时 23 格/秒 |
| 转向速率 | 满舵 3.2 弧度/秒，随车速线性生效（8 格/秒接近满舵） |
| 抓地 | 常规每帧保留 80% 侧向速度；漂移时 98.5% |
| 漂移条件 | 车速 > 4、|转向| > 0.15、在路面上 |
| 漂移收益 | 转向 ×1.6；按侧滑积蓄 `driftCharge` |
| 喷火 | 松开漂移时蓄能转入 `boostEnergy`；喷火 +30 加速度、耗能 0.6/秒 |
| 越野 | 最高速度 7、加速度 35%、额外阻力 |
| 碰撞 | 车车弹性碰撞（恢复系数 0.55），撞墙反弹 0.45 |

### 漂移 → 喷火

1. 进弯时按住 `drift` 并打方向：车尾甩出，转向变快，`driftCharge` 开始积累。
2. 出弯松开 `drift`：积累的量全部转入 `boostEnergy`（上限 1）。
3. 按住 `boost` 消耗能量喷火，最高速度从 14 提升到 23。

漂移不是免费的：抓地力下降会甩得更宽，撞墙或冲出路面都会损失大量速度。

## 观察

```jsonc
{
  "id": "r1-g1", "seed": 5011, "frame": 123, "status": "playing", "phase": "live",
  "yourPlayer": 0, "timeLeft": 64.7, "countdownLeft": 0, "laps": 3,
  "cars": [
    {"id":"p0","team":0,"index":0,"name":"A","x":12.3,"y":13.0,"angle":0.4,
     "vx":9.1,"vy":0.3,"speed":9.1,"lap":1,"nextCp":4,"progress":152.2,
     "driftCharge":0.31,"boostEnergy":0.62,"drifting":true,"boosting":false,
     "offRoad":false,"finished":false,"finishTime":null,"bestLap":21.4,
     "boosts":3,"driftTime":5.2,"collisions":0}
  ],
  "track": {"width":64,"height":44,"tiles":[…],"points":[…],"halfWidth":3.9,
            "length":107.5,"checkpoints":[…],"start":{…},"grid":[…],"audit":{…}},
  "events": [{"id":12,"t":31.2,"frame":624,"type":"lap","team":0}],
  "rules": {…}
}
```

无战争迷雾：双方看到同一块完整赛道与两辆车。

## 输入

每次提交 20 帧，每帧一辆车的输入：

```json
{"inputs":[[{"throttle":1,"steer":0.2,"drift":false,"boost":false}], … 共 20 帧 …]}
```

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `throttle` | −1 … 1 | 正=油门，负=刹车/倒车 |
| `steer` | −1 … 1 | 转向，正=顺时针 |
| `drift` | 布尔 | 漂移 |
| `boost` | 布尔 | 喷火 |

- 每帧也接受直接写对象（不包数组）；字段可省略。
- 不足 20 帧的尾部由裁判补中立；字段非法整场判技术负。

## 程序协议

```json
{"mode":"program","command":["python3","agent.py"]}
```

程序持续运行，通过 stdin 每行接收一个 JSON 观察，必须向 stdout 输出**一行** JSON 并立即 flush。
调试日志只写 stderr。单次响应硬上限 **5 秒**。

## 竞技评测

```bash
python racing/arena/train.py --players deepseek-flash sol --rounds 3 --port 8807 --no-isolation
```

- 每轮 2 局，双方交换座位；3 轮共 6 局，**每局赛道种子不同**。
- 准备阶段默认不设超时；本机直跑模式只把宿主 Claude Code 配置写进临时目录，凭据不进入项目、日志或回放。
- 受保护的规则/引擎文件做哈希校验；比赛执行时工作区只读。
- 回放逐物理帧存档（`r*-g*.json.gz`），`arena/audit.js` 会重新执行全部输入并逐帧比对。

## 本地对战

`StartRacing.bat` / `npm run racing`：W/S 油门刹车，A/D 转向，空格漂移，Shift 喷火。
你控制 0 号车，对手由练习电脑控制；点「开新局」会随机生成一条新赛道。
镜头会跟随车辆平移，右下角小地图显示整条赛道、双方车辆与下一个检查点。
