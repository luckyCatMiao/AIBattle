# 爆破模式 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8800/?replay=latest&run=run-20261021-131353)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分：deepseek-flash **2** · sol **4**。



## 对局

| 对局 | 座位（左/右） | 胜者 | 回合比分（座位序） | 逐回合结果 | 帧数 | 用时(秒) |
| --- | --- | --- | ---: | --- | ---: | ---: |
| [r1-g1](http://127.0.0.1:8800/?replay=r1-g1&run=run-20261021-131353) | deepseek-flash / sol | sol | 0:4000 | GPT-6.1 Sol·进攻方全灭·16s / GPT-6.1 Sol·拆除炸弹·36s / GPT-6.1 Sol·进攻方全灭·10s / GPT-6.1 Sol·防守方全灭·28s | 1797 | 2.29 |
| [r1-g2](http://127.0.0.1:8800/?replay=r1-g2&run=run-20261021-131353) | sol / deepseek-flash | sol | 4000:1000 | GPT-6.1 Sol·防守方全灭·32s / GPT-6.1 Sol·防守方全灭·26s / DeepSeek V4.1 Flash·拆除炸弹·34s / GPT-6.1 Sol·进攻方全灭·20s / GPT-6.1 Sol·进攻方全灭·17s | 2577 | 3.2 |
| [r2-g1](http://127.0.0.1:8800/?replay=r2-g1&run=run-20261021-131353) | deepseek-flash / sol | sol | 0:4000 | GPT-6.1 Sol·拆除炸弹·32s / GPT-6.1 Sol·拆除炸弹·33s / GPT-6.1 Sol·拆除炸弹·32s / GPT-6.1 Sol·防守方全灭·36s | 2673 | 3.72 |
| [r2-g2](http://127.0.0.1:8800/?replay=r2-g2&run=run-20261021-131353) | sol / deepseek-flash | sol | 4000:0 | GPT-6.1 Sol·防守方全灭·37s / GPT-6.1 Sol·防守方全灭·9s / GPT-6.1 Sol·防守方全灭·10s / GPT-6.1 Sol·进攻方全灭·15s | 1409 | 1.8 |
| [r3-g1](http://127.0.0.1:8800/?replay=r3-g1&run=run-20261021-131353) | deepseek-flash / sol | deepseek-flash | 4000:2000 | GPT-6.1 Sol·时间到·100s / GPT-6.1 Sol·进攻方全灭·14s / DeepSeek V4.1 Flash·防守方全灭·26s / DeepSeek V4.1 Flash·拆除炸弹·41s / DeepSeek V4.1 Flash·拆除炸弹·37s / DeepSeek V4.1 Flash·进攻方全灭·12s | 4615 | 5.8 |
| [r3-g2](http://127.0.0.1:8800/?replay=r3-g2&run=run-20261021-131353) | sol / deepseek-flash | deepseek-flash | 0:4000 | DeepSeek V4.1 Flash·拆除炸弹·43s / DeepSeek V4.1 Flash·拆除炸弹·33s / DeepSeek V4.1 Flash·进攻方全灭·13s / DeepSeek V4.1 Flash·防守方全灭·14s | 2068 | 2.23 |

## 机制生效情况

回合结束方式分布：拆除炸弹 9 · 防守方全灭 9 · 进攻方全灭 8 · 时间到 1。
平均回合时长 28.0 秒（未下包上限 100 秒）。
记录到的购买提交：0 次。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 17322493 | 308311 |
| 1 | gpt-6.1-sol | program | 1127245 | 16032 |
| 2 | deepseek-v4.1-flash | program | 11297342 | 154648 |
| 2 | gpt-6.1-sol | program | 1076870 | 13327 |
| 3 | deepseek-v4.1-flash | program | 7244675 | 99001 |
| 3 | gpt-6.1-sol | program | 1962223 | 17235 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8800/api/arena/reviews/deepseek-flash?run=run-20261021-131353)
- [sol 策略及赛后复盘](http://127.0.0.1:8800/api/arena/reviews/sol?run=run-20261021-131353)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

逐物理帧重演核验通过：从购买阶段重新应用全部购买、重新执行全部单位输入，每个存档帧与终局都与存档一致；引擎、规则目录与冻结提交的哈希均通过。

- `results.json`：胜负、回合比分、逐回合结果、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整战场快照、购买记录与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
