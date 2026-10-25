#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""铁拳谱 / IRON CODEX —— deepseek-flash 选手程序（最终版）。

== 从 catalog.js / simulation.js 读出、并用真引擎离线验证过的关键事实 ==
1. 多段招式每段按 data.damage 全额结算（hits 只决定段数与间隔）。Vex 超必杀
   hits=8/dmg=280 且**没有 knockup**，受击方不会被打飞，于是段段落地：
   实测在 80~360 px 内稳定命中 5 段 = 1120 伤害 > 1000 生命 → **一次超必杀即秒杀**。
   更关键的是它带 travel（12 帧推进 290 px），受击后退也逃不掉，射程几乎覆盖半屏。
   Kestrel 超必杀（hits=7/dmg=300）同样能秒杀，但没有 travel，受击后退会脱出判定；
   Aegis/Nyx/Sable/Torv 的超必杀带 knockup，后续段落空，秒不掉人。→ 一号位 Vex。
2. 取消窗口 canCancelUntil = 命中帧 + 10；命中后 hitstop 冻结，第一个「活帧」是
   命中帧 + hitstop + 1。把指令排在 命中帧+hitstop-1 .. +hitstop+1 三帧，就能在
   解冻的第一帧立刻取消成超必杀。hitstop >= 10 的招（Torv hk）来不及取消。
3. 防御只看判定帧那一帧是否按住 B/DB，且必须处于 stand/crouch/blockstun。
   low 要蹲防、overhead 要站防、mid 通吃。
4. 同帧互殴由席位 0 获胜（resolveHits 按 fighters 顺序结算）。
5. 被防御的超必杀：只掉 chip（Vex 8 段 ×36 = 288）与防御槽（-30），但收招 20+18 帧，
   对手防御硬直只有 13 帧 → 被防住的超必杀会被反打。所以只在对手「不可能防御」时发。
6. 对手处于 attack / hitstun / jump 状态时不可能防御；超必杀起手 1~10 帧无敌，
   所以「对手出招的瞬间发超必杀」是稳吃。
7. **窗口帧号是「过去帧」**：观察里的 frame = f0，本窗口真正推进的是 f0+1 .. f0+15。
   所有排程都按这个映射写入（早期版本差一帧，抢招永远慢对手一帧，是最大的坑）。
8. **真实裁判的观察里没有 catalog 字段**（arena/referee.js 的 observe() 会 delete 掉）。
   第 1 轮就是因为只读 obs['catalog']，导致所有 reach/startup/guard 都是 0：
   中立永远够不着、不会出招、不会发超必杀，两局 0 伤害。现在把 catalog.js 的
   帧数据内嵌进本文件，观察里有没有 catalog 都能正常打。
9. 空中重拳的判定盒在脚底上方 34~86 px，跳入要等快落地再按（约判定前 8 帧），
   在最高点按会从对手头顶打空。

== 打法 ==
- 中立：用最快的 lp/lk 在窗口第一帧抢招（命中 +8 气，被防 +3）；命中接 lk/lp 连段。
- 气满：对手出招 / 收招 / 受击 / 空中且距离 <= 超必杀有效射程 → 直接超必杀秒杀。
  对手在防御 → 先用下段 lk 试探：打中就取消超必杀；被蹲防挡下就记录并改用跳入 overhead。
