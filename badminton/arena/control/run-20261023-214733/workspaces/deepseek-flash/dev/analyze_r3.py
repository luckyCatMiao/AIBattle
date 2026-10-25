"""Round-3 replay analysis for the badminton arena.

Usage:
    python -I -X utf8 dev/analyze_r3.py r3-g1.json.gz r3-g2.json.gz

Reads the referee replay files only; writes nothing.
Score order in every printout is "us:sol" (us = deepseek-flash).
"""
import gzip
import json
import math
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
    events = d["events"]
    points = [e for e in events if e["type"] == "point"]
    serves = [e for e in events if e["type"] == "serve"]
    nets = [e for e in events if e["type"] == "net"]
    final = d["final"]
    bats = final["batsmen"]

    def sc(e):
        return f"{e['score'][us]}:{e['score'][them]}"

    def idx(frame):
        return max(0, min(len(frames) - 1, frame - 1))

    def server_of(frame):
        sv = [s for s in serves if s["frame"] <= frame]
        return sv[-1]["team"] if sv else 0

    print("=" * 90)
    print(f"{d['id']} seed={d['seed']} net={d['court']['netHeight']:.2f} seats={seats}")
    print(f"score={final['score'][us]}:{final['score'][them]} winner={seats[final['winner']]} "
          f"longestRally={final['longestRally']} frames={len(frames)} "
          f"windows={len(d['windows'])} duration={d['duration']}s errors={d['errors']}")
    print(f"final stamina us:them = {bats[us]['stamina']:.1f}:{bats[them]['stamina']:.1f}  "
          f"hits={bats[us]['hits']}:{bats[them]['hits']} "
          f"smashes={bats[us]['smashes']}:{bats[them]['smashes']}")

    # ---- hits reconstructed from the per-frame hit counter ----
    hits = []  # (frame, team, pos, prev_stamina, swing_type, airborne, shuttle_after)
    prev = [0, 0]
    for i, fr in enumerate(frames):
        for team in (0, 1):
            b = fr["batsmen"][team]
            if b["hits"] > prev[team]:
                for _ in range(b["hits"] - prev[team]):
                    nxt = frames[min(i + 1, len(frames) - 1)]
                    hits.append({
                        "frame": i, "t": i * 0.05, "team": team,
                        "x": b["x"], "y": b["y"], "air": not b["onGround"],
                        "stamina": b["stamina"], "swingType": b["swingType"],
                        "shuttle_x": fr["shuttle"]["x"], "shuttle_y": fr["shuttle"]["y"],
                        "vx": nxt["shuttle"]["vx"], "vy": nxt["shuttle"]["vy"],
                        "speed": math.hypot(nxt["shuttle"]["vx"], nxt["shuttle"]["vy"]),
                    })
                prev[team] = b["hits"]
    for h in hits:
        h["kind"] = classify(h)

    # ---- points table ----
    print("\n-- points (us:sol) --")
    prev_t = 0.0
    for i, e in enumerate(points):
        st = frames[idx(e["frame"])]["batsmen"]
        sv = server_of(e["frame"])
        print(f"P{i+1:02d} t={e['t']:7.2f} gap={e['t']-prev_t:6.2f} score={sc(e)} "
              f"srv={seats[sv]:<14} w={seats[e['team']]:<14} rally={e['rally']:2d} "
              f"endx={e['x']:5.2f} sta={st[us]['stamina']:5.1f}:{st[them]['stamina']:5.1f} "
              f"reason={e['reason']}")
        prev_t = e["t"] + 1.5
    print("progression: " + " -> ".join(["0:0"] + [sc(e) for e in points]))

    # ---- per-rally detail ----
    print("\n-- rally detail (hits: frame t team pos air kind speed) --")
    for i, e in enumerate(points):
        start = e["frame"]
        sv = [s for s in serves if s["frame"] <= e["frame"]]
        if sv:
            start = sv[-1]["frame"]
        rally_hits = [h for h in hits if start <= h["frame"] <= e["frame"]]
        desc = []
        for h in rally_hits:
            who = "US " if h["team"] == us else "sol"
            air = "J" if h["air"] else " "
            desc.append(f"{who}{air}{h['kind'][:2]}@{h['speed']:.0f}")
        print(f"P{i+1:02d} {sc(e):>5} srv={'us' if server_of(e['frame'])==us else 'sol':<3} "
              f"w={'us' if e['team']==us else 'sol':<3} r={e['rally']:2d} | " + " ".join(desc))

    # ---- shot stats ----
    print("\n-- shot stats --")
    for team, name in ((us, "US"), (them, "sol")):
        hs = [h for h in hits if h["team"] == team]
        kinds = {}
        for h in hs:
            kinds.setdefault(h["kind"], []).append(h["speed"])
        jumps = sum(1 for h in hs if h["air"])
        print(f"{name}: hits={len(hs)} jumps={jumps} airborne_hits={jumps}")
        for k, v in sorted(kinds.items(), key=lambda kv: -len(kv[1])):
            print(f"   {k:<6} n={len(v):2d} speeds={[round(x,1) for x in v]}")
        sm = [h for h in hs if h["kind"] == "smash"]
        fast = [h for h in sm if h["speed"] >= 14]
        print(f"   smash>=14: {len(fast)}/{len(sm)}")

    # ---- outcome of our last hit in each point ----
    print("\n-- point endings --")
    for i, e in enumerate(points):
        sv = [s for s in serves if s["frame"] <= e["frame"]]
        start = sv[-1]["frame"] if sv else 0
        rally_hits = [h for h in hits if start <= h["frame"] <= e["frame"]]
        last = rally_hits[-1] if rally_hits else None
        if last:
            who = "us" if last["team"] == us else "sol"
            print(f"P{i+1:02d} {sc(e):>5} winner={'us' if e['team']==us else 'sol'} "
                  f"last_hit={who} {last['kind']} {last['speed']:.1f} "
                  f"from=({last['shuttle_x']:.2f},{last['shuttle_y']:.2f}) "
                  f"endx={e['x']:.2f} reason={e['reason']}")
        else:
            print(f"P{i+1:02d} {sc(e):>5} no hit in rally (serve fault) reason={e['reason']}")

    # ---- net faults ----
    print("\n-- net faults --")
    for e in nets:
        print(f"t={e['t']:.2f} frame={e['frame']} by={seats[e['team']]} x={e['x']:.2f} y={e['y']:.2f}")

    # ---- empty swings ----
    print("\n-- swings / empty swings --")
    for team, name in enumerate(seats):
        bs = [fr["batsmen"][team] for fr in frames]
        starts, prev_s = [], 0
        for i, b in enumerate(bs):
            if b["swing"] > prev_s and b["swing"] >= 8:
                starts.append(i)
            prev_s = b["swing"]
        hit_frames = [h["frame"] for h in hits if h["team"] == team]
        empty = [s for s in starts if not any(s <= h <= s + 14 for h in hit_frames)]
        print(f"{name}: swing_starts={len(starts)} hits={len(hit_frames)} "
              f"empty={len(empty)} ({len(empty)/max(1,len(starts)):.0%})")
        for s in empty:
            fr = frames[s]
            nx = next((e for e in points if e["frame"] >= s), None)
            print(f"   frame={s} t={s*0.05:.2f} phase={fr['phase']} score={sc(fr)} "
                  f"shuttle=({fr['shuttle']['x']:.2f},{fr['shuttle']['y']:.2f}) "
                  f"me=({fr['batsmen'][team]['x']:.2f},{fr['batsmen'][team]['y']:.2f})")

    # ---- stamina / movement ----
    print("\n-- stamina / movement --")
    for team, name in enumerate(seats):
        bs = [fr["batsmen"][team] for fr in frames]
        vals = [b["stamina"] for b in bs]
        n = len(bs)
        first15 = next((i for i, v in enumerate(vals) if v <= 15), None)
        first0 = next((i for i, v in enumerate(vals) if v <= 0.01), None)
        low = sum(1 for v in vals if v <= 15) / n
        regen = sum(1 for b in bs if abs(b["vx"]) < 0.8) / n
        dead = sum(1 for b in bs if 0.8 <= abs(b["vx"]) <= 3.2) / n
        air = sum(1 for b in bs if not b["onGround"])
        sprint = sum(1 for b in bs if b["sprinting"])
        minsta = min(vals)
        print(f"{name}: first<=15={None if first15 is None else round(first15*0.05,1)}s "
              f"first<=0.01={None if first0 is None else round(first0*0.05,1)}s "
              f"min={minsta:.1f} <=15={low:.0%} regen={regen:.0%} dead={dead:.0%} "
              f"airborne_frames={air} sprint_frames={sprint}")

    # ---- service / break stats ----
    print("\n-- serve stats --")
    for team in (0, 1):
        sp = [e for e in points if server_of(e["frame"]) == team]
        holds = [e for e in sp if e["team"] == team]
        print(f"{seats[team]}: serve_points={len(sp)} holds={len(holds)} "
              f"win_rate={len(holds)/max(1,len(sp)):.0%} "
              f"lost_rallies={[e['rally'] for e in sp if e['team'] != team]}")

    # ---- first-hit-after-serve geometry ----
    print("\n-- first return after serve --")
    for team, name in ((us, "US"), (them, "sol")):
        ret = []
        for e in points:
            sv = [s for s in serves if s["frame"] <= e["frame"]]
            if not sv:
                continue
            server = sv[-1]["team"]
            if server == team:
                continue
            rally_hits = [h for h in hits if sv[-1]["frame"] <= h["frame"] <= e["frame"]]
            if rally_hits:
                ret.append(rally_hits[0])
        if ret:
            print(f"{name}: n={len(ret)} "
                  f"x={[round(h['shuttle_x'],2) for h in ret]} "
                  f"y={[round(h['shuttle_y'],2) for h in ret]} "
                  f"kinds={[h['kind'] for h in ret]} "
                  f"speeds={[round(h['speed'],1) for h in ret]}")


def classify(h):
    vx, vy = abs(h["vx"]), h["vy"]
    if vx < 1e-6 and abs(vy) < 1e-6:
        return "dead"
    ang = math.atan2(vy, vx)
    if h["swingType"] == -1:
        return "lift"
    if ang < -0.15:
        return "smash"
    if ang < 0.30:
        return "drive"
    if ang < 0.80:
        return "clear"
    return "lift"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__.strip())
        raise SystemExit(1)
    for path in sys.argv[1:]:
        analyze(path)
