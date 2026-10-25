"""Round-1 replay analysis for deepseek-flash.

Reads the referee archives from the run directory and prints a per-point
breakdown, contact geometry and serve-defence positions.
"""
import gzip
import json
import os
import sys

RUN = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
NET = 6.7


def load(name):
    with gzip.open(os.path.join(RUN, name), "rt", encoding="utf-8") as f:
        return json.load(f)


def team_of(seat_name, d):
    return d["seats"].index(seat_name)


def frames_index(d):
    out = []
    for fr in d["frames"]:
        b = fr["batsmen"]
        out.append({
            "frame": fr["frame"],
            "t": fr["frame"] / 20.0,
            "phase": fr["phase"],
            "server": fr["server"],
            "score": fr["score"],
            "rally": fr["rally"],
            "shuttle": fr["shuttle"],
            "b": b,
        })
    return out


def contacts(fi):
    """Frames where either player's hit counter increases."""
    out = []
    prev = [0, 0]
    prev_sm = [0, 0]
    for rec in fi:
        for i in (0, 1):
            h = rec["b"][i]["hits"]
            if h > prev[i]:
                out.append({
                    "frame": rec["frame"],
                    "team": i,
                    "x": rec["b"][i]["x"],
                    "y": rec["b"][i]["y"],
                    "contact_y": rec["shuttle"]["y"],
                    "contact_x": rec["shuttle"]["x"],
                    "swingType": rec["b"][i]["swingType"],
                    "smash": rec["b"][i]["smashes"] > prev_sm[i],
                    "shuttle_vx": rec["shuttle"]["vx"],
                    "shuttle_vy": rec["shuttle"]["vy"],
                })
                prev[i] = h
                prev_sm[i] = rec["b"][i]["smashes"]
    return out


def point_segments(d):
    """Return list of dicts, one per point, from serve event to point event."""
    ev = d["events"]
    points = [e for e in ev if e["type"] == "point"]
    serves = [e for e in ev if e["type"] == "serve"]
    segs = []
    for pe in points:
        prior = [s for s in serves if s["frame"] <= pe["frame"]]
        se = prior[-1] if prior else None
        start = se["frame"] if se else 0
        segs.append({"serve": se, "point": pe, "start": start, "end": pe["frame"]})
    return segs


def main():
    who = "deepseek-flash"
    for gname in ("r1-g1.json.gz", "r1-g2.json.gz"):
        d = load(gname)
        me = team_of(who, d)
        opp = 1 - me
        fi = frames_index(d)
        cons = contacts(fi)
        segs = point_segments(d)
        print("=" * 100)
        print(f"{gname}  seats={d['seats']}  my_team={me}  winner={d['winner']} "
              f"score={d['final']['score']} longest={d['final']['longestRally']}")
        # per point
        for idx, seg in enumerate(segs, 1):
            pe, se = seg["point"], seg["serve"]
            in_seg = [c for c in cons if seg["start"] < c["frame"] <= seg["end"]]
            mine = [c for c in in_seg if c["team"] == me]
            theirs = [c for c in in_seg if c["team"] == opp]
            winner = pe["team"]
            served_by = se["team"] if se else None
            # our position when opponent hits (only relevant when we serve)
            pos_at_opp_contact = None
            if served_by == me and theirs:
                c = theirs[-1]
                pos_at_opp_contact = c["x"]
            print(f"\nP{idx:02d} frame {seg['start']:4d}->{seg['end']:4d} "
                  f"t={pe['t']:6.2f} score={pe['score']} rally={pe['rally']} "
                  f"server={'ME' if served_by == me else 'OPP'} "
                  f"winner={'ME' if winner == me else 'OPP'} "
                  f"land_x={pe['x']:.2f} reason={pe['reason']}")
            print("   mine : " + " | ".join(
                f"f{c['frame']} x{c['x']:.2f} y{c['contact_y']:.2f} "
                f"{'SMASH' if c['smash'] else ('over' if c['swingType'] == 1 else 'under')}"
                for c in mine))
            print("   theirs: " + " | ".join(
                f"f{c['frame']} x{c['x']:.2f} y{c['contact_y']:.2f} "
                f"{'SMASH' if c['smash'] else ('over' if c['swingType'] == 1 else 'under')}"
                for c in theirs))
            if pos_at_opp_contact is not None:
                print(f"   my x at their contact: {pos_at_opp_contact:.2f}; "
                      f"their shuttle v=({theirs[-1]['shuttle_vx']:.1f},{theirs[-1]['shuttle_vy']:.1f})")
            # last 8 frames trajectory before point
            tail = fi[max(0, seg['end'] - 8):seg['end'] + 1]
            print("   tail: " + " ".join(
                f"[{r['frame']} x{r['shuttle']['x']:.2f} y{r['shuttle']['y']:.2f}]"
                for r in tail))
            # my movement inputs around first opponent contact after serve
            if served_by == me:
                w0 = max(seg["start"], (theirs[0]["frame"] - 20) if theirs else seg["start"])
                ws = [w for w in d["windows"] if w0 <= w["frame"] <= seg["end"]]
                moves = []
                for w in ws:
                    inp = w["inputs"][me]["move"] if isinstance(w["inputs"][me], dict) else None
                # inputs are list of 10 frames each with per-seat list
        # summary
        print("\n" + "-" * 100)
        my_serve = [s for s in segs if s["serve"] and s["serve"]["team"] == me]
        opp_serve = [s for s in segs if s["serve"] and s["serve"]["team"] == opp]
        print(f"my serve points: {len(my_serve)}, won: "
              f"{sum(1 for s in my_serve if s['point']['team'] == me)}")
        print(f"opp serve points: {len(opp_serve)}, won: "
              f"{sum(1 for s in opp_serve if s['point']['team'] == me)}")
        rl = {}
        for s in segs:
            rl[s["point"]["rally"]] = rl.get(s["point"]["rally"], 0) + 1
        print("rally histogram:", dict(sorted(rl.items())))
        for side, name in ((me, "ME"), (opp, "OPP")):
            hs = sum(1 for c in cons if c["team"] == side)
            sm = sum(1 for c in cons if c["team"] == side and c["smash"])
            print(f"{name} contacts={hs} smashes={sm}")
        # where do winners land
        print("landing x by winner:",
              {("ME" if s["point"]["team"] == me else "OPP"):
               round(s["point"]["x"], 2) for s in segs})


if __name__ == "__main__":
    main()
