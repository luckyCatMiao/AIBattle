"""Compare serve-return variants against a fixed reference brain.

Safe variants (selected via BAD_* environment variables read by Brain):
  A default : deadbait=1 runup=1
  B runup   : deadbait=0 runup=1
  C tie     : deadbait=0 runup=0
For each variant and seed we play one game per seat against the r1 reference
brain, and report serve retention / break rate / self-losses.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
import brain_py
from brain_py import Brain


def load_backup(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod.Brain


OldBrain = load_backup(os.path.join(HERE, "brain_py.r1bak.py"), "brain_r1bak")
if os.path.exists(os.path.join(HERE, "planner.r1bak.py")):
    pass


def make_brain(cfg):
    for k in ("BAD_BAIT", "BAD_RUNUP", "BAD_RALLY_SPRINT", "BAD_SPRINT_MIN",
              "BAD_DEF"):
        os.environ.pop(k, None)
    os.environ.update(cfg)
    return Brain()


def diag(g, my_team):
    hits = [e for e in g.events if e["type"] == "hit"]
    pts = [e for e in g.events if e["type"] == "point"]
    server = 0
    mine = {"serve_pts": 0, "serve_won": 0, "recv_pts": 0, "recv_won": 0,
            "self_loss": 0}
    for e in pts:
        last_team = None
        for h in hits:
            if h["frame"] <= e["frame"]:
                last_team = h["team"]
        if server == my_team:
            mine["serve_pts"] += 1
            if e["team"] == my_team:
                mine["serve_won"] += 1
        else:
            mine["recv_pts"] += 1
            if e["team"] == my_team:
                mine["recv_won"] += 1
        if last_team == my_team and e["team"] != my_team:
            mine["self_loss"] += 1
        server = e["team"]
    return mine


def run(my_team, seed, brain_cfg):
    b = make_brain(brain_cfg)
    old = OldBrain()
    a0, a1 = (b, old) if my_team == 0 else (old, b)
    g = E.Match(seed=seed)
    w = 0
    t0 = time.time()
    while g.status == "playing" and w < 600:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(E.RULES["decisionFrames"]):
            if g.status != "playing":
                break
            g.batsmen[0]["held"] = w0[fi]
            g.batsmen[1]["held"] = w1[fi]
            g.step()
        w += 1
    d = diag(g, my_team)
    d.update({"net": g.netHeight, "score": g.score, "me": g.score[my_team],
              "opp": g.score[1 - my_team], "frames": g.frame,
              "stam": [round(x["stamina"], 1) for x in g.batsmen],
              "secs": round(time.time() - t0, 1)})
    return d


CFGS = {
    "default": {},
    "runup": {"BAD_BAIT": "0", "BAD_RUNUP": "1"},
    "tie": {"BAD_BAIT": "0", "BAD_RUNUP": "0"},
}
if os.environ.get("DEF_MODE"):
    for _c in CFGS.values():
        _c["BAD_DEF"] = os.environ["DEF_MODE"]
if os.environ.get("RALLY_SPRINT"):
    for _c in CFGS.values():
        _c["BAD_RALLY_SPRINT"] = os.environ["RALLY_SPRINT"]
if os.environ.get("SPRINT_MIN"):
    for _c in CFGS.values():
        _c["BAD_SPRINT_MIN"] = os.environ["SPRINT_MIN"]

if __name__ == "__main__":
    seeds = [int(x) for x in sys.argv[1:]] or [8005, 8015, 8025, 8001]
    only = os.environ.get("ONLY_CFG")
    for name, cfg in CFGS.items():
        if only and name != only:
            continue
        agg = {"me": 0, "opp": 0, "serve_pts": 0, "serve_won": 0,
               "recv_pts": 0, "recv_won": 0, "self_loss": 0}
        for s in seeds:
            for seat in (0, 1):
                r = run(seat, s, cfg)
                for k in agg:
                    agg[k] += r[k]
                print("%-7s seed=%d seat=%d net=%.2f score=%s serve %d/%d recv %d/%d selfloss %d stam=%s" % (
                    name, s, seat, r["net"], r["score"], r["serve_won"], r["serve_pts"],
                    r["recv_won"], r["recv_pts"], r["self_loss"], r["stam"]))
        print("== %s aggregate: pts %d:%d  serve %d/%d (%.0f%%)  recv %d/%d (%.0f%%)  selfloss %d" % (
            name, agg["me"], agg["opp"], agg["serve_won"], agg["serve_pts"],
            100.0 * agg["serve_won"] / max(1, agg["serve_pts"]),
            agg["recv_won"], agg["recv_pts"],
            100.0 * agg["recv_won"] / max(1, agg["recv_pts"]), agg["self_loss"]))
