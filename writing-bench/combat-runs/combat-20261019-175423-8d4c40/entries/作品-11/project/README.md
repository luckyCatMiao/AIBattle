# 傀儡斩 · MARIONETTE SLASH

横版动作战斗系统试玩。剧场舞台上，持刀剑士对战提线木偶傀儡——斩断它们的肢体，让它们再也拿不起武器。

**运行方式**：直接用浏览器打开 `game.html`（完全离线、单文件、无外部资源）。按 `Enter` 开演。

## 操作

| 按键 | 动作 |
| --- | --- |
| `A` / `D` 或 `←` / `→` | 移动 |
| `Space` | 跳跃（长按跳更高，支持缓冲与土狼时间） |
| `J` | 连斩（地面三段：横斩 → 逆袈裟 → 旋断；空中两段：空斩 → 落斩） |
| `K` | 蓄力重斩（按住蓄力，满蓄必断肢体 + 大击飞；可边走边蓄） |
| `L` | 瞬步（无敌冲刺，可取消攻击收招，瞬步中按 J 出疾走斩） |
| `I` | 挑空斩（浮空敌人，命中后按 J 直接衔接空中追击，空中也可升斩） |
| `R` | 重新开始（随时） |
| `Enter` | 开始 / 确认 |
| `M` / 右上角按钮 | 静音开关 |

## 战斗系统要点

- **命中顿帧**：命中瞬间全局冻结 50–150ms（按攻击重量分级），配合一次性震屏、镜头缩放冲击、刀光轨迹、火花/木屑/冲击环与敌人受击白闪；连段越重反馈越强，无持续震屏。
- **肢体破坏**：傀儡分 头 / 持械臂 / 副臂 / 双腿 五段。轻击累积肢伤，三段旋断概率斩断，满蓄重斩必断。断持械臂 → 武器落地、改用撞击或逃窜；断腿 → 匍匐爬行；断头 → 小怪恐慌乱窜后崩解、铁锤陷入狂暴。残骸带物理弹跳与木屑。
- **敌人**（均需观察前兆）：吊兵（挥砍 / 跳跃突袭 / 断臂后冲撞）、铁锤（砸地 + 沿地冲击波，可跳避，轻击不削韧）、针偶（远程投针，可被斩落，受压后跳拉开距离）。攻击前有肢体蓄力红光 + 头顶警示 + 木鱼声。
- **节奏**：无限波次（幕），幕间恢复 16 点生命；死亡一键重开。连击计数与风格评级（D→SSS）。

## 项目结构

```
game.html          交付物（由 build.js 打包，可离线直接玩）
build.js           构建脚本：src/* 打包为单文件 game.html
src/
  utils.js         数学工具与常量
  audio.js         Web Audio 合成音效 + 轻量打击乐（全部程序合成）
  anim.js          程序化骨骼：姿态关键帧、角色/武器/头部绘制
  fx.js            粒子、残骸(Gib)物理、刀光轨迹、残影
  player.js        玩家状态机、连招表、姿态轨道
  enemies.js       三种敌人 AI、肢体破坏、受击/浮空/倒地
  game.js          编排：输入、相机、波次、战斗判定、渲染、HUD
  template.html / style.css
test/
  harness.js       无头自测（stub DOM/Canvas，验证启动/移动/连招/断肢/死亡重开/模糊清键/模糊输入/性能）
  probe_geom.js    几何探针（骨架/刀尖弧线/镜像数值验证）
  probe_behavior.js 行为探针（断肢影响行为/无敌帧/浮空追击/韧性/冲击波）
  probe_thrower.js 针偶远程行为探针
  snapshot.js      纯 Node 软件光栅化器：拦截 Canvas 调用渲染 PNG，人工检查画面
```

## 真实浏览器修复记录

- **AudioParam 非有限值崩溃**：音乐调度器 `drum()` 调用缺省 `dl` 参数导致 `t0 + undefined = NaN` 传入 `setValueAtTime`，在真实 Chrome 中每拍抛出未捕获 TypeError 并中断游戏循环。已修复默认参数，并对全部音频入口（`osc`/`nz`/`updateMusic`）增加有限值防护与 try/catch——音频故障不再可能侵入游戏循环。
- **软件渲染环境下约 1FPS**：评测沙箱无 GPU 时 Canvas 渐变为 CPU 光栅化，原实现每帧十余次全屏渐变填充 + DPR 放大导致帧率崩塌。重构为静态图层预渲染（天幕/幕布/包厢/地板/幕柱/追光/暗角/红晕各一次 blit），DPR 固定 1，每帧像素写入量降低约一个数量级。
- 测试基建同步增强：`test/harness-audio.js` 提供与 Chrome 行为一致的 AudioContext 桩（对非有限参数抛 TypeError），harness/模糊测试全程覆盖音频路径并断言 0 个非有限参数；快照光栅化器支持离屏画布、逐像素渐变与逆向映射 blit。

## 构建 / 测试

```bash
node build.js            # 重新打包 game.html
node test/harness.js     # 无头逻辑自测
node test/probe_geom.js && node test/probe_behavior.js && node test/probe_thrower.js
```

## 技术说明

- 无任何外部依赖；图形为 Canvas 2D 程序化绘制（关键帧插值骨骼动画），音效为 Web Audio 实时合成（噪声/振荡器/滤波器），音乐为合成打击乐循环。
- `window.combatBenchState()` 返回真实运行状态：`ready / playerAlive / enemyCount / hitCount / limbBreakCount / playing`。
- 游戏按键均 `preventDefault` 防止页面滚动；窗口失焦自动清空按键。