- 防御：按对手招式 guard 属性选 B/DB；挡下重招后按「我恢复自由的那一帧」精确反打。
- 对手气满：在射程内默认蹲防（他真放超必杀就挡下再完整反打一套），除非我也气满。
- 跳入：按当前 y/vy 预测判定帧高度，只有落在 408~474 px 才按空中重拳，避免白跳。
"""

import sys
import json
import os


# === 内嵌帧数据 BEGIN（由 catalog.js 生成；真实裁判的观察里没有 catalog 字段）===
EMBEDDED_CATALOG_JSON = r'''
{"rules":{"hz":20,"decisionFrames":15,"timer":99,"finishSeconds":20,"meterMax":100,"guardMax":120,"health":1000,"teamSize":3,"comboScale":[1,0.9,0.8,0.7,0.6,0.5,0.4,0.3],"minScale":0.3,"throwScale":0.45,"stage":{"width":1280,"ground":500,"wallLeft":60,"wallRight":1220},"jumpFrames":34,"jumpHeight":132,"jumpForward":210,"dashFrames":14,"dashDistance":150,"backdashFrames":18,"backdashDistance":120,"wakeupInvuln":[1,6]},"characters":{"aegis":{"id":"aegis","name":"铁律 · Aegis","archetype":"均衡","color":"#76bcce","rune":"❖","speed":5,"jumpForward":210,"jumpBackward":150,"normals":{"lp":{"kind":"strike","startup":4,"active":3,"recovery":6,"damage":58,"hitstun":11,"blockstun":7,"guard":"mid","hitbox":{"x":72,"y":-54,"w":78,"h":34},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"直拳","chip":5},"hp":{"kind":"strike","startup":12,"active":4,"recovery":22,"damage":128,"hitstun":18,"blockstun":11,"guard":"mid","hitbox":{"x":78,"y":-58,"w":104,"h":40},"pushback":34,"hitstop":7,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"铁贯手","cancelWindow":[11,26],"chip":10},"lk":{"kind":"strike","startup":5,"active":3,"recovery":8,"damage":66,"hitstun":12,"blockstun":8,"guard":"mid","hitbox":{"x":76,"y":-18,"w":86,"h":32},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"侧踢","chip":5},"hk":{"kind":"strike","startup":14,"active":4,"recovery":23,"damage":140,"hitstun":19,"blockstun":12,"guard":"mid","hitbox":{"x":84,"y":-66,"w":108,"h":62},"pushback":38,"hitstop":8,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"回旋踵落","cancelWindow":[13,28],"chip":11}},"specials":{"fireball":{"name":"铁律弹","motion":"qcf","button":"LP","startup":12,"recovery":24,"meterGain":12,"projectile":{"speed":9,"damage":92,"chip":12,"hitstun":16,"blockstun":10,"hitstop":6,"w":40,"h":32,"life":110,"color":"#8fe6ff"}},"uppercut":{"name":"裂空上击","motion":"dp","button":"HP","startup":6,"active":10,"recovery":32,"damage":134,"chip":18,"hitstun":22,"blockstun":12,"hitbox":{"x":34,"y":-140,"w":96,"h":180},"knockup":15,"invuln":[1,8],"hitstop":8,"meterGain":14,"launcher":true,"cancelable":false},"rush":{"name":"铁律突进","motion":"qcb","button":"LK","startup":10,"active":6,"recovery":26,"damage":106,"chip":14,"hitstun":18,"blockstun":10,"hitbox":{"x":84,"y":-56,"w":112,"h":44},"knockup":6,"hitstop":7,"meterGain":12,"travel":{"frames":8,"distance":216},"launcher":true,"cancelable":false}},"super":{"name":"绝律 · 三重天","motion":"qcf","button":"HP","cost":100,"startup":10,"active":26,"recovery":26,"damage":292,"chip":40,"hitstun":24,"blockstun":14,"hitbox":{"x":80,"y":-140,"w":150,"h":190},"hits":6,"hitstop":5,"knockup":22,"invuln":[1,12],"meterGain":0,"cinematic":20,"launcher":true,"cancelable":false}},"vex":{"id":"vex","name":"疾影 · Vex","archetype":"突进","color":"#e38978","rune":"✦","speed":5.8,"jumpForward":250,"jumpBackward":150,"normals":{"lp":{"kind":"strike","startup":3,"active":3,"recovery":5,"damage":50,"hitstun":10,"blockstun":6,"guard":"mid","hitbox":{"x":64,"y":-52,"w":66,"h":30},"pushback":16,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"刺拳","chip":4},"hp":{"kind":"strike","startup":9,"active":4,"recovery":22,"damage":116,"hitstun":17,"blockstun":10,"guard":"mid","hitbox":{"x":70,"y":-56,"w":92,"h":38},"pushback":30,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"双掌推","cancelWindow":[9,24],"chip":9},"lk":{"kind":"strike","startup":4,"active":3,"recovery":9,"damage":58,"hitstun":11,"blockstun":7,"guard":"low","hitbox":{"x":68,"y":-14,"w":80,"h":30},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"低扫","chip":5},"hk":{"kind":"strike","startup":12,"active":4,"recovery":24,"damage":138,"hitstun":18,"blockstun":11,"guard":"mid","hitbox":{"x":76,"y":-60,"w":100,"h":56},"pushback":34,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"旋身踢","cancelWindow":[12,26],"chip":11}},"specials":{"dash":{"name":"疾影突","motion":"qcb","button":"LK","startup":7,"active":5,"recovery":18,"damage":88,"chip":10,"hitstun":16,"blockstun":9,"hitbox":{"x":80,"y":-54,"w":100,"h":42},"invuln":[1,6],"travel":{"frames":7,"distance":260},"hitstop":6,"meterGain":12,"cancelable":false},"dive":{"name":"踏空斩","motion":"qcf","button":"HK","airOnly":true,"startup":6,"active":10,"recovery":12,"damage":120,"chip":14,"hitstun":18,"blockstun":10,"hitbox":{"x":40,"y":-30,"w":88,"h":70},"knockup":8,"hitstop":7,"meterGain":12,"cancelable":false},"dart":{"name":"影针","motion":"qcf","button":"LP","startup":8,"recovery":18,"meterGain":12,"projectile":{"speed":14,"damage":60,"chip":6,"hitstun":12,"blockstun":7,"hitstop":4,"w":26,"h":18,"life":140,"color":"#ffb3a1"}}},"super":{"name":"疾影 · 百裂","motion":"qcf","button":"HP","cost":100,"startup":6,"active":30,"recovery":20,"damage":280,"chip":36,"hitstun":22,"blockstun":13,"hitbox":{"x":66,"y":-120,"w":128,"h":160},"hits":8,"hitstop":3,"invuln":[1,10],"travel":{"frames":12,"distance":290},"meterGain":0,"cinematic":18,"cancelable":false}},"kestrel":{"id":"kestrel","name":"长弓 · Kestrel","archetype":"远距离","color":"#99bb6f","rune":"➶","speed":4.4,"jumpForward":190,"jumpBackward":170,"normals":{"lp":{"kind":"strike","startup":3,"active":3,"recovery":5,"damage":52,"hitstun":10,"blockstun":6,"guard":"mid","hitbox":{"x":60,"y":-52,"w":60,"h":30},"pushback":14,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"短弓柄","chip":4},"hp":{"kind":"strike","startup":11,"active":4,"recovery":21,"damage":132,"hitstun":17,"blockstun":11,"guard":"mid","hitbox":{"x":86,"y":-56,"w":116,"h":40},"pushback":32,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"弓身横扫","cancelWindow":[12,26],"chip":11},"lk":{"kind":"strike","startup":4,"active":3,"recovery":8,"damage":62,"hitstun":11,"blockstun":7,"guard":"low","hitbox":{"x":70,"y":-16,"w":82,"h":30},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"踩踏","chip":5},"hk":{"kind":"strike","startup":13,"active":4,"recovery":23,"damage":152,"hitstun":19,"blockstun":12,"guard":"overhead","hitbox":{"x":88,"y":-74,"w":118,"h":58},"pushback":36,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"高踢","cancelWindow":[14,30],"chip":12}},"specials":{"arrow":{"name":"穿云箭","motion":"qcf","button":"LP","startup":11,"recovery":20,"meterGain":12,"projectile":{"speed":12,"damage":96,"chip":13,"hitstun":16,"blockstun":10,"hitstop":5,"w":46,"h":22,"life":150,"color":"#d6ef9a"}},"lanceshot":{"name":"贯石枪","motion":"qcb","button":"HP","startup":15,"active":6,"recovery":26,"damage":144,"chip":16,"hitstun":20,"blockstun":12,"hitbox":{"x":100,"y":-60,"w":150,"h":44},"knockup":5,"hitstop":7,"meterGain":12,"cancelable":false},"rise":{"name":"倒跃射","motion":"dp","button":"HK","startup":7,"active":4,"recovery":30,"damage":112,"chip":12,"hitstun":18,"blockstun":10,"hitbox":{"x":30,"y":-150,"w":90,"h":170},"knockup":12,"invuln":[1,7],"hitstop":7,"meterGain":12,"launcher":true,"cancelable":false}},"super":{"name":"长弓 · 万矢","motion":"qcf","button":"HP","cost":100,"startup":9,"active":40,"recovery":24,"damage":300,"chip":38,"hitstun":22,"blockstun":13,"hitbox":{"x":84,"y":-130,"w":180,"h":170},"hits":7,"hitstop":4,"invuln":[1,11],"meterGain":0,"cinematic":18,"cancelable":false}},"torv":{"id":"torv","name":"磐岩 · Torv","archetype":"重装","color":"#bea0dd","rune":"⬟","speed":3.9,"jumpForward":160,"jumpBackward":130,"normals":{"lp":{"kind":"strike","startup":5,"active":3,"recovery":7,"damage":68,"hitstun":12,"blockstun":7,"guard":"mid","hitbox":{"x":74,"y":-56,"w":80,"h":36},"pushback":20,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"掌击","chip":5},"hp":{"kind":"strike","startup":15,"active":5,"recovery":26,"damage":158,"hitstun":20,"blockstun":13,"guard":"mid","hitbox":{"x":82,"y":-62,"w":112,"h":46},"pushback":40,"hitstop":9,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"岩锤","cancelWindow":[15,30],"chip":13},"lk":{"kind":"strike","startup":7,"active":3,"recovery":11,"damage":76,"hitstun":13,"blockstun":8,"guard":"low","hitbox":{"x":76,"y":-16,"w":88,"h":32},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"胫撞","chip":6},"hk":{"kind":"strike","startup":18,"active":5,"recovery":30,"damage":172,"hitstun":21,"blockstun":14,"guard":"mid","hitbox":{"x":88,"y":-80,"w":118,"h":72},"pushback":44,"hitstop":10,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"落磐","cancelWindow":[18,34],"chip":14}},"specials":{"grab":{"name":"磐岩抓","motion":"hcb","button":"HP","kind":"throw","startup":7,"recovery":30,"damage":178,"hitstun":40,"range":74,"meterGain":16,"unblockable":true,"hardKnockdown":true,"cancelable":false,"whiffRecovery":44},"lariat":{"name":"铁肘横扫","motion":"qcb","button":"LK","startup":13,"active":5,"recovery":26,"damage":132,"chip":16,"hitstun":19,"blockstun":12,"hitbox":{"x":74,"y":-64,"w":128,"h":54},"armor":[4,13],"pushback":38,"hitstop":8,"meterGain":14,"cancelable":false},"quake":{"name":"震地","motion":"dp","button":"HK","startup":18,"recovery":36,"meterGain":14,"projectile":{"speed":5,"damage":110,"chip":16,"hitstun":20,"blockstun":12,"hitstop":7,"w":70,"h":40,"life":120,"low":true,"color":"#d9c6f5"}}},"super":{"name":"磐岩 · 万钧","motion":"qcf","button":"HP","cost":100,"startup":8,"active":6,"recovery":34,"damage":340,"chip":44,"hitstun":30,"blockstun":16,"hitbox":{"x":70,"y":-90,"w":120,"h":110},"invuln":[1,14],"armor":[1,20],"knockup":20,"hardKnockdown":true,"hitstop":10,"meterGain":0,"cinematic":20,"launcher":true,"cancelable":false}},"nyx":{"id":"nyx","name":"幻缚 · Nyx","archetype":"奇诡","color":"#e0b873","rune":"◈","speed":4.8,"jumpForward":210,"jumpBackward":180,"normals":{"lp":{"kind":"strike","startup":4,"active":3,"recovery":5,"damage":56,"hitstun":10,"blockstun":6,"guard":"mid","hitbox":{"x":66,"y":-54,"w":68,"h":30},"pushback":15,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"指刺","chip":4},"hp":{"kind":"strike","startup":10,"active":4,"recovery":19,"damage":124,"hitstun":18,"blockstun":10,"guard":"mid","hitbox":{"x":78,"y":-58,"w":100,"h":42},"pushback":26,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"缠丝手","cancelWindow":[10,24],"chip":10},"lk":{"kind":"strike","startup":5,"active":3,"recovery":10,"damage":60,"hitstun":12,"blockstun":7,"guard":"low","hitbox":{"x":72,"y":-14,"w":86,"h":28},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"绊足","chip":5},"hk":{"kind":"strike","startup":12,"active":4,"recovery":21,"damage":138,"hitstun":18,"blockstun":11,"guard":"mid","hitbox":{"x":80,"y":-62,"w":104,"h":58},"pushback":32,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"幻崩踢","cancelWindow":[12,26],"chip":11}},"specials":{"teleport":{"name":"移位","motion":"qcf","button":"LP","kind":"move","startup":9,"recovery":14,"invuln":[1,9],"teleport":{"distance":330,"toBehind":false},"meterGain":8,"cancelable":false},"bomb":{"name":"缚雷","motion":"qcb","button":"LP","startup":14,"recovery":26,"meterGain":14,"projectile":{"speed":0,"damage":140,"chip":0,"hitstun":22,"blockstun":0,"hitstop":8,"w":56,"h":56,"life":70,"fuse":34,"arc":{"height":190,"frames":30,"distance":320},"unblockable":true,"color":"#ffd894"}},"ghost":{"name":"幻影坠","motion":"dp","button":"HK","airOnly":true,"startup":8,"active":8,"recovery":16,"damage":108,"chip":12,"hitstun":18,"blockstun":10,"hitbox":{"x":36,"y":-34,"w":92,"h":84},"knockup":10,"hitstop":7,"meterGain":12,"cancelable":false}},"super":{"name":"幻缚 · 虚界","motion":"qcf","button":"HP","cost":100,"startup":9,"active":30,"recovery":26,"damage":300,"chip":40,"hitstun":26,"blockstun":14,"hitbox":{"x":76,"y":-150,"w":160,"h":200},"hits":5,"hitstop":5,"invuln":[1,12],"teleport":{"distance":90,"toBehind":true},"knockup":18,"meterGain":0,"cinematic":20,"launcher":true,"cancelable":false}},"sable":{"id":"sable","name":"静水 · Sable","archetype":"架式","color":"#78c5ab","rune":"≈","speed":4.9,"jumpForward":210,"jumpBackward":150,"normals":{"lp":{"kind":"strike","startup":4,"active":3,"recovery":6,"damage":56,"hitstun":11,"blockstun":7,"guard":"mid","hitbox":{"x":70,"y":-54,"w":74,"h":32},"pushback":18,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"推掌","chip":4},"hp":{"kind":"strike","startup":11,"active":4,"recovery":21,"damage":126,"hitstun":18,"blockstun":11,"guard":"mid","hitbox":{"x":80,"y":-58,"w":102,"h":42},"pushback":30,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"断水掌","cancelWindow":[11,26],"chip":10},"lk":{"kind":"strike","startup":5,"active":3,"recovery":9,"damage":62,"hitstun":12,"blockstun":7,"guard":"low","hitbox":{"x":72,"y":-16,"w":84,"h":30},"pushback":22,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"拂胫","chip":5},"hk":{"kind":"strike","startup":13,"active":4,"recovery":23,"damage":140,"hitstun":19,"blockstun":12,"guard":"mid","hitbox":{"x":82,"y":-64,"w":106,"h":60},"pushback":34,"hitstop":4,"guardPushback":16,"meterGain":8,"meterGainOnBlock":3,"meterGainOnHitAsVictim":5,"cancelable":true,"air":false,"sound":"hit","name":"镜返踢","cancelWindow":[13,28],"chip":11}},"specials":{"parry":{"name":"静水架式","motion":"qcb","button":"LP","kind":"stance","startup":4,"stance":22,"recovery":10,"parryWindow":16,"channelDamage":0.4,"riposte":{"startup":6,"active":4,"recovery":24,"damage":140,"hitstun":22,"blockstun":12,"hitbox":{"x":86,"y":-62,"w":118,"h":52},"hitstop":8,"hardKnockdown":true,"knockup":13,"launcher":true},"meterGain":0,"meterOnParry":20,"cancelable":false},"wind":{"name":"逆风掌","motion":"qcf","button":"LP","startup":11,"recovery":22,"meterGain":12,"projectile":{"speed":7,"damage":84,"chip":10,"hitstun":16,"blockstun":10,"hitstop":5,"w":56,"h":48,"life":120,"wind":34,"color":"#a9f0dd"}},"counter":{"name":"静水·升","motion":"dp","button":"HP","startup":6,"active":8,"recovery":32,"damage":128,"chip":16,"hitstun":22,"blockstun":12,"hitbox":{"x":32,"y":-140,"w":94,"h":176},"invuln":[1,7],"knockup":16,"hitstop":8,"meterGain":14,"launcher":true,"cancelable":false}},"super":{"name":"静水 · 万返","motion":"qcf","button":"HP","cost":100,"startup":7,"active":24,"recovery":32,"damage":240,"chip":32,"hitstun":26,"blockstun":14,"hitbox":{"x":74,"y":-140,"w":145,"h":190},"hits":4,"hitstop":6,"invuln":[1,16],"reflect":20,"knockup":20,"meterGain":0,"cinematic":20,"launcher":true,"cancelable":false}}}}
'''
EMBEDDED_CATALOG = json.loads(EMBEDDED_CATALOG_JSON)
# === 内嵌帧数据 END ===
MOT = {'qcf': ['D', 'DF', 'F'], 'qcb': ['D', 'DB', 'B'],
       'dp': ['F', 'D', 'DF'], 'hcb': ['F', 'DF', 'D', 'DB', 'B']}
K2B = {'lp': 'LP', 'hp': 'HP', 'lk': 'LK', 'hk': 'HK'}
HALF = 28.0
POKE_DELAY = int(os.environ.get('POKE_DELAY', '0'))
SEAT1_DELAY = int(os.environ.get('SEAT1_DELAY', '0'))
RESPECT_FRAMES = int(os.environ.get('RESPECT_FRAMES', '99999'))
RESPECT_HP = float(os.environ.get('RESPECT_HP', '450'))

AIR_MOVE = {
    '空中轻拳': {'startup': 4, 'active': 6, 'recovery': 6, 'damage': 60, 'hitstun': 12, 'blockstun': 8,
                 'guard': 'overhead', 'hitbox': {'x': 54, 'y': -30, 'w': 70, 'h': 46}, 'hitstop': 4},
    '空中重拳': {'startup': 8, 'active': 6, 'recovery': 10, 'damage': 108, 'hitstun': 16, 'blockstun': 10,
                 'guard': 'overhead', 'hitbox': {'x': 60, 'y': -34, 'w': 84, 'h': 52}, 'hitstop': 6},
    '空中轻腿': {'startup': 4, 'active': 6, 'recovery': 6, 'damage': 58, 'hitstun': 12, 'blockstun': 8,
                 'guard': 'overhead', 'hitbox': {'x': 56, 'y': -28, 'w': 72, 'h': 48}, 'hitstop': 4},
    '空中重腿': {'startup': 9, 'active': 6, 'recovery': 12, 'damage': 114, 'hitstun': 17, 'blockstun': 11,
                 'guard': 'overhead', 'hitbox': {'x': 62, 'y': -36, 'w': 90, 'h': 56}, 'hitstop': 6},
}


def n(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


def i_(v, d=0):
    try:
        return int(v)
    except Exception:
        return d


def reach(md, with_travel=False):
    if not md:
        return 0.0
    hb = md.get('hitbox')
    if not hb:
        return 0.0
    r = n(hb.get('x')) + n(hb.get('w')) / 2.0 + HALF
    if with_travel and md.get('travel'):
        r += n(md['travel'].get('distance'))
    return r


def total_frames(md):
    return n(md.get('startup')) + n(md.get('active')) + n(md.get('recovery')) + n(md.get('cinematic'))


class Agent:
    def __init__(self):
        self.ev_last = 0
        self.round = 0
        self.plan = {}
        self.dflt = ('DB', None)
        self.note = ''
        self.f0 = 0
        self.seat = 0
        self.dx = 400.0
        # 记忆
        self.last_hit = -999
        self.last_block = -999
        self.opp_start = -999
        self.opp_name = ''
        self.opp_block_streak = 0
        self.my_atk_guard = 'mid'
        self.opp_crouch_blocks = None    # 推断对手是否蹲防
        self.combo = None
        self.opp_atk_recent = -999
        self.opp_super_seen = False
        self.opp_walking_back = False
        self.opp_x_prev = None
        self.opp_last_block = -999
        self.hitstop_until = -999
        self.guard_bias = None
        self.opp_jump_recent = -999
        self.opp_full_since = -1
        self.opp_atk_times = []          # 对手最近起招的帧号（判读是否爱抢招）
        self.my_dmg = 0
        self.opp_dmg = 0

    # ------------------------------------------------------------------ 主循环
    def run(self):
        # 裁判用 UTF-8 写 JSON；Windows 本地默认 stdin 是 GBK，会把招式名解码坏，
        # 导致 find_move 全部失配（防御段位/无敌帧/收招帧都读不到）。显式统一为 UTF-8。
        try:
            sys.stdin.reconfigure(encoding='utf-8')
        except Exception:
            pass
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                obs = json.loads(line)
            except Exception:
                continue
            try:
                out = self.decide(obs)
            except Exception as e:
                sys.stderr.write('ERR %r\n' % (e,))
                out = {'inputs': [{'dir': 'N', 'btn': None} for _ in range(15)], 'note': 'err'}
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + '\n')
            sys.stdout.flush()

    # ------------------------------------------------------------------ 排程
    def at(self, af, d, b=None):
        # 观察帧 f0 已经是「过去」，本窗口实际推进的是 f0+1 .. f0+15
        if self.f0 + 1 <= af <= self.f0 + 15:
            self.plan[af] = (d, b)

    def fill(self, a1, a2, d, b=None):
        for af in range(a1, a2 + 1):
            self.at(af, d, b)

    def emit(self):
        out = []
        for k in range(15):
            d, b = self.plan.get(self.f0 + 1 + k, self.dflt)
            out.append({'dir': d, 'btn': b})
        return {'inputs': out, 'note': self.note}

    def clear(self):
        self.plan = {}

    # ------------------------------------------------------------------ 目录
    def find_move(self, cat, name):
        if not name or not cat:
            return None
        if name in AIR_MOVE:
            return AIR_MOVE[name]
        for pool in ('normals', 'specials'):
            for mv in (cat.get(pool) or {}).values():
                if isinstance(mv, dict) and mv.get('name') == name:
                    return mv
        sup = cat.get('super')
        if isinstance(sup, dict) and sup.get('name') == name:
            return sup
        return None

    # ------------------------------------------------------------------ 事件
    def process_events(self, obs, pi):
        for e in (obs.get('events') or []):
            eid = i_(e.get('id'), 0)
            if eid <= self.ev_last:
                continue
            self.ev_last = eid
            t = e.get('type')
            fr = i_(e.get('frame'), 0)
            if t == 'move':
                if e.get('owner') != pi:
                    self.opp_start = fr
                    self.opp_name = e.get('name') or ''
                    self.opp_atk_recent = fr
                    self.opp_atk_times.append(fr)
                    if len(self.opp_atk_times) > 40:
                        self.opp_atk_times = self.opp_atk_times[-40:]
            elif t == 'super':
                if e.get('owner') != pi:
                    self.opp_super_seen = True
            elif t == 'jump':
                if e.get('owner') != pi:
                    self.opp_jump_recent = fr
            elif t == 'block':
                if e.get('owner') == pi:
                    self.last_block = fr
                    self.hitstop_until = max(self.hitstop_until, fr + 4)
                else:
                    self.opp_block_streak += 1
                    self.opp_last_block = fr
                    if self.my_atk_guard == 'low':
                        self.opp_crouch_blocks = True
                    elif self.my_atk_guard == 'overhead':
                        self.opp_crouch_blocks = False
            elif t == 'hit':
                if e.get('owner') == pi:
                    self.last_hit = fr
                    self.hitstop_until = max(self.hitstop_until, fr + 9)
                    self.opp_block_streak = 0
                    if self.my_atk_guard == 'low':
                        self.opp_crouch_blocks = False
                    elif self.my_atk_guard == 'overhead':
                        self.opp_crouch_blocks = True
            elif t in ('round', 'roundEnd'):
                self.last_hit = -999
                self.last_block = -999
                self.opp_start = -999
                self.opp_block_streak = 0
                self.combo = None

    # ------------------------------------------------------------------ 工具
    def base_guard(self, ocat):
        """中立默认防御方向：只在对手腾空/最近跳入时站防，其余一律蹲防。
        蹲防同时挡 mid 与 low；只有 overhead 需要站防。把「有 overhead 招式」当成
        一直站防会吃对手的下段 lk，也会因为按 B 后退而破坏距离。"""
        if self.f0 - self.opp_jump_recent < 40:
            return 'B'
        return 'DB'

    def passive_guard(self, ocat):
        """中立默认防御：对手腾空或刚跳入 -> 站防（防跳入 overhead），否则蹲防。"""
        if self.f0 - self.opp_jump_recent < 40:
            return 'B'
        return 'DB'

    def desperate(self):
        """本局打了 35 秒还没有伤害：必须主动压出去，否则 1000:1000 平局会直接结束整场。"""
        return self.rf > 700 and getattr(self, 'round_dmg', 0) < 30

    def opp_aggressive(self):
        """对手是不是「爱抢招」型：最近 180 帧内主动起过招。
        格斗游戏里 9 秒内一次都没出招的对手基本只在纯龟；真 Sol 是每一两个窗口就出招。"""
        cutoff = self.f0 - 180
        self.opp_atk_times = [t for t in self.opp_atk_times if t >= cutoff]
        return len(self.opp_atk_times) >= 1

    def opp_recent_melee(self):
        """对手最近一招是不是近身招式（有判定盒/投技），而不是发波。
        发波时不该原地龟着——那只会被削防磨血，正确做法是顶着波推进。"""
        md = self.find_move(self.OC, self.opp_name)
        if not md:
            return True
        if md.get('projectile'):
            return False
        if md.get('kind') in ('throw', 'stance'):
            return True
        return bool(md.get('hitbox'))

    def opp_super_forbidden(self):
        """对手气满时我方不主动放超必杀——只在对手已经进入受击硬直（无法反手）时例外。
        两边超必杀起手都有无敌帧，主动撞上去可能是我们吃满对方一套（Vex 5 段=秒杀）。"""
        if self.op.get('state') == 'hitstun':
            # 对手在受击硬直里无法发动自己的超必杀，这是安全的斩杀窗口。
            return False
        cost = n((self.OC.get('super') or {}).get('cost'), 100)
        # 离满气只差一次防御的量（10）时也不放：万一被挡，削防给他的气会让他立刻满气反超必杀。
        if n(self.op.get('meter')) < cost - 10:
            return False
        return True

    def opp_super_range(self):
        """对手超必杀的有效射程（带 travel 的要按位移全额算）。
        尊重范围宁大勿小：漏判一次就是一条命（Vex 超必杀 360px 仍可五段秒杀）。"""
        sup = self.OC.get('super') or {}
        if not sup:
            return 0.0
        if sup.get('travel'):
            return reach(sup, True) + 40.0
        return reach(sup) + 60.0

    def super_respect(self):
        """对手气满且够得着时，先只防御等他放超必杀，挡下后再惩罚。
        超必杀起手带无敌帧、伤害极高，用普通技/自己的超必杀去抢是负期望交换。
        只在他刚满气的 180 帧内尊重；超过还没放就恢复主动，免得被白磨。"""
        cost = n((self.OC.get('super') or {}).get('cost'), 100)
        if n(self.op.get('meter')) < cost:
            return False
        sr = max(260.0, self.opp_super_range())
        if self.dx > sr:
            return False
        if self.opp_full_since < 0:
            return False
        return (self.f0 - self.opp_full_since) <= 180

    def guard_dir(self, op, ocat):
        if op.get('airborne') or op.get('state') in ('jump', 'air'):
            return 'B'
        omv = op.get('move')
        if omv and op.get('state') == 'attack':
            md = self.find_move(ocat, omv.get('name'))
            if md:
                g = md.get('guard')
                if g == 'overhead':
                    return 'B'
                if g == 'low':
                    return 'DB'
        return 'DB'

    def late_game(self):
        """是否已进入决着阶段（最后 finishSeconds 秒，双方持续掉血）。"""
        r = self.RULES or {}
        total = i_(r.get('timer'), 99) * i_(r.get('hz'), 20)
        window = i_(r.get('finishSeconds'), 20) * i_(r.get('hz'), 20)
        return self.rf >= total - window

    def sup_range(self, cat):
        sup = cat.get('super')
        if not isinstance(sup, dict):
            return 0.0
        if sup.get('travel'):
            return min(340.0, reach(sup, True) * 0.78)
        return reach(sup) * 0.72

    # ------------------------------------------------------------------ 排招
    def motion_at(self, t_end, motion, btn):
        seq = MOT.get(motion, ['D', 'DF', 'F'])
        t0 = t_end - (len(seq) - 1)
        for i, d in enumerate(seq):
            self.at(t0 + i, d, btn if i == len(seq) - 1 else None)
        for j in (1, 2):
            self.at(t_end + j, seq[-1], btn)

    def plan_super(self, t):
        sup = self.C.get('super')
        if not isinstance(sup, dict):
            return False
        if n(self.me.get('meter')) < n(sup.get('cost'), 100):
            return False
        # 对手气满时我方不主动放超必杀：两边超必杀都有起手无敌帧，
        # 互相撞上时先动的反而可能被后动的一方打中（Vex 超必杀 5 段就是一条命）。
        # 先挡下他的，等他气槽清空后再用我们的。
        if self.opp_super_forbidden():
            return False
        seq = MOT.get(sup.get('motion'), ['D', 'DF', 'F'])
        # 整个方向序列必须落在本窗口内，否则前面的方向帧会被裁掉、指令不成立
        t = max(t, self.f0 + len(seq))
        self.motion_at(t, sup.get('motion'), sup.get('button'))
        return True

    def plan_projectile(self, t):
        """排一发远程必杀（qcf + LP）。只用于远距离磨血/建气，本身不消耗气槽。"""
        mv = None
        for s in (self.C.get('specials') or {}).values():
            if not isinstance(s, dict) or s.get('airOnly'):
                continue
            pj = s.get('projectile')
            if pj and n(pj.get('speed'), 0) > 0:
                mv = s
                break
        if not mv:
            return False
        seq = MOT.get(mv.get('motion'), ['D', 'DF', 'F'])
        # 方向序列必须完整落在本窗口内
        t = max(t, self.f0 + len(seq))
        self.motion_at(t, mv.get('motion'), mv.get('button'))
        return True

    def plan_chain(self, t, keys, fin_super):
        """按帧数据排一条普攻连段；每段的判定帧必须落在上一段的 hitstun 内。"""
        normals = self.C.get('normals') or {}
        cur = t
        for idx, key in enumerate(keys):
            d = normals.get(key) or {}
            s = int(n(d.get('startup'), 5))
            hs = int(n(d.get('hitstop'), 4))
            hst = int(n(d.get('hitstun'), 11))
            if idx == 0:
                self.my_atk_guard = d.get('guard') or 'mid'
            self.at(cur, 'F', K2B[key])
            h = cur + s
            if idx == len(keys) - 1:
                if fin_super and self.plan_super(max(cur + 1, h + max(1, hs - 1))):
                    for f in range(h + hs + 3, h + hs + 8):
                        self.at(f, 'DB', None)
                return True
            nk = keys[idx + 1]
            nd = normals.get(nk) or {}
            ns = int(n(nd.get('startup'), 5))
            p = h + hs + 1
            if p + ns > h + hs + hst - 1:
                return False
            cur = p
        return True

    def build_chain(self, t, start_key, max_len=3):
        """从 start_key 起贪心接最重的可连招。"""
        normals = self.C.get('normals') or {}
        keys = [start_key]
        while len(keys) < max_len:
            d = normals.get(keys[-1]) or {}
            hs = int(n(d.get('hitstop'), 4))
            hst = int(n(d.get('hitstun'), 11))
            best = None
            for k in ('hp', 'hk', 'lk', 'lp'):
                if k == keys[-1]:
                    continue
                nd = normals.get(k) or {}
                ns = int(n(nd.get('startup'), 5))
                if ns + hs + 1 <= hs + hst - 1:
                    if best is None or n(nd.get('damage')) > n((normals.get(best) or {}).get('damage')):
                        best = k
            if best is None:
                break
            keys.append(best)
        return keys

    def plan_attack(self, t, key, fin_super, link_key=None):
        keys = [key]
        if link_key and link_key != key:
            keys.append(link_key)
        self.plan_chain(t, keys, fin_super)

    def plan_punish(self, t):
        """对手在收招/硬直里：用够得着的最重普攻起手，接满连段，气满则以超必杀收尾。"""
        cat = self.C
        normals = cat.get('normals') or {}
        dx = self.dx
        full = n(self.me.get('meter')) >= n((cat.get('super') or {}).get('cost'), 100)
        best = None
        for k in ('hk', 'hp', 'lk', 'lp'):
            d = normals.get(k) or {}
            if not d:
                continue
            if reach(d, True) >= dx - 2:
                best = k
                break
        if best is None:
            best = 'lp'
        self.plan_chain(t, self.build_chain(t, best), full)

    # ------------------------------------------------------------------ 决策
    def decide(self, obs):
        self.clear()
        self.note = ''
        self.f0 = i_(obs.get('frame'), 0)
        pi = i_(obs.get('yourPlayer'), 0)
        self.seat = pi
        rnd = i_(obs.get('round'), 1)
        if rnd != self.round:
            self.round = rnd
            self.combo = None
            self.last_hit = -999
            self.last_block = -999
            self.opp_start = -999
            self.opp_block_streak = 0
            self.opp_crouch_blocks = None
            self.guard_bias = None
            # 车轮战：胜者保留气槽，新小局开始时对手可能带着满气进场。
            # 必须重置“满气起始帧”，否则会误以为他满气很久、提前解除超必杀尊重。
            self.opp_full_since = -1
            self.opp_atk_times = []
            self.opp_atk_recent = -999
            self.opp_name = ''
            self.opp_jump_recent = -999
            self._projs = []
        F = obs.get('fighters') or []
        if len(F) < 2:
            self.dflt = ('DB', None)
            return self.emit()
        me = F[pi]
        op = F[1 - pi]
        self.me = me
        self.op = op
        cat_all = (obs.get('catalog') or {})
        chars = cat_all.get('characters') if 'characters' in cat_all else cat_all
        # 真实裁判的 observe() 会删掉 catalog 字段（见 arena/referee.js），
        # 这时必须退回内嵌帧数据；否则 reach/guard/startup 全是 0，比赛里只会一直往前走。
        if not chars:
            chars = EMBEDDED_CATALOG['characters']
        self.RULES = (cat_all.get('rules') if isinstance(cat_all, dict) else None) or EMBEDDED_CATALOG['rules']
        self.C = chars.get(me.get('char')) or EMBEDDED_CATALOG['characters'].get(me.get('char')) or {}
        self.OC = chars.get(op.get('char')) or EMBEDDED_CATALOG['characters'].get(op.get('char')) or {}
        self.dx = abs(n(op.get('x')) - n(me.get('x')))
        self.rf = i_(obs.get('roundFrame'), 0)
        _pl = obs.get('players') or []
        _me_p = _pl[pi] if len(_pl) > pi else {}
        self.my_dmg = n(_me_p.get('damageDealt'), 0)
        self.opp_dmg = n((_pl[1 - pi] or {}).get('damageDealt'), 0) if len(_pl) > 1 - pi else 0
        if getattr(self, '_dmg_round', None) != rnd:
            self._dmg_round = rnd
            self._dmg_base = self.my_dmg
        self.round_dmg = self.my_dmg - getattr(self, '_dmg_base', 0)
        # 对手在 stand/crouch 却持续后退 -> 多半在按后防御
        ox = n(op.get('x'))
        if self.opp_x_prev is not None and op.get('state') in ('stand', 'crouch', 'blockstun'):
            # 远离我 = 在按后（防御）；靠近我 = 在前进
            away = 1 if ox > n(me.get('x')) else -1
            dv = (ox - self.opp_x_prev) * away
            if dv > 0.5:
                self.opp_walking_back = True
            elif dv < -0.5:
                self.opp_walking_back = False
        self.opp_x_prev = ox
        self._projs = obs.get('projectiles') or []
        self.process_events(obs, pi)
        # 全局追踪「对手气满从什么时候开始」：防御硬直里也要知道对面随时可能放超必杀。
        _oc = self.OC.get('super') or {}
        if n(op.get('meter')) >= n(_oc.get('cost'), 100):
            if self.opp_full_since < 0:
                self.opp_full_since = self.f0
        else:
            self.opp_full_since = -1

        st = me.get('state')
        if st == 'ko':
            self.dflt = ('DB', None)
            return self.emit()
        if st in ('jump', 'air') or me.get('airborne'):
            return self.on_air(op)
        if st in ('hitstun', 'down', 'wakeup'):
            self.combo = None
            self.dflt = (self.guard_dir(op, self.OC), None)
            return self.emit()
        if st == 'stance':
            self.combo = None
            self.dflt = ('DB', None)
            return self.emit()
        if st == 'blockstun':
            self.bf = self.f0 + 1
            return self.on_blockstun(op)
        if st == 'attack':
            return self.on_attack(op)
        self.combo = None
        self.bf = self.f0 + 1
        return self.free(op)

    # ------------------------------------------------------------------ 空中
    def on_air(self, op):
        """空中不再一律中立：跳入要真的按出空中重拳，否则只是白送一个跳跃。

        空中重拳 8 帧起手，判定盒在脚底上方 34~86 px；按得太早会在最高点打空。
        用当前 y/vy 预测 8 帧后的高度，落在能打到站/蹲对手的区间才按。"""
        self.combo = None
        self.dflt = ('N', None)
        if self.me.get('state') == 'attack':
            self.note = 'air-atk'
            return self.emit()
        ox, mx = n(op.get('x')), n(self.me.get('x'))
        front = (ox - mx) * n(self.me.get('facing'), 1) >= 0
        if op.get('state') == 'ko' or not front or self.dx > 170:
            self.note = 'air'
            return self.emit()
        y = n(self.me.get('y'), 500.0)
        vy = n(self.me.get('vy'), 0.0)
        for k in range(1, 16):
            # 第 k 帧按下，判定帧在 k+8；引擎每帧先 vy+=0.62 再 y+=vy。
            ya = y + (k + 8) * vy + 0.31 * (k + 8) * (k + 9)
            if 408.0 <= ya <= 474.0:
                self.my_atk_guard = 'overhead'
                self.at(self.f0 + k, 'N', 'HP')
                self.note = 'air-overhead@%d' % (self.f0 + k)
                return self.emit()
        self.note = 'air'
        return self.emit()

    # ------------------------------------------------------------------ 出招中
    def on_attack(self, op):
        mv = self.me.get('move') or {}
        md = self.find_move(self.C, mv.get('name'))
        kind = mv.get('kind')
        self.dflt = ('DB', None)
        if kind in ('normal', 'air') and md:
            h = self.last_hit
            if h > 0 and self.f0 <= h + 10:
                if n(self.me.get('meter')) >= n((self.C.get('super') or {}).get('cost'), 100):
                    self.plan_super(self.bf)
                    self.note = 'cancel-super'
                    return self.emit()
        # 招式在本窗口内收完 -> 剩下的帧按自由状态重新决策（否则会呆走到对手判定里）
        if md:
            remain = total_frames(md) - n(mv.get('frame'))
            extra = max(0, self.hitstop_until - self.f0)
            end = self.f0 + int(max(0.0, remain)) + extra
            if end <= self.f0 + 14:
                self.bf = end + 1
                self.note = 'atk-free@%d' % self.bf
                return self.free(op)
        self.note = 'atk'
        return self.emit()

    # ------------------------------------------------------------------ 防御硬直
    def on_blockstun(self, op):
        self.dflt = (self.guard_dir(op, self.OC), None)
        self.combo = None
        # 对手气满：挡下轻招后不要立刻反打，他随时能把这一下取消/接成超必杀。
        if self.super_respect():
            self.note = 'blk-respect-super'
            return self.emit()
        md = self.find_move(self.OC, self.opp_name)
        hs = int(n((md or {}).get('hitstop'), 4))
        bs = int(n((md or {}).get('blockstun'), 7))
        if self.last_block > 0:
            freef = self.last_block + hs + bs + 1
            # 多段招（超必杀等）在判定结束之前一直保持防御，绝不能在中途松手反打：
            # 松手的那个判定帧会被后续段数直接命中（一段就可能 200+）。
            if md and n(md.get('hits'), 0) > 1:
                omv2 = self.op.get('move') or {}
                fr2 = n(omv2.get('frame'), 0)
                st2 = n(md.get('startup'), 0)
                ac2 = n(md.get('active'), 0)
                if self.op.get('state') == 'attack' and fr2 < st2 + ac2 - 2:
                    self.note = 'blk-multi'
                    return self.emit()
            if self.f0 < freef <= self.f0 + 15:
                tot = total_frames(md) if md else 20
                opp_free = self.opp_start + tot + hs
                if opp_free > freef + 2:
                    self.plan_punish(freef)
                    self.note = 'blockpunish@%d' % freef
                    return self.emit()
                # 没有大破绽：恢复自由那一帧就用最快的招抢一次（对手多半还在起手）
                normals = self.C.get('normals') or {}
                key = 'lp'
                for k in ('lp', 'lk'):
                    d = normals.get(k) or {}
                    if reach(d) >= self.dx - 2:
                        key = k
                        break
                self.plan_attack(freef, key, False, None)
                self.note = 'blocktake@%d' % freef
                return self.emit()
        self.note = 'blk'
        return self.emit()

    # ------------------------------------------------------------------ 自由
    def free(self, op):
        me, C, OC = self.me, self.C, self.OC
        dx = self.dx
        normals = C.get('normals') or {}
        lp = normals.get('lp') or {}
        lp_r = reach(lp)
        lp_s = int(n(lp.get('startup'), 4))
        meter = n(me.get('meter'))
        sup = C.get('super') or {}
        full = meter >= n(sup.get('cost'), 100)
        SR = self.sup_range(C)
        op_meter = n(op.get('meter'))
        op_super_ready = op_meter >= n((OC.get('super') or {}).get('cost'), 100)
        ostate = op.get('state')
        omv = op.get('move')
        o_air = bool(op.get('airborne')) or ostate in ('jump', 'air')
        self.dflt = (self.passive_guard(OC), None)

        # 1) 迎面投射物
        pf = self.proj_block_frames()
        if pf:
            for k in range(1, 16):
                self.at(self.bf + k - 1, 'DB' if k in pf else 'F')
            self.note = 'blockproj'
            return self.emit()

        # 对手气满且够得着：只防御，等他放超必杀（挡下后收招很长，可完整反打）。
        if self.super_respect() and ostate not in ('hitstun', 'down', 'wakeup', 'ko'):
            self.dflt = (self.guard_dir(op, OC), None)
            self.note = 'respect-super-hold'
            return self.emit()

        # 2) 对手出招
        if ostate == 'attack' and omv:
            md = self.find_move(OC, omv.get('name'))
            fr = n(omv.get('frame'))
            s = n((md or {}).get('startup'), n(omv.get('startup'), 5))
            a = n((md or {}).get('active'), n(omv.get('active'), 0))
            r = n((md or {}).get('recovery'), n(omv.get('recovery'), 8))
            tot = s + a + r + n((md or {}).get('cinematic'), 0)
            inv = bool((md or {}).get('invuln'))
            rch = reach(md, True) if md else 200.0
            remain = tot - fr
            if fr >= s + a:
                # ---- 收招中：我的回合
                if full and dx <= SR:
                    self.plan_super(self.bf)
                    self.note = 'super-punish'
                    return self.emit()
                if remain > lp_s + 2 and dx <= max(reach(normals.get('hk')), reach(normals.get('hp')), lp_r):
                    self.plan_punish(self.bf)
                    self.note = 'punish'
                    return self.emit()
                if dx > lp_r - 2:
                    # 对手收招时前进——但对手爱抢招时，他的下一个招很可能在我走到之前就出来，
                    # 所以只在中远距离推进；近中距离保持防御，让他自己撞上来。
                    if self.opp_aggressive() and dx < 320:
                        self.dflt = (self.guard_dir(op, OC), None)
                        self.note = 'hold-recovery'
                        return self.emit()
                    self.walk_safe(int(min(14, max(1, remain))))
                    self.note = 'chase'
                    return self.emit()
                self.dflt = (self.guard_dir(op, OC), None)
                self.note = 'blk'
                return self.emit()
            # ---- 起手/判定中
            if full and dx <= SR and not inv:
                self.plan_super(self.bf)
                self.note = 'super-counter'
                return self.emit()
            # 抢招：我的判定帧要落在他判定帧之前
            if (not inv) and (s - fr) > lp_s + 1 and dx <= lp_r - 2:
                self.plan_attack(self.bf, 'lp', full, None if full else 'lk')
                self.note = 'counterpoke'
                return self.emit()
            if dx <= rch + 8:
                self.dflt = (self.guard_dir(op, OC), None)
                if not (md or {}).get('hits'):
                    hs = int(n((md or {}).get('hitstop'), 4))
                    bs = int(n((md or {}).get('blockstun'), 7))
                    thit = self.f0 + int(max(0.0, s - fr))
                    tf = thit + hs + bs + 1
                    if tf <= self.f0 + 15 and remain > bs + 3:
                        self.plan_punish(max(self.bf, tf))
                        self.note = 'blockcounter@%d' % tf
                        return self.emit()
                self.note = 'blk'
                return self.emit()
            # 打不到我
            if fr < s + a:
                # 判定还没结束：绝不能走进判定。带位移的招（突进/冲刺）直接不动；
                # 其余只在离判定边缘还有 55px 以上时小步前进。
                if (md or {}).get('travel'):
                    self.dflt = (self.guard_dir(op, OC), None)
                    self.note = 'hold-range'
                    return self.emit()
                spd = max(1.0, n(self.C.get('speed'), 5.0))
                room = dx - (rch + 55.0)
                steps = int(room / spd) if room > 0 else 0
                if steps >= 2:
                    self.walk_safe(min(steps, 8))
                    self.note = 'walk-safe'
                else:
                    self.dflt = (self.guard_dir(op, OC), None)
                    self.note = 'hold-range'
                return self.emit()
            self.walk_safe(int(min(14, max(1, remain))))
            self.note = 'chase'
            return self.emit()

        # 3) 对手空中：跳入的落点可能是任何距离，一律站防，绝不向前走进落点。
        if o_air:
            if full and dx <= SR:
                self.plan_super(self.bf)
                self.note = 'super-antiair'
                return self.emit()
            self.dflt = ('B', None)
            self.note = 'blockair'
            return self.emit()

        # 4) 对手受击硬直：立刻接（他挡不住）
        if ostate == 'hitstun':
            r = max(reach(normals.get('lp')), reach(normals.get('lk')))
            if full and dx <= SR:
                self.plan_super(self.bf)
                self.note = 'super-combo'
                return self.emit()
            if dx <= r + 30:
                self.plan_chain(self.bf, self.build_chain(self.bf, 'lp'), False)
                self.note = 'combo'
                return self.emit()

        # 4.5) 决着阶段且血量比例落后：一直防下去必被掉血拖死，气满就主动放超必杀。
        # 对手蹲防时也能吃到 8 段 chip（约 250~290），是决着阶段唯一追得回来的爆发。
        if self.late_game() and n(me.get('hp')) * n(op.get('maxHp'), 1000) < n(op.get('hp')) * n(me.get('maxHp'), 1000):
            if full and dx <= SR:
                self.plan_super(self.bf)
                self.note = 'super-late'
                return self.emit()

        # 5) 中立
        # 对手气满且在超必杀射程内：中立不要乱出招（超必杀起手带无敌帧，抢不过），
        # 只在他收招/受击硬直里动手；否则蹲防等他先动。
        op_cost = n((OC.get('super') or {}).get('cost'), 100)
        op_SR = self.opp_super_range() if OC else 0.0
        if op_meter >= op_cost:
            if self.opp_full_since < 0:
                self.opp_full_since = self.f0
        else:
            self.opp_full_since = -1
        # 对手气满超过 15 秒还没放 -> 判定他不会放，恢复主动（否则会被白削防磨死）
        holding = ((self.opp_full_since >= 0 and (self.f0 - self.opp_full_since) <= RESPECT_FRAMES)
                   or n(me.get('hp')) <= RESPECT_HP)
        # 我气满时不龟：此时该主动找机会用超必杀秒杀（他出招的瞬间就是机会）
        danger = op_meter >= op_cost and dx <= max(200.0, op_SR) and holding and not full
        if danger and (self.f0 - self.opp_atk_recent) <= 60:
            self.dflt = (self.guard_dir(op, OC), None)
            self.note = 'respect-super'
            return self.emit()

        # 对手气满且在其超必杀有效射程内：中立绝不出普通技。
        # 实测事故：满血 Kestrel 在 dx=146 随手一记轻拳，对方 Vex 直接超必杀
        # 5 段 1120 伤害秒杀。超必杀起手有无敌帧，任何先手都会被反杀——
        # 这里改成持盾压缩空间，把他逼到「必须放超必杀」的距离，挡下后重罚。
        if op_meter >= op_cost and dx <= op_SR + 10:
            self.dflt = (self.guard_dir(op, OC), None)
            if dx > 180 and (self.f0 - self.opp_atk_recent) > 30:
                self.walk_safe(5)
                self.note = 'bait-super-approach'
            else:
                self.note = 'respect-super-hold'
            return self.emit()

        # 远距离且对手自由：用远程必杀磨血/建气（不消耗气槽，也避免走进满气对手的射程）。
        if (not o_air and ostate in ('stand', 'crouch')
                and dx > max(300.0, op_SR + 40.0)
                and (self.f0 - self.opp_atk_recent) > 8):
            if self.plan_projectile(self.bf):
                self.note = 'zone'
                return self.emit()

        lk = normals.get('lk') or {}
        has_low = lk.get('guard') == 'low'
        blocking_opp = self.opp_block_streak >= 1 or self.opp_walking_back
        if blocking_opp and self.opp_crouch_blocks and has_low:
            return self.jump_overhead(op)
        key = 'lk' if (blocking_opp and has_low) else 'lp'
        d = normals.get(key) or {}
        if reach(d) < dx - 2 and key != 'lp':
            key = 'lp'
            d = normals.get('lp') or {}
        atk_r = reach(d) or lp_r

        if dx <= atk_r - 2:
            # 对手是「爱抢招」型（真 Sol 就是：自由状态几乎每个窗口都在出招）：
            # 这时在贴脸距离先手抢招会撞上带无敌的 DP / 更快的 lp，输交换。
            # 正确做法是保持防御，等他出招进收招或被我挡下后再惩罚。
            idle = self.f0 - self.opp_atk_recent
            # 打了 35 秒还没造成任何伤害：再龟下去只会 1000:1000 判平局（平局直接结束整场），
            # 必须主动压出去拿伤害领先。
            if not self.desperate() and ((self.opp_aggressive() and idle <= 90 and self.opp_recent_melee()) or idle <= 20):
                self.dflt = (self.passive_guard(OC), None)
                self.note = 'wait-agg'
                return self.emit()
            t = min(self.bf + POKE_DELAY + (SEAT1_DELAY if self.seat == 1 else 0), self.f0 + 15)
            # 中立先手不预排超必杀：这一下可能被挡，预排的超必杀会直接送人头。
            # 真命中了由 on_attack 的取消窗口接超必杀（命中确认）。
            link = 'lk' if key != 'lk' else 'lp'
            self.plan_attack(t, key, False, link)
            self.note = ('kill' if full else '') + 'poke:' + key
            return self.emit()

        # 对手气满且我血很少：蹲防等他出招（挡下超必杀后他收招极长，可完整反打）
        if op_super_ready and dx <= SR and not full and n(me.get('hp')) < 300:
            self.dflt = (self.guard_dir(op, OC), None)
            self.note = 'respect-super'
            return self.emit()

        # 对手很久没出手（或离得远）-> 整窗口推进，否则只走前半段再蹲防
        # 对手爱抢招且已经在中近距离：不主动走进他的普通技范围，保持防御等他先动。
        if not self.desperate() and self.opp_aggressive() and self.opp_recent_melee() and dx < 320 and (self.f0 - self.opp_atk_recent) <= 60:
            self.dflt = (self.passive_guard(OC), None)
            self.note = 'hold-agg'
            return self.emit()
        passive = (self.f0 - self.opp_atk_recent) > 90
        # 爱抢招的近战对手：贴近时只小步前进，避免整窗口 forward 走进他的判定。
        # 只会发波的对手：大步推进（波由 proj_block_frames 逐帧挡）。
        if self.desperate():
            step = 10
        elif self.opp_aggressive() and dx < 380:
            step = 4 if self.opp_recent_melee() else 12
        else:
            step = 15 if passive else 8
        self.walk_safe(step)
        self.note = 'approach'
        return self.emit()

    def walk_safe(self, frames):
        """只走 frames 帧，其余蹲防（不主动走进对手判定）。"""
        for k in range(frames):
            self.at(self.bf + k, 'F')
        self.dflt = ('DB', None)

    def opp_has_antiair(self):
        """对手是否有能打出高高判定的无敌/霸体凹招（对空升龙类）。"""
        for s in (self.OC.get('specials') or {}).values():
            if not isinstance(s, dict) or s.get('airOnly'):
                continue
            hb = s.get('hitbox') or {}
            high = n(hb.get('y'), 0) <= -100
            inv = bool(s.get('invuln')) or bool(s.get('armor'))
            if high and inv:
                return True
        return False

    # ------------------------------------------------------------------ 跳入 overhead
    def jump_overhead(self, op):
        """对手爱蹲防：跳入用空中重拳（overhead）破防。
        但对手有升龙类对空凹招时不能从自由状态起跳——那是白送一个大确反。"""
        dx = self.dx
        ostate = op.get('state')
        # 已经在跳 -> 出空中攻击
        if self.me.get('airborne') or self.me.get('state') in ('jump', 'air'):
            self.my_atk_guard = 'overhead'
            self.at(self.bf, 'F', 'HP')
            self.note = 'air-overhead'
            return self.emit()
        if self.opp_has_antiair():
            self.dflt = ('DB', None)
            self.note = 'nojump-antiair'
            return self.emit()
        if self.opp_aggressive() and ostate in ('stand', 'crouch'):
            self.dflt = ('DB', None)
            self.note = 'nojump-agg'
            return self.emit()
        if dx > 200:
            self.approach(150, 6)
            self.note = 'approach-jump'
            return self.emit()
        # 起跳：UF，第 2 帧起可以出空中招
        self.my_atk_guard = 'overhead'
        self.at(self.bf, 'UF')
        self.at(self.bf + 2, 'F', 'HP')
        self.note = 'jumpin'
        return self.emit()

    def approach(self, stop, lead_frames):
        dx = self.dx
        spd = max(1.0, n(self.C.get('speed'), 5.0))
        need = int((dx - stop) / spd) + 1
        need = max(1, min(14, need))
        for k in range(need):
            self.at(self.bf + k, 'F')
        self.dflt = ('DB', None)

    # ------------------------------------------------------------------ 投射物
    def proj_block_frames(self):
        ps = [p for p in (getattr(self, '_projs', None) or []) if p.get('owner') != self.seat]
        if not ps:
            return None
        myx = n(self.me.get('x'))
        opx = n(self.op.get('x'))
        spd = max(1.0, n(self.C.get('speed'), 5.0))
        out = set()
        for p in ps:
            px = n(p.get('x'))
            toward = (px < myx) if myx > opx else (px > myx)
            if not toward:
                continue
            pv = self.proj_speed(p)
            dist = abs(px - myx) - n(p.get('w'), 40) / 2.0 - HALF
            k = int(max(0.0, dist) / max(1.0, pv + spd))
            if k > 15:
                continue
            for t in range(max(1, k - 1), min(15, k + 3) + 1):
                out.add(t)
        return out or None

    def proj_speed(self, p):
        for mv in (self.OC.get('specials') or {}).values():
            if not isinstance(mv, dict):
                continue
            pj = mv.get('projectile')
            if not pj:
                continue
            if abs(n(pj.get('w')) - n(p.get('w'))) < 1 and abs(n(pj.get('h')) - n(p.get('h'))) < 1:
                return max(1.0, n(pj.get('speed'), 10.0))
        return 10.0


def main():
    Agent().run()


if __name__ == '__main__':
    main()
