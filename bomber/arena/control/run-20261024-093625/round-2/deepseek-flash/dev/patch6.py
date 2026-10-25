import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()
old = """            sc -= W_ESC * max(0.0, et - ESC_FREE)
            if W_CORR > 0 and esc and len(esc) > 1:
                eend = esc[-1]
                exh, exv = axis_exits(tiles, bc2, eend)
                if not (exh and exv) and manhattan(eend, oppcell) <= CORR_R + opp.blast:
                    sc -= W_CORR
            # 地板：只要「有退路」就永远比原地发呆强 —— 不炸墙就永远开不了图
            if sc < W_STAY - 0.1:
                sc = W_STAY - 0.1
            pth = path_to(C)
            esc = res[1]
            if len(esc) > 1:
                cells_script = pth + esc[1:]"""
new = """            sc -= W_ESC * max(0.0, et - ESC_FREE)
            pth = path_to(C)
            esc = res[1]
            # 落脚点是「单轴走廊格」且对手就在附近 → 他只要在我退路上补一颗弹，
            # 我就会像夹心一样被夹死（自测里绝大多数自炸就是这个形状）。
            if W_CORR > 0 and len(esc) > 1:
                eend = esc[-1]
                exh, exv = axis_exits(tiles, bc2, eend)
                if not (exh and exv) and manhattan(eend, oppcell) <= CORR_R + opp.blast:
                    sc -= W_CORR
            # 地板：只要「有退路」就永远比原地发呆强 —— 不炸墙就永远开不了图
            if sc < W_STAY - 0.1:
                sc = W_STAY - 0.1
            if len(esc) > 1:
                cells_script = pth + esc[1:]"""
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
