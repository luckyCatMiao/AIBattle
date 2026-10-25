# 3V3 足球 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8802/?replay=latest&run=run-20261021-234445)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分（局）：deepseek-flash **1** · sol **2**。
总进球：deepseek-flash **8** · sol **8**。



## 对局

| 对局 | 人数 | 座位（左/右） | 胜者 | 比分（座位序） | 帧数 | 模拟秒数 | 用时(秒) |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| [r1-g1](http://127.0.0.1:8802/?replay=r1-g1&run=run-20261021-234445) | 2v2 | deepseek-flash / sol | sol | 0:1 | 2401 | 120.0 | 1.22 |
| [r1-g2](http://127.0.0.1:8802/?replay=r1-g2&run=run-20261021-234445) | 1v1 | sol / deepseek-flash | sol | 7:6 | 2401 | 120.0 | 1.17 |
| [r2-g1](http://127.0.0.1:8802/?replay=r2-g1&run=run-20261021-234445) | 3v3 | deepseek-flash / sol | deepseek-flash | 2:0 | 2401 | 120.0 | 2.11 |
| [r2-g2](http://127.0.0.1:8802/?replay=r2-g2&run=run-20261021-234445) | 5v5 | sol / deepseek-flash | 平局 | 0:0 | 2801 | 140.1 | 3.87 |
| [r3-g1](http://127.0.0.1:8802/?replay=r3-g1&run=run-20261021-234445) | 6v6 | deepseek-flash / sol | 平局 | 0:0 | 2801 | 140.1 | 24.33 |
| [r3-g2](http://127.0.0.1:8802/?replay=r3-g2&run=run-20261021-234445) | 4v4 | sol / deepseek-flash | 平局 | 0:0 | 2801 | 140.1 | 9.54 |

## 机制生效情况

总射门/踢球：174 : 200；控球帧数：2934 : 2460。
犯规：0 : 0；守门员扑救：33 : 40。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 23853648 | 295531 |
| 1 | gpt-6.1-sol | program | 682101 | 11741 |
| 2 | deepseek-v4.1-flash | program | 21563312 | 259357 |
| 2 | gpt-6.1-sol | program | 632184 | 11130 |
| 3 | deepseek-v4.1-flash | program | 14059305 | 154790 |
| 3 | gpt-6.1-sol | program | 2804760 | 19637 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/deepseek-flash?run=run-20261021-234445)
- [sol 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/sol?run=run-20261021-234445)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐物理帧重演核验通过：重新执行全部单位输入，每个存档帧与终局都与存档一致；引擎、规则目录与冻结提交的哈希均通过。

- `results.json`：胜负、进球比分、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整球场快照与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
