# 3V3 足球 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8802/?replay=latest&run=run-20261022-100804)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分（局）：deepseek-flash **0** · sol **4**。
总进球：deepseek-flash **1** · sol **12**。



## 对局

| 对局 | 人数 | 座位（左/右） | 胜者 | 比分（座位序） | 帧数 | 模拟秒数 | 用时(秒) |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| [r1-g1](http://127.0.0.1:8802/?replay=r1-g1&run=run-20261022-100804) | 2v2 | deepseek-flash / sol | sol | 0:1 | 2598 | 129.9 | 2.11 |
| [r1-g2](http://127.0.0.1:8802/?replay=r1-g2&run=run-20261022-100804) | 1v1 | sol / deepseek-flash | sol | 4:1 | 2401 | 120.0 | 1.59 |
| [r2-g1](http://127.0.0.1:8802/?replay=r2-g1&run=run-20261022-100804) | 3v3 | deepseek-flash / sol | sol | 0:6 | 2401 | 120.0 | 3.53 |
| [r2-g2](http://127.0.0.1:8802/?replay=r2-g2&run=run-20261022-100804) | 5v5 | sol / deepseek-flash | sol | 1:0 | 2401 | 120.0 | 5.57 |

## 机制生效情况

总射门/踢球：69 : 71；控球帧数：1428 : 949。
犯规：0 : 0；守门员扑救：4 : 5。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 12521050 | 226200 |
| 1 | gpt-6.1-sol | program | 558071 | 12751 |
| 2 | deepseek-v4.1-flash | program | 12974975 | 194504 |
| 2 | gpt-6.1-sol | program | 1904661 | 16614 |
| 3 | gpt-6.1-sol | program | 953423 | 12979 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/deepseek-flash?run=run-20261022-100804)
- [sol 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/sol?run=run-20261022-100804)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐物理帧重演核验通过：重新执行全部单位输入，每个存档帧与终局都与存档一致；引擎、规则目录与冻结提交的哈希均通过。

- `results.json`：胜负、进球比分、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整球场快照与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
