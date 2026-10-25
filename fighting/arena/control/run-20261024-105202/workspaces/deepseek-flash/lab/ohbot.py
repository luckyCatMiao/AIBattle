#!/usr/bin/env python3
"""压力测试对手：贴脸用 overhead / 下段交替，检验防御默认方向。"""
import sys, json
N = {"dir": "N", "btn": None}
def I(d, b=None): return {"dir": d, "btn": b}
class B:
    def run(self):
        for line in sys.stdin:
            line = line.strip()
            if not line: continue
            try: obs = json.loads(line)
            except Exception: continue
            try: out = self.decide(obs)
            except Exception as e:
                sys.stderr.write('e %r\n' % (e,)); out = {"inputs": [dict(N) for _ in range(15)]}
            sys.stdout.write(json.dumps(out) + "\n"); sys.stdout.flush()
    def decide(self, obs):
        pi = obs["yourPlayer"]; me = obs["fighters"][pi]; op = obs["fighters"][1 - pi]
        C = obs["catalog"]["characters"][me["char"]]
        out = [dict(N) for _ in range(15)]
        dx = abs(op["x"] - me["x"])
        if me["state"] in ("hitstun", "down", "wakeup", "blockstun"):
            return {"inputs": [dict(I("DB")) for _ in range(15)]}
        if me["state"] in ("jump", "air"):
            out[0] = I("F", "HK"); return {"inputs": out}
        fr = obs.get("frame", 0) or 0
        lp = C["normals"]["lp"]; hi = lp["hitbox"]["x"] + lp["hitbox"]["w"] / 2 + 28
        if dx > hi + 30:
            for k in range(15): out[k] = I("F")
            return {"inputs": out}
        # 交替：跳入 overhead / 重腿 overhead / 下段低扫
        m = (fr // 15) % 3
        if m == 0:
            out[0] = I("UF"); out[3] = I("F", "HK")
        elif m == 1:
            out[0] = I("F", "HK")
        else:
            out[0] = I("F", "LK")
        return {"inputs": out}
if __name__ == "__main__":
    B().run()
