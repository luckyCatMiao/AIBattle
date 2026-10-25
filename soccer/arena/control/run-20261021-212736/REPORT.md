# 3V3 足球 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8804/?replay=latest&run=run-20261021-212736)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分（局）：deepseek-flash **3** · sol **3**。
总进球：deepseek-flash **23** · sol **17**。



## 对局

| 对局 | 人数 | 座位（左/右） | 胜者 | 比分（座位序） | 帧数 | 模拟秒数 | 用时(秒) |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| [r1-g1](http://127.0.0.1:8804/?replay=r1-g1&run=run-20261021-212736) | 2v2 | deepseek-flash / sol | sol | 1:4 | 2401 | 120.0 | 1.23 |
| [r1-g2](http://127.0.0.1:8804/?replay=r1-g2&run=run-20261021-212736) | 1v1 | sol / deepseek-flash | deepseek-flash | 0:11 | 2401 | 120.0 | 1.07 |
| [r2-g1](http://127.0.0.1:8804/?replay=r2-g1&run=run-20261021-212736) | 3v3 | deepseek-flash / sol | deepseek-flash | 3:2 | 2401 | 120.0 | 1.32 |
| [r2-g2](http://127.0.0.1:8804/?replay=r2-g2&run=run-20261021-212736) | 5v5 | sol / deepseek-flash | sol | 4:3 | 2401 | 120.0 | 2.07 |
| [r3-g1](http://127.0.0.1:8804/?replay=r3-g1&run=run-20261021-212736) | 6v6 | deepseek-flash / sol | sol | 2:5 | 2401 | 120.0 | 2.0 |
| [r3-g2](http://127.0.0.1:8804/?replay=r3-g2&run=run-20261021-212736) | 4v4 | sol / deepseek-flash | deepseek-flash | 2:3 | 2401 | 120.0 | 1.55 |

## 机制生效情况

总射门/踢球：45 : 47；控球帧数：3140 : 4040。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 8307762 | 185104 |
| 1 | gpt-6.1-sol | program | 805189 | 15173 |
| 2 | deepseek-v4.1-flash | program | 15138167 | 220149 |
| 2 | gpt-6.1-sol | program | 1483407 | 13870 |
| 3 | deepseek-v4.1-flash | program | 6766691 | 81597 |
| 3 | gpt-6.1-sol | program | 1817505 | 19581 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8804/api/arena/reviews/deepseek-flash?run=run-20261021-212736)
- [sol 策略及赛后复盘](http://127.0.0.1:8804/api/arena/reviews/sol?run=run-20261021-212736)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐物理帧重演核验通过：重新执行全部单位输入，每个存档帧与终局都与存档一致；引擎、规则目录与冻结提交的哈希均通过。

- `results.json`：胜负、进球比分、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整球场快照与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
