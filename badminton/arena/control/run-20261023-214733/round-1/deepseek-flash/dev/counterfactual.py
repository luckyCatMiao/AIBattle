"""Replay the archives through the Python engine port and run counterfactuals.

1. verify(): replay recorded inputs frame-by-frame and compare with the
   referee archive (score/events/hits/smashes).
2. serve_counterfactual(): for each of our service points, start from the
   recorded state at the decision window before the serve and let a fresh
   Brain play our side against the recorded opponent inputs.  The Brain's
   defence mode can be switched at/after the serve frame to emulate
   "stand mid to serve, then retreat to tie".
"""
import copy
import gzip
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, WS)

import engine_py as E
from brain_py import Brain

RUN = os.path.abspath(os.path.join(WS, "..", ".."))


def load(name):
    with gzip.open(os.path.join(RUN, name), "rt", encoding="utf-8") as f:
        return json.load(f)


def build_inputs(d):
    """team -> list indexed by frame of input dict (None outside windows)."""
    n = len(d["frames"])
    out = [[None] * n, [None] * n]
    for w in d["windows"]:
        end = w["frame"]
        for team in (0, 1):
            frames = w["inputs"][team]
            for i, fr in enumerate(frames):
                f = end - 10 + i
                if 0 <= f < n:
                    out[team][f] = fr[0]
    return out


def new_game(d):
    g = E.Match(seed=d["seed"], match_id=d["id"])
    return g


def replay(d, inputs, stop_frame=None, on_frame=None):
    g = new_game(d)
    me = d["seats"].index("deepseek-flash")
    limit = stop_frame if stop_frame is not None else len(d["frames"])
    for f in range(limit):
        for b in g.batsmen:
            inp = inputs[b["team"]][f]
            b["held"] = E.normalize_unit_input(inp) if inp else E.neutral()
        g.step()
        if on_frame:
            on_frame(f, g)
        if g.status != "playing":
            break
    return g


def verify(d, inputs):
    g = replay(d, inputs)
    final = g.view()
    ref = d["final"]
    ok = (final["score"] == ref["score"] and final["frame"] == ref["frame"]
          and [b["hits"] for b in final["batsmen"]] == [b["hits"] for b in ref["batsmen"]]
          and [b["smashes"] for b in final["batsmen"]] == [b["smashes"] for b in ref["batsmen"]])
    print(f"{d['id']}: replay score={final['score']} frame={final['frame']} "
          f"hits={[b['hits'] for b in final['batsmen']]} "
          f"smashes={[b['smashes'] for b in final['batsmen']]} -> {'OK' if ok else 'MISMATCH'}")
    if not ok:
        print("  ref", ref["score"], ref["frame"],
              [b["hits"] for b in ref["batsmen"]], [b["smashes"] for b in ref["batsmen"]])
    return ok


def point_segments(d):
    serves = [e for e in d["events"] if e["type"] == "serve"]
    points = [e for e in d["events"] if e["type"] == "point"]
    out = []
    for pe in points:
        se = [s for s in serves if s["frame"] <= pe["frame"]][-1]
        out.append((se, pe))
    return out


def run_point_from(d, inputs, serve_frame, def_mode, switch_at_serve=True,
                   switch_from="mid", max_frames=120):
    """Replay to the window start just before the serve, then let Brain play us."""
    me = d["seats"].index("deepseek-flash")
    opp = 1 - me
    start = max(0, (serve_frame // 10) * 10 - 10)
    # state at `start`
    state = {}

    def hook(f, g):
        if f == start - 1:
            state["game"] = copy.deepcopy(g)

    g = replay(d, inputs, stop_frame=start, on_frame=hook)
    if "game" not in state:
        state["game"] = copy.deepcopy(g)
    g = state["game"]
    brain = Brain(def_mode=switch_from if switch_at_serve else def_mode)
    brain.seen_event = 10 ** 9 if False else 0
    # feed one observation at the decision boundary, then 10-frame windows
    contacts = []
    prev_hits = [b["hits"] for b in g.batsmen]
    f = start
    while g.status == "playing" and f < start + max_frames:
        if f >= serve_frame and switch_at_serve:
            brain.def_mode = def_mode
        obs = g.view(me)
        win = brain.act(obs)
        win = [E.normalize_frame(x) for x in win]
        for i in range(10):
            if g.status != "playing":
                break
            for b in g.batsmen:
                if b["team"] == me:
                    b["held"] = win[i][0]
                else:
                    inp = inputs[opp][g.frame]
                    b["held"] = E.normalize_unit_input(inp) if inp else E.neutral()
            g.step()
            f = g.frame
            for k, b in enumerate(g.batsmen):
                if b["hits"] > prev_hits[k]:
                    contacts.append((g.frame, b["team"], b["x"],
                                     round(g.shuttle["y"], 2)))
                    prev_hits[k] = b["hits"]
            if g.phase == "point" or g.status != "playing":
                break
    return g, contacts


def main():
    for name in ("r1-g1.json.gz", "r1-g2.json.gz"):
        d = load(name)
        inputs = build_inputs(d)
        if not verify(d, inputs):
            continue
        me = d["seats"].index("deepseek-flash")
        print(f"\n{name}: counterfactual service points (me=team {me})")
        for mode, switch in (("mid", False), ("tie", True), ("tie", False)):
            wins = 0
            rows = []
            for se, pe in point_segments(d):
                if se["team"] != me:
                    continue
                g, contacts = run_point_from(d, inputs, se["frame"], mode,
                                             switch_at_serve=switch)
                last = g.lastPoint or {}
                won = last.get("winner") == me
                wins += won
                rows.append((se["frame"], won, last.get("x"), last.get("rally"),
                             [(c[0], c[1], c[2], c[3]) for c in contacts]))
            print(f"  mode={mode} switch_after_serve={switch}: won {wins}/{len(rows)}")
            for r in rows:
                print("   ", r)


if __name__ == "__main__":
    main()
