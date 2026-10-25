# -*- coding: utf-8 -*-
"""从 agent.py 派生 v6：只改「决着阶段平血/落后时主动拿血量领先」，避免 99 秒平局。
不改动 agent.py 本身。
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = io.open(os.path.join(ROOT, 'agent.py'), encoding='utf-8').read()

def rep(old, new):
    global src
    assert src.count(old) == 1, (src.count(old), old[:80])
    src = src.replace(old, new)

# 1) 新增 late_push()：决着阶段且血量比例不领先（含完全相同）时必须主动拿伤害。
rep("""        return self.rf >= total - window
""", """        return self.rf >= total - window

    def late_push(self):
        \"\"\"决着阶段血量不领先（含完全相同）时必须主动拿伤害。
        决着阶段双方等速掉血，血量相同会判平局；平局不算胜场，必须避免。\"\"\"
        if not self.late_game():
            return False
        mh = n(self.me.get('hp'), 1000.0)
        oh = n(self.op.get('hp'), 1000.0)
        mm = n(self.me.get('maxHp'), 1000.0) or 1000.0
        om = n(self.op.get('maxHp'), 1000.0) or 1000.0
        return mh * om <= oh * mm + 1e-6
""")

# 2) 决着阶段平血也允许用超必杀收尾（原逻辑只处理落后）。
rep("""        if self.late_game() and n(me.get('hp')) * n(op.get('maxHp'), 1000) < n(op.get('hp')) * n(me.get('maxHp'), 1000):""",
    """        if self.late_game() and n(me.get('hp')) * n(op.get('maxHp'), 1000) <= n(op.get('hp')) * n(me.get('maxHp'), 1000):""")

# 3) 贴身时不再因为对手「爱抢招」而无条件等待：平血/落后时照样抢。
rep("""            if not self.desperate() and ((self.opp_aggressive() and idle <= 90 and self.opp_recent_melee()) or idle <= 20):""",
    """            if (not self.desperate() and not self.late_push()
                    and ((self.opp_aggressive() and idle <= 90 and self.opp_recent_melee()) or idle <= 20)):""")

# 4) 中距离的 hold-agg 同样让位于决着阶段抢血。
rep("""        if not self.desperate() and self.opp_aggressive() and self.opp_recent_melee() and dx < 320 and (self.f0 - self.opp_atk_recent) <= 60:""",
    """        if (not self.desperate() and not self.late_push()
                and self.opp_aggressive() and self.opp_recent_melee() and dx < 320 and (self.f0 - self.opp_atk_recent) <= 60):""")

# 5) 决着阶段平血/落后时大步压进（而不是小步）。
rep("""        if self.desperate():
            step = 10""",
    """        if self.late_push():
            step = 14
        elif self.desperate():
            step = 10""")

out = os.path.join(ROOT, 'lab', 'agent_v6.py')
io.open(out, 'w', encoding='utf-8', newline='\n').write(src)
print('wrote', out)
