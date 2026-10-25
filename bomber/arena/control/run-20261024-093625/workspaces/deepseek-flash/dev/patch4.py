import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()

old = """W_DEAD = float(_os.environ.get('AG_DEAD', '0.0'))     # 终点落在「对手一颗弹就能收掉」的死胡同时的惩罚"""
new = """W_DEAD = float(_os.environ.get('AG_DEAD', '0.0'))     # 终点落在「对手一颗弹就能收掉」的死胡同时的惩罚
# 放完炸弹之后的落脚点如果是「只有一条轴」的走廊格，对手只要在我的退路上再补一颗弹，
# 我就会像夹心一样被夹死（自测里的自炸绝大多数是这个形状）。
# W_CORR = 这种「单轴落脚点 + 对手在附近」的惩罚。
W_CORR = float(_os.environ.get('AG_CORR', '0.0'))
CORR_R = float(_os.environ.get('AG_CORRR', '10'))"""
assert old in s
s = s.replace(old, new)

old = """            sc -= W_ESC * max(0.0, et - ESC_FREE)"""
new = """            sc -= W_ESC * max(0.0, et - ESC_FREE)
            if W_CORR > 0 and esc and len(esc) > 1:
                eend = esc[-1]
                exh, exv = axis_exits(tiles, bc2, eend)
                if not (exh and exv) and manhattan(eend, oppcell) <= CORR_R + opp.blast:
                    sc -= W_CORR"""
assert old in s
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
