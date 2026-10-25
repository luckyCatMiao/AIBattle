# 3V3 足球 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8802/?replay=latest&run=run-20261022-200519)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分（局）：deepseek-flash **0** · sol **2**。
总进球：deepseek-flash **0** · sol **7**。



## 对局

| 对局 | 人数 | 座位（左/右） | 胜者 | 比分（座位序） | 帧数 | 模拟秒数 | 用时(秒) |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| [r1-g1](http://127.0.0.1:8802/?replay=r1-g1&run=run-20261022-200519) | 5v5 | deepseek-flash / sol | 平局 | 0:0 | 2801 | 140.1 | 10.1 |
| [r1-g2](http://127.0.0.1:8802/?replay=r1-g2&run=run-20261022-200519) | 1v1 | sol / deepseek-flash | sol | 5:0 | 2401 | 120.0 | 2.31 |
| [r2-g1](http://127.0.0.1:8802/?replay=r2-g1&run=run-20261022-200519) | 6v6 | deepseek-flash / sol | sol | 0:2 | 2401 | 120.0 | 6.39 |
| [r2-g2](http://127.0.0.1:8802/?replay=r2-g2&run=run-20261022-200519) | 4v4 | sol / deepseek-flash | 平局 | 0:0 | 2801 | 140.1 | 5.03 |

## 机制生效情况

总射门/踢球：131 : 91；控球帧数：692 : 613。
犯规：0 : 0；守门员扑救：8 : 10。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 0 | 0 |
| 1 | gpt-6.1-sol | program | 0 | 0 |
| 2 | deepseek-v4.1-flash | program | 18601151 | 125723 |
| 2 | gpt-6.1-sol | program | 705329 | 5882 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/deepseek-flash?run=run-20261022-200519)
- [sol 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/sol?run=run-20261022-200519)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

**注意：本次没有通过逐帧重演核验**，请查看 audit.json。

- `results.json`：胜负、进球比分、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整球场快照与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
