# -*- coding: utf-8 -*-
"""Dump hit-by-hit context for selected rounds of the series."""
import gzip, json, os, sys

RUN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR = {"aegis": "Aegis", "vex": "Vex", "kestrel": "Kestrel"}


def load(gid):
    with gzip.open(os.path.join(RUN, gid + ".json.gz"), "rt", encoding="utf-8") as f:
        return json.load(f)


def dedupe(rep):
    seen, evs = set(), []
    for s in rep["frames"]:
        for e in s.get("events") or []:
            if e.get("id") in seen:
                continue
            seen.add(e.get("id"))
            evs.append(e)
    return evs


def main(gid, want_round):
    rep = load(gid)
    seat = rep["seats"].index("deepseek-flash")
    evs = dedupe(rep)
    bounds, cum = [], 0
    for r in rep["final"]["roundLog"]:
        bounds.append((cum, cum + r["frames"], r))
        cum += r["frames"]
    a, b, r = bounds[want_round - 1]
    sel = [e for e in evs if a <= e.get("frame", 0) < b]
    wins = rep["windows"]

    def our_input(fr):
        idx = (fr - 1) // 15
        off = (fr - 1) % 15
        if idx < 0 or idx >= len(wins):
            return "?"
        try:
            return wins[idx]["inputs"][seat][off]
        except Exception:
            return "?"

    def snap_before(fr):
        best = None
        for s in rep["frames"]:
            if s.get("frame", 0) <= fr:
                best = s
            else:
                break
        return best

    print(f"=== {gid} round {want_round}: frames {a}..{b}, {r.get('frames')/20:.2f}s, winner={r.get('winner')} ===")
    print(f"our team {rep['teams'][seat]} sol team {rep['teams'][1-seat]}")
    # move starts around each hit: track last move start per owner
    last_move = {-1: None}
    events = sorted(sel, key=lambda e: (e.get("frame", 0), e.get("id", 0)))
    for e in events:
        fr = e.get("frame", 0)
        ty = e.get("type")
        if ty == "move":
            owner = e.get("owner")
            who = "OURS" if owner == seat else "SOL"
            c = ""
            print(f"  f{fr:5d} r{fr-a:5d} {fr/20:7.2f}s {who:4s} START {e.get('name')} x={e.get('x')} inp={our_input(fr)}")
        elif ty == "hit":
            s = snap_before(fr)
            me = s["fighters"][seat] if s else {}
            op = s["fighters"][1 - seat] if s else {}
            who = "OURS" if e.get("owner") == seat else "SOL"
            print(f"  f{fr:5d} r{fr-a:5d} {fr/20:7.2f}s {who:4s} HIT dmg={e.get('damage')} combo={e.get('combo')} "
                  f"hp={round(me.get('hp',0))}/{round(op.get('hp',0))} "
                  f"state={me.get('state')}/{op.get('state')} inp={our_input(fr)}")
        elif ty in ("super", "block"):
            who = "OURS" if e.get("owner") == seat else "SOL"
            print(f"  f{fr:5d} r{fr-a:5d} {fr/20:7.2f}s {who:4s} {ty.upper()} {e.get('text','')}")
        elif ty in ("ko", "suddenDeath", "roundEnd", "down"):
            print(f"  f{fr:5d} r{fr-a:5d} {fr/20:7.2f}s EVENT {ty} {e.get('text','')}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
