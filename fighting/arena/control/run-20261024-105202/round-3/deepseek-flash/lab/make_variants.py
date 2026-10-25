# -*- coding: utf-8 -*-
"""从 agent.py 派生两个对照实验版本：
  agent_v5a.py：只加「对手满气且在超必杀射程内时中立不出普通技」的持盾规则。
  agent_v5c.py：只加「对手在受击硬直里允许我方取消接超必杀」的斩杀例外。
不改动 agent.py 本身。
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = io.open(os.path.join(ROOT, 'agent.py'), encoding='utf-8').read()

ANCHOR_THREAT = """        lk = normals.get('lk') or {}
        has_low = lk.get('guard') == 'low'"""
THREAT = """        # 对手气满且在其超必杀有效射程内：中立不出普通技，持盾压缩空间。
        # 事故复现：满血 Kestrel dx=146 轻拳，被 Vex 超必杀 5 段 1120 秒杀。
        if op_meter >= op_cost and dx <= op_SR + 10:
            self.dflt = (self.guard_dir(op, OC), None)
            if dx > 180 and (self.f0 - self.opp_atk_recent) > 30:
                self.walk_safe(5)
                self.note = 'bait-super-approach'
            else:
                self.note = 'respect-super-hold'
            return self.emit()

        lk = normals.get('lk') or {}
        has_low = lk.get('guard') == 'low'"""

ANCHOR_FORBID = """        cost = n((self.OC.get('super') or {}).get('cost'), 100)
        # 离满气只差一次防御的量（10）时也不放：万一被挡，削防给他的气会让他立刻满气反超必杀。"""
FORBID = """        if self.op.get('state') == 'hitstun':
            # 对手在受击硬直里无法发动自己的超必杀，这是安全的斩杀窗口。
            return False
        cost = n((self.OC.get('super') or {}).get('cost'), 100)
        # 离满气只差一次防御的量（10）时也不放：万一被挡，削防给他的气会让他立刻满气反超必杀。"""

assert src.count(ANCHOR_THREAT) == 1, src.count(ANCHOR_THREAT)
assert src.count(ANCHOR_FORBID) == 1, src.count(ANCHOR_FORBID)

io.open(os.path.join(ROOT, 'lab', 'agent_v5a.py'), 'w', encoding='utf-8', newline='\n').write(
    src.replace(ANCHOR_THREAT, THREAT))
io.open(os.path.join(ROOT, 'lab', 'agent_v5c.py'), 'w', encoding='utf-8', newline='\n').write(
    src.replace(ANCHOR_FORBID, FORBID))
print('ok')
