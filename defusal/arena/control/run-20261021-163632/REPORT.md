# 爆破模式 · deepseek-flash 对战 sol

**[打开交互回放](http://127.0.0.1:8802/?replay=latest&run=run-20261021-163632)**。支持选系列、选局、暂停、倍速、拖动时间轴。

系列比分：deepseek-flash **4** · sol **2**。



## 对局

| 对局 | 座位（左/右） | 胜者 | 回合比分（座位序） | 逐回合结果 | 帧数 | 用时(秒) |
| --- | --- | --- | ---: | --- | ---: | ---: |
| [r1-g1](http://127.0.0.1:8802/?replay=r1-g1&run=run-20261021-163632) | deepseek-flash / sol | deepseek-flash | 4000:0 | DeepSeek V4.1 Flash·防守方全灭·30s / DeepSeek V4.1 Flash·防守方全灭·25s / DeepSeek V4.1 Flash·防守方全灭·25s / DeepSeek V4.1 Flash·时间到·100s | 3596 | 7.17 |
| [r1-g2](http://127.0.0.1:8802/?replay=r1-g2&run=run-20261021-163632) | sol / deepseek-flash | sol | 4000:2000 | DeepSeek V4.1 Flash·拆除炸弹·51s / DeepSeek V4.1 Flash·拆除炸弹·40s / GPT-6.1 Sol·防守方全灭·19s / GPT-6.1 Sol·拆除炸弹·41s / GPT-6.1 Sol·进攻方全灭·11s / GPT-6.1 Sol·拆除炸弹·33s | 3901 | 8.23 |
| [r2-g1](http://127.0.0.1:8802/?replay=r2-g1&run=run-20261021-163632) | deepseek-flash / sol | deepseek-flash | 4000:0 | DeepSeek V4.1 Flash·防守方全灭·39s / DeepSeek V4.1 Flash·防守方全灭·34s / DeepSeek V4.1 Flash·防守方全灭·34s / DeepSeek V4.1 Flash·拆除炸弹·41s | 2965 | 3.32 |
| [r2-g2](http://127.0.0.1:8802/?replay=r2-g2&run=run-20261021-163632) | sol / deepseek-flash | deepseek-flash | 1000:4000 | DeepSeek V4.1 Flash·拆除炸弹·48s / DeepSeek V4.1 Flash·拆除炸弹·36s / GPT-6.1 Sol·防守方全灭·15s / DeepSeek V4.1 Flash·防守方全灭·28s / DeepSeek V4.1 Flash·防守方全灭·32s | 3180 | 3.76 |
| [r3-g1](http://127.0.0.1:8802/?replay=r3-g1&run=run-20261021-163632) | deepseek-flash / sol | deepseek-flash | 4000:0 | DeepSeek V4.1 Flash·防守方全灭·34s / DeepSeek V4.1 Flash·防守方全灭·36s / DeepSeek V4.1 Flash·防守方全灭·32s / DeepSeek V4.1 Flash·进攻方全灭·32s | 2701 | 3.4 |
| [r3-g2](http://127.0.0.1:8802/?replay=r3-g2&run=run-20261021-163632) | sol / deepseek-flash | sol | 4000:1000 | GPT-6.1 Sol·防守方全灭·56s / GPT-6.1 Sol·防守方全灭·32s / DeepSeek V4.1 Flash·进攻方全灭·47s / GPT-6.1 Sol·进攻方全灭·18s / GPT-6.1 Sol·进攻方全灭·20s | 3449 | 4.5 |

## 机制生效情况

回合结束方式分布：防守方全灭 15 · 拆除炸弹 7 · 进攻方全灭 5 · 时间到 1。
平均回合时长 35.3 秒（未下包上限 100 秒）。
记录到的购买提交：0 次。

## 提交与用量

| 轮次 | 模型 | 控制方式 | 输入 tokens | 输出 tokens |
| --- | --- | --- | ---: | ---: |
| 1 | deepseek-v4.1-flash | program | 8493661 | 101658 |
| 1 | gpt-6.1-sol | program | 718111 | 11837 |
| 2 | deepseek-v4.1-flash | program | 12367079 | 148538 |
| 2 | gpt-6.1-sol | program | 1672893 | 12899 |
| 3 | deepseek-v4.1-flash | program | 8496929 | 88511 |
| 3 | gpt-6.1-sol | program | 1921418 | 14353 |

## 中文自述与复盘

- [deepseek-flash 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/deepseek-flash?run=run-20261021-163632)
- [sol 策略及赛后复盘](http://127.0.0.1:8802/api/arena/reviews/sol?run=run-20261021-163632)

上述文字是模型自述，不代表裁判认可全部判断。

## 证据与范围

**注意：本次没有通过逐帧重演核验**，请查看 audit.json。

- `results.json`：胜负、回合比分、逐回合结果、帧数与用时。
- `r*-g*.json.gz`：每个物理帧的完整战场快照、购买记录与逐窗口输入。
- `round-*-invocation.json`、`round-*.jsonl`：各轮实际模型调用配置与执行记录。
- `isolation-prepare.json`、`isolation-engine-*.json`：隔离探针。
- `audit.json`、冻结目录 `manifest.json`：回放与策略完整性校验。

本系列比较的是本次准备产生的策略在当前规则下的表现。每轮两场是相关样本，不能据此推断模型的综合能力；同名 effort 不代表跨厂商的实际推理投入相同。
