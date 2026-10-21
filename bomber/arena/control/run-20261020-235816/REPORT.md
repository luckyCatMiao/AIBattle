# 泡泡堂 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8798/?replay=latest&run=run-20261020-235816)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分：deepseek-flash **4** · sol **2**。



## 对局

| 对局 | 座位（先/后） | 胜者 | 局分 | 小局结果 | 帧数 | 用时(秒) |
| --- | --- | --- | ---: | --- | ---: | ---: |
| [r1-g1](http://127.0.0.1:8798/?replay=r1-g1&run=run-20261020-235816) | deepseek-flash / sol | deepseek-flash | 3000:1000 | GPT-6.1 Sol·最后存活·57s / DeepSeek V4.1 Flash·最后存活·47s / DeepSeek V4.1 Flash·最后存活·62s / DeepSeek V4.1 Flash·最后存活·62s | 230 | 2.31 |
| [r1-g2](http://127.0.0.1:8798/?replay=r1-g2&run=run-20261020-235816) | sol / deepseek-flash | sol | 2000:1000 | 平·时间到·150s / GPT-6.1 Sol·最后存活·47s / GPT-6.1 Sol·最后存活·62s / 平·时间到·150s / DeepSeek V4.1 Flash·最后存活·64s | 475 | 5.17 |
| [r2-g1](http://127.0.0.1:8798/?replay=r2-g1&run=run-20261020-235816) | deepseek-flash / sol | sol | 0:2000 | 平·时间到·150s / 平·时间到·150s / 平·时间到·150s / GPT-6.1 Sol·最后存活·68s / GPT-6.1 Sol·最后存活·79s | 599 | 13.29 |
| [r2-g2](http://127.0.0.1:8798/?replay=r2-g2&run=run-20261020-235816) | sol / deepseek-flash | deepseek-flash | 1000:3000 | DeepSeek V4.1 Flash·最后存活·91s / 平·时间到·150s / GPT-6.1 Sol·最后存活·56s / DeepSeek V4.1 Flash·最后存活·122s / DeepSeek V4.1 Flash·最后存活·57s | 477 | 8.96 |
| [r3-g1](http://127.0.0.1:8798/?replay=r3-g1&run=run-20261020-235816) | deepseek-flash / sol | deepseek-flash | 2000:1000 | DeepSeek V4.1 Flash·最后存活·59s / DeepSeek V4.1 Flash·最后存活·43s / 平·时间到·150s / 平·时间到·150s / GPT-6.1 Sol·最后存活·51s | 455 | 8.17 |
| [r3-g2](http://127.0.0.1:8798/?replay=r3-g2&run=run-20261020-235816) | sol / deepseek-flash | deepseek-flash | 1000:2000 | GPT-6.1 Sol·最后存活·56s / 平·时间到·150s / DeepSeek V4.1 Flash·最后存活·75s / 平·时间到·150s / DeepSeek V4.1 Flash·最后存活·56s | 489 | 9.42 |

## 机制生效情况

小局结束方式分布：最后存活 19 · 时间到 10。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 15222768 | 201701 |
| 1 | gpt-6.1-sol | program | 0 | 0 |
| 2 | deepseek-v4.1-flash | program | 19583757 | 263390 |
| 2 | gpt-6.1-sol | program | 1710282 | 11987 |
| 3 | deepseek-v4.1-flash | program | 8844631 | 116149 |
| 3 | gpt-6.1-sol | program | 1512617 | 11582 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8798/api/arena/reviews/deepseek-flash?run=run-20261020-235816)
- [sol 策略及赛后复盘](http://127.0.0.1:8798/api/arena/reviews/sol?run=run-20261020-235816)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐帧重演核验通过：从初始状态重新执行全部双方输入，每一个快照与终局结果都与存档一致；引擎、规则目录与冻结提交的哈希均通过。

- `results.json`：胜负、局分、小局结果、帧数与用时。
- `r*-g*.json.gz`：每个决策窗口的全场快照、双方逐帧输入与最终结果。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两局是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
