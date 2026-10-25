"""Round-2 replay analysis for the badminton arena.

Usage:
    python -I dev/analyze_r2.py r2-g1.json.gz r2-g2.json.gz

Reads the referee replay files only; writes nothing. The numbers printed here
are the ones used in review.md (score order is always "us:sol").
"""
import gzip
import json
import sys

OURS = "deepseek-flash"


def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def analyze(path):
    d = load(path)
    seats = d["seats"]
    us = seats.index(OURS)
    them = 1 - us
    frames = d["frames"]
    points = [e for e in d["events"] if e["type"] == "point"]
    serves = [e for e in d["events"] if e["type"] == "serve"]
    nets = [e for e in d["events"] if e["type"] == "net"]
    final = d["final"]
    bats = final["batsmen"]

    def score_us(e):
        return f"{e['score'][us]}:{e['score'][them]}"

    def server_of(e):
        sv = [s for s in serves if s["frame"] <= e["frame"]]
        return sv[-1]["team"] if sv else 0

    def stamina_at(frame):
        idx = max(0, min(len(frames) - 1, frame - 1))
        return [round(b["stamina"], 1) for b in frames[idx]["batsmen"]]

    print("=" * 78)
    print(f"{d['id']}  seed={d['seed']}  net={d['court']['netHeight']}  seats={seats}")
    print(f"score={score_us(final)}  winner={seats[final['winner']]}  "
          f"longestRally={final['longestRally']}  frames={len(frames)}  "
          f"windows={len(d['windows'])}  duration={d['duration']}s  "
          f"errors={d['errors']}  technicalFailure={d['technicalFailure']}")
    print(f"clock={final['tick'] * 0.05:.2f}s  final stamina="
          f"{bats[us]['stamina']}:{bats[them]['stamina']}  "
          f"hits={bats[us]['hits']}:{bats[them]['hits']}  "
          f"smashes={bats[us]['smashes']}:{bats[them]['smashes']}")

    print("\n-- score progression (us:sol) --")
    print(" -> ".join(["0:0"] + [score_us(e) for e in points]))

    print("\n-- points --")
    prev_t = 0.0
    for i, e in enumerate(points):
        sv = server_of(e)
        st = stamina_at(e["frame"])
        print(f"P{i + 1:02d} t={e['t']:7.2f} dur={e['t'] - prev_t:6.2f} "
              f"score={score_us(e)} server={seats[sv]} scorer={seats[e['team']]} "
              f"rally={e['rally']:2d} endx={e['x']:.2f} stamina={st} "
              f"reason={e['reason'].encode('unicode_escape').decode()}")
        prev_t = e["t"] + 1.5

    print("\n-- service stats --")
    for team in (0, 1):
        serve_pts = 0
        holds = 0
        for e in points:
            if server_of(e) == team:
                serve_pts += 1
                if e["team"] == team:
                    holds += 1
        print(f"{seats[team]}: serve points={serve_pts} holds={holds} "
              f"breaks={sum(1 for e in points if e['team'] == team) - holds}")

    print("\n-- our serve losses by rally length --")
    buckets = {"1": 0, "2-4": 0, "5-9": 0, "10-19": 0, "20+": 0}
    for e in points:
        if server_of(e) == us and e["team"] != us:
            r = e["rally"]
            key = ("1" if r == 1 else "2-4" if r <= 4 else "5-9" if r <= 9
                   else "10-19" if r <= 19 else "20+")
            buckets[key] += 1
    print(buckets)

    print("\n-- longest rallies --")
    for e in sorted(points, key=lambda x: -x["rally"])[:5]:
        sv = [s for s in serves if s["frame"] <= e["frame"]]
        start = sv[-1]["frame"] if sv else e["frame"]
        print(f"rally={e['rally']:2d} score={score_us(e)} "
              f"dur={(e['frame'] - start) * 0.05:5.1f}s "
              f"scorer={seats[e['team']]} endx={e['x']:.2f}")

    print("\n-- net faults --")
    for e in nets:
        print(f"t={e['t']:.2f} frame={e['frame']} by={seats[e['team']]} "
              f"x={e['x']:.2f} y={e['y']:.2f}")

    print("\n-- stamina / movement --")
    for team, name in enumerate(seats):
        vals = [fr["batsmen"][team]["stamina"] for fr in frames]
        bs = [fr["batsmen"][team] for fr in frames]
        n = len(bs)
        first15 = next((i for i, v in enumerate(vals) if v <= 15), None)
        first0 = next((i for i, v in enumerate(vals) if v <= 0.01), None)
        low = sum(1 for v in vals if v <= 15)
        regen = sum(1 for b in bs if abs(b["vx"]) < 0.8)
        dead = sum(1 for b in bs if 0.8 <= abs(b["vx"]) <= 3.2)
        moving = sum(1 for b in bs if abs(b["vx"]) > 0.15)
        air = sum(1 for b in bs if not b["onGround"])
        sprint = sum(1 for b in bs if b["sprinting"])
        print(f"{name}: first<=15={None if first15 is None else round(first15 * 0.05, 1)}s "
              f"first0={None if first0 is None else round(first0 * 0.05, 1)}s "
              f"<=15={low / n:.0%} regen={regen / n:.0%} dead={dead / n:.0%} "
              f"moving={moving / n:.0%} airborne={air} sprint={sprint}")

    print("\n-- empty swings --")
    for team, name in enumerate(seats):
        bs = [fr["batsmen"][team] for fr in frames]
        starts = []
        prev = 0
        for i, b in enumerate(bs):
            if b["swing"] > prev and b["swing"] >= 8:
                starts.append(i)
            prev = b["swing"]
        hit_frames = []
        ph = 0
        for i, b in enumerate(bs):
            if b["hits"] > ph:
                hit_frames.append(i)
            ph = b["hits"]
        empty = [s for s in starts if not any(s <= h <= s + 12 for h in hit_frames)]
        print(f"{name}: swings={len(starts)} hits={len(hit_frames)} "
              f"empty={len(empty)} ({len(empty) / len(starts):.1%})")
        for s in empty:
            fr = frames[s]
            sh = fr["shuttle"]
            nx = next((e for e in points if e["frame"] >= s), None)
            print(f"   frame={s} t={s * 0.05:.2f} phase={fr['phase']} "
                  f"score={score_us(fr)} rally={fr['rally']} "
                  f"shuttle=({sh['x']:.2f},{sh['y']:.2f}) "
                  f"next={score_us(nx) if nx else None}"
                  f"/{seats[nx['team']] if nx else None}")

    print("\n-- tail smash events (final.events only; tail is capped) --")
    tail = [e for e in final["events"] if e["type"] == "hit" and e["kind"] == "smash"]
    for team, name in enumerate(seats):
        sp = [e["speed"] for e in tail if e["team"] == team]
        if sp:
            print(f"{name}: n={len(sp)} speeds={[round(x, 1) for x in sp]}")
        else:
            print(f"{name}: no smash in tail")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__.strip())
        raise SystemExit(1)
    for path in sys.argv[1:]:
        analyze(path)
