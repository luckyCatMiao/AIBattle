# 铁拳谱 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8835/?replay=latest&run=run-20261024-105202)**。支持选系列、选局、暂停、倍速、拖动时间轴与观察阵营切换。

系列比分：deepseek-flash **0** · sol **6**。



## 对局

| 对局 | 座位（先/后） | 出场顺序 | 胜者 | 帧数 | 用时(秒) | deepseek-flash | sol 得分 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| [r1-g1](http://127.0.0.1:8835/?replay=r1-g1&run=run-20261024-105202) | deepseek-flash / sol |  | sol | 333 | 16.01 | 996 | 2534 |
| [r1-g2](http://127.0.0.1:8835/?replay=r1-g2&run=run-20261024-105202) | sol / deepseek-flash |  | sol | 260 | 12.26 | 696 | 3014 |
| [r2-g1](http://127.0.0.1:8835/?replay=r2-g1&run=run-20261024-105202) | deepseek-flash / sol |  | sol | 455 | 65.02 | 1686 | 3121 |
| [r2-g2](http://127.0.0.1:8835/?replay=r2-g2&run=run-20261024-105202) | sol / deepseek-flash |  | sol | 395 | 54.61 | 2623 | 2266 |
| [r3-g1](http://127.0.0.1:8835/?replay=r3-g1&run=run-20261024-105202) | deepseek-flash / sol |  | sol | 313 | 15.99 | 1351 | 3350 |
| [r3-g2](http://127.0.0.1:8835/?replay=r3-g2&run=run-20261024-105202) | sol / deepseek-flash |  | sol | 255 | 12.48 | 1024 | 4195 |

## 提交与用量

| 轮次 | 模型 | 控制方式 | 出场顺序 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | vex / kestrel / aegis | 39824104 | 255692 |
| 1 | gpt-6.1-sol | program | kestrel / aegis / vex | 0 | 0 |
| 2 | deepseek-v4.1-flash | program | vex / kestrel / aegis | 33185800 | 174567 |
| 2 | gpt-6.1-sol | program | kestrel / aegis / vex | 0 | 0 |
| 3 | deepseek-v4.1-flash | program | vex / kestrel / aegis | 14108522 | 101582 |
| 3 | gpt-6.1-sol | program | kestrel / aegis / vex | 0 | 0 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8835/api/arena/reviews/deepseek-flash?run=run-20261024-105202)
- [sol 策略及赛后复盘](http://127.0.0.1:8835/api/arena/reviews/sol?run=run-20261024-105202)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐帧重演核验通过：从初始状态重新执行全部双方输入，每一个快照与终局结果都与存档一致；引擎、角色目录与冻结提交的哈希均通过。

- `results.json`：胜负、得分、帧数与用时。
- `r*-g*.json.gz`：每个决策窗口的全场快照、双方逐帧输入与最终结果。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列只比较这次准备产生的策略在当前帧数据下的表现。6 局样本不能证明模型的综合能力高低。公开页面只发布回放和中文说明，不提供私有策略源码。
