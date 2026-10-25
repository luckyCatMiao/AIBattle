"""Serve-defence detail: where am I standing when the opponent returns my serve?"""
import gzip
import json
import os

RUN = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def load(name):
    with gzip.open(os.path.join(RUN, name), "rt", encoding="utf-8") as f:
        return json.load(f)


def main():
    for gname in ("r1-g1.json.gz", "r1-g2.json.gz"):
        d = load(gname)
        me = d["seats"].index("deepseek-flash")
        opp = 1 - me
        by_frame = {fr["frame"]: fr for fr in d["frames"]}
        serves = [e for e in d["events"] if e["type"] == "serve" and e["team"] == me]
        print("=" * 110)
        print(gname, "seats", d["seats"], "me", me)
        print(f"{'#':>2} {'serveF':>6} {'myX@serve':>9} {'oppF':>5} {'myX@oppHit':>10} "
              f"{'myVx':>6} {'landX':>6} {'framesToLand':>12} {'oppHitY':>7} {'oppSwing':>8} "
              f"{'myMove':>22} mySwingFrames")
        # collect hits by opponent after each serve
        pn = 0
        for se in serves:
            pn += 1
            start = se["frame"]
            # next point event
            pe = next(e for e in d["events"] if e["type"] == "point" and e["frame"] > start)
            # opponent hit frames in segment (counters are cumulative)
            prev_h = by_frame[max(0, start - 1)]["batsmen"][opp]["hits"]
            opp_hits = []
            for f in range(start, pe["frame"] + 1):
                b = by_frame[f]["batsmen"][opp]
                if b["hits"] > prev_h:
                    opp_hits.append(f)
                    prev_h = b["hits"]
            if not opp_hits:
                continue
            hf = opp_hits[0]
            sf = by_frame[start]
            hfr = by_frame[hf]
            my = hfr["batsmen"][me]
            op = hfr["batsmen"][opp]
            land = pe["x"]
            # my inputs in the 10 frames ending at opponent hit (window granularity 10)
            win_start = max(start, (hf // 10) * 10 - 10)
            moves = []
            for f in range(win_start, hf + 1):
                # inputs are not in frames; skip
                pass
            # find windows covering
            ws = [w for w in d["windows"] if w["frame"] - 10 < hf <= w["frame"]]
            mv = []
            for w in ws:
                frames = w["inputs"]
                for i, fr_in in enumerate(frames):
                    ff = w["frame"] - 10 + i
                    if win_start <= ff <= hf:
                        entry = fr_in[me]
                        if isinstance(entry, list):
                            entry = entry[0]
                        mv.append(f"{entry.get('move', 0):+.1f}")
            print(f"{pn:2d} {start:6d} {sf['batsmen'][me]['x']:9.2f} {hf:5d} "
                  f"{my['x']:10.2f} {my['vx']:6.2f} {land:6.2f} "
                  f"{(pe['frame']-hf):12d} {hfr['shuttle']['y']:7.2f} "
                  f"{'over' if op['swingType']==1 else 'under':>8} "
                  f"{' '.join(mv):>22} {my['swinging']}/{my['swingElapsed']}")
        # also opponent serve points for comparison: where am I at my return contact
        print("-" * 110)
        print("opponent serve points: my return contact")
        serves = [e for e in d["events"] if e["type"] == "serve" and e["team"] == opp]
        pn = 0
        for se in serves:
            pn += 1
            start = se["frame"]
            pe = next(e for e in d["events"] if e["type"] == "point" and e["frame"] > start)
            prev_h = by_frame[max(0, start - 1)]["batsmen"][me]["hits"]
            my_hits = []
            for f in range(start, pe["frame"] + 1):
                b = by_frame[f]["batsmen"][me]
                if b["hits"] > prev_h:
                    my_hits.append(f)
                    prev_h = b["hits"]
            if not my_hits:
                print(f"{pn:2d} serveF {start:4d} NO RETURN land {pe['x']:.2f} winner "
                      f"{'ME' if pe['team']==me else 'OPP'}")
                continue
            hf = my_hits[0]
            my = by_frame[hf]["batsmen"][me]
            print(f"{pn:2d} serveF {start:4d} myHitF {hf:4d} myX {my['x']:5.2f} "
                  f"contactY {by_frame[hf]['shuttle']['y']:4.2f} "
                  f"land {pe['x']:5.2f} winner {'ME' if pe['team']==me else 'OPP'}")


if __name__ == "__main__":
    main()
