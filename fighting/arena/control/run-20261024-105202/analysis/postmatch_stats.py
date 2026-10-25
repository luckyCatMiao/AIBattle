# -*- coding: utf-8 -*-
"""Post-match statistics for the whole deepseek-flash vs sol series.

Reads the six archived replays (r1-g1 ... r3-g2), dedupes events, splits by
round, and prints per-round damage/block/move tables plus a chronological list
of supers and big hits with exact frame numbers.
"""
import gzip, json, sys, os
from collections import Counter, defaultdict

RUN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES = ["r1-g1", "r1-g2", "r2-g1", "r2-g2", "r3-g1", "r3-g2"]

CHAR = {"aegis": "Aegis", "vex": "Vex", "kestrel": "Kestrel",
        "torv": "Torv", "nyx": "Nyx", "sable": "Sable"}


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


def round_bounds(rep):
    out, cum = [], 0
    for r in rep["final"]["roundLog"]:
        out.append((cum, cum + r["frames"], r))
        cum += r["frames"]
    return out


def rnd_of(bounds, fr):
    for a, b, r in bounds:
        if a <= fr < b:
            return a, b, r
    a, b, r = bounds[-1]
    return a, b, r


def snap_at(rep, fr):
    best = None
    for s in rep["frames"]:
        if s.get("frame", 0) <= fr:
            best = s
        else:
            break
    return best


def hp_at(rep, fr, seat):
    s = snap_at(rep, fr)
    if not s:
        return None, None
    f = s["fighters"][seat]
    o = s["fighters"][1 - seat]
    return round(f["hp"]), round(o["hp"])


