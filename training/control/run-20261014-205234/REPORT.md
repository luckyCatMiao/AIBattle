# GPT-6 Astra vs GPT-6.1 Sol 连续复盘实验

批次：`run-20261014-205234`。状态：已完成。

模型：GPT-6 Astra 使用 `gpt-6-astra`，GPT-6.1 Sol 使用 `gpt-6.1-sol`。双方均为 medium 推理设置，每轮各自复盘、修改和验证，再交换黑白对战两局。

起点：GPT-6 Astra starts from scratch; GPT-6.1 Sol retains its own engine after three previous improvement cycles. Both receive the same 13 historical public replays.

| 迭代轮次 | GPT-6 Astra 胜 | GPT-6.1 Sol 胜 | 平局 | 两局手数 | 最长一步耗时 |
|---|---:|---:|---:|---|---:|
| 1 | 0 | 2 | 0 | 36 / 49 | 4.801 秒 |
| 2 | 0 | 2 | 0 | 26 / 25 | 4.801 秒 |
| 3 | 0 | 1 | 1 | 225 / 25 | 4.801 秒 |

本批合计：GPT-6 Astra 0 胜，GPT-6.1 Sol 5 胜，平局 1 局。共 6 局，6 种完整落子序列。

棋谱已由独立窗口枚举程序逐手重建，核对落子合法性、先后手、首次五连、胜者与最终棋盘。源码快照的 SHA-256 校验通过。记录耗时包含进程冷启动及传输开销。

## 隔离与条件

- 选手使用独立挂载和进程命名空间，只获得自己的源码、经验文件、相同公开棋谱与规则。对方工作区、旧源码、裁判凭据、控制器日志和 Windows 盘均未挂载。
- 双向越界读取测试通过；比赛程序源码只读，无网络路由、无模型认证文件。组织者只转发输入和输出，不选择落点。
- 程序每步目标预算 5 秒，10 秒异常硬上限；双方准备上限相同，允许自选程序、直接推理或混合策略。
- 本次起点和历史积累见上文，不能默认视为双方从零、等经验的比较。少量棋局不代表通用模型胜率。

## 记录与继续运行

- [本批记录](./)：源码快照、模型日志、复盘、验证、棋谱、耗时和隔离检查。
- [运行说明](../../README.md)。双击根目录 `ContinueTraining.bat`，会沿用当前这组选手各自的策略和历史棋谱，再跑三轮。
- [直播与回放](http://127.0.0.1:8787)，点击「跟随直播」。
- 改进的是策略与经验文件，没有训练模型权重。

## 第 1 轮复盘

- [GPT-6 Astra](./iteration-1/astra/review.md)，参赛方式：`program`。
- [GPT-6.1 Sol](./iteration-1/sol/review.md)，参赛方式：`program`。

## 第 2 轮复盘

- [GPT-6 Astra](./iteration-2/astra/review.md)，参赛方式：`program`。
- [GPT-6.1 Sol](./iteration-2/sol/review.md)，参赛方式：`program`。

## 第 3 轮复盘

- [GPT-6 Astra](./iteration-3/astra/review.md)，参赛方式：`program`。
- [GPT-6.1 Sol](./iteration-3/sol/review.md)，参赛方式：`program`。
