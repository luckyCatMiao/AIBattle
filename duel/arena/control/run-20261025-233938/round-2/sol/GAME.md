# 无尽弹墙对决 · RICOCHET DUEL

两名玩家在一个封闭场地里对射。**移动速度远快于子弹，单发子弹可以靠走位躲开**；
**子弹永不消失**，撞墙只反射，所以场上子弹会越来越多，谁先被碰到谁就死。

- 游戏服务：<http://127.0.0.1:8817/>（`StartDuel.bat` / `npm run duel`）
- 观战回放：<http://127.0.0.1:8818/>（`WatchDuelBattle.bat`）

## 比赛

| 项目 | 数值 |
|---|---|
| 场地 | 40 × 30 格，四周是墙，场内有旋转对称的掩护柱 |
| 推进 | 20 Hz，每 3 帧（150 ms）一个决策窗口 |
| 玩家 | 半径 0.45，速度 **13 格/秒** |
| 子弹 | 半径 0.22，速度 **8.5 格/秒**，永不消失、完全弹性反射 |
| 开火 | 每次开火后 **1.2 秒**冷却（一发一发打） |
| 胜负 | 被对方任意子弹碰到即负；120 秒内双方都活着判平局 |

## 本地对战

`StartDuel.bat` / `npm run duel`：**WASD** 移动，**方向键**瞄准，**空格**开火。
你（蓝）对阵练习电脑（橙）。练习电脑会躲最近的威胁子弹并在空档还击。

## 观察

```jsonc
{
  "id": "r1-g1", "frame": 120, "now": 6.0, "status": "playing", "yourPlayer": 0,
  "timeLeft": 114.0,
  "map": {"width": 40, "height": 30, "tiles": [1,1,…]},
  "players": [{"id":"p0","index":0,"alive":true,"x":5,"y":14.5,"fx":1,"fy":0,"cooldown":0,"shots":3}],
  "bullets": [{"id":"b7","owner":1,"x":22.3,"y":9.1,"vx":-6.0,"vy":6.0,"speed":8.5,"bounces":2}],
  "events": [{"id":9,"t":5.2,"frame":104,"type":"fire","owner":0}]
}
```

## 输入

每个窗口 3 帧：

```json
{"inputs":[{"dir":"R","aim":"R","fire":false},{"dir":"R","aim":"R","fire":true},{"dir":"UR","aim":"R","fire":false}]}
```

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `dir` | N/U/D/L/R/UL/UR/DL/DR | 移动方向 |
| `aim` | 同上或 null | 瞄准方向（null=沿用当前朝向） |
| `fire` | 布尔 | 冷却结束时开火 |

## 程序协议

```json
{"mode":"program","command":["python3","agent.py"]}
```

程序通过 stdin 每行接收观察，向 stdout 输出一行 JSON 并 flush。单次响应硬上限 **5 秒**。

## 竞技评测

```bash
python duel/arena/train.py --players deepseek-flash sol --rounds 3 --port 8819 --no-isolation
```

- 每轮 2 局，双方交换座位；每局重新开一局。
- 准备阶段默认不设超时；本机直跑模式只把宿主 Claude Code 配置写进临时目录。
- 回放逐物理帧存档（`r*-g*.json.gz`），`arena/audit.js` 会重新执行全部输入并逐帧比对。
