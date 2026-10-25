#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""自测用假想对手（不是比赛提交物）。用法: python bot.py <style>

styles: rush / turtle / zone / random / smart
"""
import sys, json

N = {"dir": "N", "btn": None}


def I(d, b=None):
    return {"dir": d, "btn": b}


class R:
    def __init__(self, seed):
        self.s = (seed * 2654435761) & 0xFFFFFFFF

    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s

    def rnd(self):
        return self.next() / 0x7FFFFFFF


class Bot:
    def __init__(self, style):
        self.style = style
        self.rng = None
        self.seed_set = False

    def run(self):
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
                sys.stderr.write("boterr %r\n" % (e,))
                out = {"inputs": [dict(N) for _ in range(15)]}
            sys.stdout.write(json.dumps(out) + "\n")
            sys.stdout.flush()

    def decide(self, obs):
        if not self.seed_set:
            self.rng = R(int(obs.get("seed", 1)) * 7919 + 13)
            self.seed_set = True
        pi = int(obs.get("yourPlayer", 0) or 0)
        me = obs["fighters"][pi]
        op = obs["fighters"][1 - pi]
        C = obs["catalog"]["characters"][me["char"]]
        out = [dict(N) for _ in range(15)]
        dx = abs(op["x"] - me["x"])
        hp = C["normals"]["hp"]
        lp = C["normals"]["lp"]
        lk = C["normals"]["lk"]
        lp_hi = lp["hitbox"]["x"] + lp["hitbox"]["w"] / 2 + 28
        hp_hi = hp["hitbox"]["x"] + hp["hitbox"]["w"] / 2 + 28

        st = self.style
        if st == "random":
            for k in range(15):
                d = ["N", "F", "B", "D", "F", "F", "B"][self.rng.next() % 7]
                b = [None, None, "LP", "LK", "HP", "HK", None][self.rng.next() % 7]
                out[k] = I(d, b)
            return {"inputs": out}

        if st == "rush":
            if me["state"] in ("hitstun", "down", "wakeup", "blockstun"):
                return {"inputs": out}
            if dx > lp_hi:
                for k in range(15):
                    out[k] = I("F")
                return {"inputs": out}
            r = self.rng.rnd()
            if r < 0.5:
                out[0] = I("F", "LP")
                out[3] = I("F", "LK")
                out[8] = I("F", "HP")
            elif r < 0.75:
                out[0] = I("F", "HP")
            else:
                out[0] = I("DF", "HP")   # 尝试必杀
                out[1] = I("D", "HK")
            return {"inputs": out}

        if st == "turtle":
            for k in range(15):
                out[k] = I("B")
            if op["state"] in ("attack",) and op.get("move"):
                m = op["move"]
                if m["frame"] > m["startup"] + m["active"] and dx <= hp_hi:
                    out[0] = I("F", "HP")
                    out[3] = I("F", "HK")
            elif dx > hp_hi:
                for k in range(15):
                    out[k] = I("F")
            elif dx <= hp_hi and self.rng.rnd() < 0.25:
                out[0] = I("F", "HP")
            return {"inputs": out}

        if st == "zone":
            if me["state"] in ("hitstun", "down", "wakeup", "blockstun"):
                return {"inputs": out}
            if dx < 140:
                for k in range(15):
                    out[k] = I("B")
                if self.rng.rnd() < 0.4:
                    out[0] = I("F", "LP")
                return {"inputs": out}
            # qcf + LP 发波
            out[0] = I("D")
            out[1] = I("DF")
            out[2] = I("F", "LP")
            return {"inputs": out}

        # smart
        if me["state"] in ("hitstun", "down", "wakeup", "blockstun", "attack"):
            return {"inputs": out}
        omv = op.get("move")
        if op["state"] == "attack" and omv:
            if omv["frame"] > omv["startup"] + omv["active"] and dx <= hp_hi:
                out[0] = I("F", "HP")
                out[3] = I("F", "HK")
                return {"inputs": out}
            if dx <= 160:
                for k in range(15):
                    out[k] = I("B")
                return {"inputs": out}
        if dx > lp_hi:
            for k in range(15):
                out[k] = I("F")
            return {"inputs": out}
        out[0] = I("F", "LP")
        out[3] = I("F", "LK")
        out[7] = I("F", "HP")
        return {"inputs": out}


if __name__ == "__main__":
    Bot(sys.argv[1] if len(sys.argv) > 1 else "smart").run()