def main():
    for gid in GAMES:
        rep = load(gid)
        seat = rep["seats"].index("deepseek-flash")
        others = 1 - seat
        teams = rep["teams"]
        bounds = round_bounds(rep)
        evs = dedupe(rep)
        fin = rep["final"]
        me_name = rep["names"][seat]
        op_name = rep["names"][others]
        print("=" * 100)
        print(f"{gid} seed={rep['seed']} seats={rep['seats']} our_seat={seat}")
        print(f"teams: our={teams[seat]}  sol={teams[others]}")
        print(f"winner={rep['winner']} reason={rep['reason']} scores={rep['scores']} errors={rep['errors']}")
        print(f"sim frames={fin['frame']} now={fin['now']}s wall={rep['duration']}s windows={len(rep['windows'])}")
        print("official:", {p["name"]: {k: p[k] for k in
              ("damageDealt", "hits", "blocks", "throws", "parries", "maxCombo", "score")}
              for p in fin["players"]})
        print()
        print("round | dur(s) | matchup(our vs sol) | winner | startHP(us/sol) -> endHP | "
              "our dmg/hits | sol dmg/hits | our blk/sup | sol blk/sup | our maxcombo")
        for a, b, r in bounds:
            secs = (b - a) / 20.0
            sel = [e for e in evs if a <= e.get("frame", 0) < b]
            s0 = snap_at(rep, a)
            # matchup from first snapshot at/after round start
            s1 = None
            for s in rep["frames"]:
                if s.get("frame", 0) >= a:
                    s1 = s
                    break
            s1 = s1 or rep["frames"][-1]
            mchar = CHAR.get(s1["fighters"][seat]["char"], "?")
            achar = CHAR.get(s1["fighters"][1 - seat]["char"], "?")
            # roundLog already gives end hp of winner/loser; map to us/sol
            whp = r.get("winnerHp")
            lhp = r.get("loserHp")
            if r.get("winner") == me_name:
                end_us, end_op = whp, lhp
            elif r.get("winner") == op_name:
                end_us, end_op = lhp, whp
            else:
                # draw: read last snapshot
                end_us, end_op = "?", "?"
            st_us, st_op = (s1["fighters"][seat]["hp"], s1["fighters"][1 - seat]["hp"])
            def dh(o):
                h = [e for e in sel if e.get("type") == "hit" and e.get("owner") == o]
                return sum(e.get("damage", 0) for e in h), len(h)
            def bl(o):
                return sum(1 for e in sel if e.get("type") == "block" and e.get("owner") == o)
            def su(o):
                return sum(1 for e in sel if e.get("type") == "super" and e.get("owner") == o)
            od, oh = dh(seat)
            xd, xh = dh(others)
            # max combo per side from hit combo field
            cmb = defaultdict(int)
            for e in sel:
                if e.get("type") == "hit":
                    cmb[e.get("owner")] = max(cmb[e.get("owner")], e.get("combo") or 1)
            print(f"R{r['round']} | {secs:6.2f} | {mchar:7s} vs {achar:7s} | "
                  f"{'OURS' if r.get('winner') == me_name else ('SOL' if r.get('winner') == op_name else 'DRAW'):5s} | "
                  f"{round(st_us)}/{round(st_op)} -> {end_us}/{end_op} | {od}/{oh} | {xd}/{xh} | "
                  f"{bl(seat)}/{su(seat)} | {bl(others)}/{su(others)} | {cmb.get(seat, 0)}")
        print()

        # supers
        print("-- supers --")
        for e in evs:
            if e.get("type") == "super":
                a, b, r = rnd_of(bounds, e["frame"])
                who = "OURS " if e["owner"] == seat else "SOL  "
                print(f"  {who} R{r['round']} f{e['frame']} ({e['frame']/20:.2f}s) {e.get('text','')}")
        # hits >=130 or combo>=2
        print("-- notable hits (dmg>=130 or combo>=2) --")
        for e in evs:
            if e.get("type") != "hit":
                continue
            if e.get("damage", 0) >= 130 or (e.get("combo") or 1) >= 2:
                a, b, r = rnd_of(bounds, e["frame"])
                who = "OURS" if e["owner"] == seat else "SOL "
                print(f"  {who} R{r['round']} f{e['frame']} ({e['frame']/20:.2f}s) dmg={e.get('damage')} combo={e.get('combo')}")
        print()

        # move counts by owner / round
        print("-- move starts (deduped) by side --")
        for a, b, r in bounds:
            sel = [e for e in evs if a <= e.get("frame", 0) < b and e.get("type") == "move"]
            ours = Counter(e.get("name") for e in sel if e.get("owner") == seat)
            theirs = Counter(e.get("name") for e in sel if e.get("owner") == others)
            print(f"  R{r['round']} OUR {dict(ours)}")
            print(f"  R{r['round']} SOL {dict(theirs)}")
        print()

        # whiff runs (same move >= 5 consecutive starts by one owner)
        print("-- repeated move runs (>=5 consecutive same move) --")
        for a, b, r in bounds:
            sel = [e for e in evs if a <= e.get("frame", 0) < b and e.get("type") == "move"]
            for owner in (seat, others):
                seq = [e for e in sel if e.get("owner") == owner]
                runs = []
                for e in seq:
                    if runs and runs[-1][0] == e.get("name"):
                        runs[-1][1].append(e["frame"])
                    else:
                        runs.append([e.get("name"), [e["frame"]]])
                for name, fs in runs:
                    if len(fs) >= 5:
                        who = "OURS" if owner == seat else "SOL"
                        print(f"  {who} R{r['round']} {name} x{len(fs)} f{fs[0]}..{fs[-1]} span={(fs[-1]-fs[0])/20:.2f}s")
        print()

        # our per-round attack/hit efficiency
        print("-- our offense efficiency per round --")
        for a, b, r in bounds:
            sel = [e for e in evs if a <= e.get("frame", 0) < b]
            starts = [e for e in sel if e.get("type") == "move" and e.get("owner") == seat]
            hits = [e for e in sel if e.get("type") == "hit" and e.get("owner") == seat]
            print(f"  R{r['round']}: moveStarts={len(starts)} hits={len(hits)} "
                  f"hit/start={len(hits)/len(starts) if starts else 0:.2f} dmg={sum(e.get('damage',0) for e in hits)}")
        print()

        # timeline of round starts and endings
        print("-- round boundaries --")
        for a, b, r in bounds:
            print(f"  R{r['round']}: frames {a}..{b} ({a/20:.2f}s..{b/20:.2f}s) "
                  f"winner={r.get('winner')} reason={r.get('reason')} picks="
                  f"{r.get('winnerChar')} vs {r.get('loserChar')}")
        print()


if __name__ == "__main__":
    main()
