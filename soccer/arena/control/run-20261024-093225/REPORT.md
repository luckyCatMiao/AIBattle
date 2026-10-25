# 3V3 足球 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8802/?replay=latest&run=run-20261024-093225)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分（局）：deepseek-flash **0** · sol **5**。
总进球：deepseek-flash **1** · sol **16**。



## 对局

| 对局 | 人数 | 座位（左/右） | 胜者 | 比分（座位序） | 帧数 | 模拟秒数 | 用时(秒) |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| [r1-g1](http://127.0.0.1:8802/?replay=r1-g1&run=run-20261024-093225) | 2v2 | deepseek-flash / sol | sol | 0:2 | 2401 | 120.0 | 2.71 |
| [r1-g2](http://127.0.0.1:8802/?replay=r1-g2&run=run-20261024-093225) | 1v1 | sol / deepseek-flash | sol | 6:1 | 2401 | 120.0 | 1.63 |
| [r2-g1](http://127.0.0.1:8802/?replay=r2-g1&run=run-20261024-093225) | 3v3 | deepseek-flash / sol | sol | 0:3 | 2401 | 120.0 | 4.51 |
| [r2-g2](http://127.0.0.1:8802/?replay=r2-g2&run=run-20261024-093225) | 5v5 | sol / deepseek-flash | sol | 3:0 | 2401 | 120.0 | 6.64 |
| [r3-g1](http://127.0.0.1:8802/?replay=r3-g1&run=run-20261024-093225) | 6v6 | deepseek-flash / sol | 平局 | 0:0 | 2801 | 140.1 | 15.53 |
| [r3-g2](http://127.0.0.1:8802/?replay=r3-g2&run=run-20261024-093225) | 4v4 | sol / deepseek-flash | sol | 2:0 | 2401 | 120.0 | 7.42 |

## 机制生效情况

总射门/踢球：115 : 109；控球帧数：1575 : 1427。
犯规：0 : 0；守门员扑救：13 : 7。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 18644524 | 238104 |
| 1 | gpt-6.1-sol | program | 0 | 0 |
| 2 | deepseek-v4.1-flash | program | 45664004 | 255293 |
| 2 | gpt-6.1-sol | program | 0 | 0 |
| 3 | deepseek-v4.1-flash | program | 44879974 | 216623 |
| 3 | gpt-6.1-sol | program | 0 | 0 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/deepseek-flash?run=run-20261024-093225)
- [sol 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/sol?run=run-20261024-093225)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐物理帧重演核验通过：重新执行全部单位输入，每个存档帧与终局都与存档一致；引擎、规则目录与冻结提交的哈希均通过。

- `results.json`：胜负、进球比分、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整球场快照与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
