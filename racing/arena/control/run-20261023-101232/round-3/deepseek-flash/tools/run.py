# -*- coding: utf-8 -*-
"""Offline single-car race runner: real agent.Driver + exact physics, no subprocess.

usage: python tools/run.py <tracks.json> [--limit N] [--verbose]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import eng  # noqa: E402

TRACE = os.environ.get("TRACE") == "1"
TRACE_F = open(os.environ.get("TRACE_OUT", "tools/data/trace.jsonl"), "w", buffering=1) if TRACE else None
import agent  # noqa: E402


CP_RATIOS = []
CP_DANGER = []

def run_one(tr, verbose=False, params=None, seat=0):
    track = eng.Track(tr)
    if params:
        agent.P.update(params)
    drv = agent.Driver()
    car = eng.Car(track.P[0][0], track.P[0][1], track.seg[0])
    # use the real grid: end of track minus 4
    s0 = (track.L - (4.0 + 4.0 * seat)) % track.L
    side = -1.6 if seat == 0 else 1.6
    lo = track
    # position on centerline at s0
    acc = 0.0
    for i in range(track.n):
        if acc + track.seglen[i] >= s0:
            t = (s0 - acc) / max(track.seglen[i], 1e-9)
            a = track.P[i]
            b = track.P[(i + 1) % track.n]
            car.x = a[0] + (b[0] - a[0]) * t
            car.y = a[1] + (b[1] - a[1]) * t
            car.angle = track.seg[i]
            # grid slot 0: 1.6 to the left of the tangent
            car.x += -math.sin(car.angle) * side
            car.y += math.cos(car.angle) * side
            break
        acc += track.seglen[i]

    obs_base = {
        "seed": tr.get("seed"),
        "status": "playing", "phase": "countdown", "yourPlayer": 0,
        "track": {
            "width": tr["width"], "height": tr["height"],
            "tiles": ([ord(c) - 48 for c in tr["tiles"]] if isinstance(tr["tiles"], str) else tr["tiles"]),
            "points": tr["points"], "halfWidth": tr["halfWidth"],
            "length": tr["length"], "checkpoints": tr["checkpoints"],
        },
    }
    frames_total = 0
    off_frames = 0
    boost_frames = 0
    drift_frames = 0
    charge_sum = 0.0
    path_len = 0.0
    ev = []
    lap_times = []
    speeds = []
    max_speed = 0.0
    min_cp_clear = 9.9
    status = "playing"

    # countdown: 1.5s = 30 frames, engine does not move cars / no progress update
    cdFrames = 30
    fr = cdFrames
    car.lapStart = cdFrames / 20.0
    guard = 0
    while not car.finished and guard < 150 * 20:
        guard += 1
        obs = dict(obs_base)
        obs["cars"] = [{
            "x": car.x, "y": car.y, "angle": car.angle, "vx": car.vx, "vy": car.vy,
            "driftCharge": car.driftCharge, "boostEnergy": car.boostEnergy,
            "nextCp": car.nextCp, "drifting": car.drifting, "speed": math.hypot(car.vx, car.vy), "boosting": car.boosting, "offRoad": car.offRoad,
        }]
        obs["countdownLeft"] = 0
        win = drv.window(obs)["inputs"]
        for f in win:
            inp = f[0] if isinstance(f, list) else f
            if car.finished:
                break
            fr += 1
            frames_total += 1
            ev.clear(); eng.update_car(track, car, inp, ev)
            for e in ev:
                if e[0] == "charge":
                    charge_sum += e[1]
            path_len += math.hypot(car.vx, car.vy) * eng.DT
            _old_cp = car.nextCp
            _px, _py = car.x, car.y
            upd = eng.update_progress(track, car, fr / 20.0)
            if car.nextCp != _old_cp:
                _cp = track.checkpoints[_old_cp]
                _r = math.hypot(_px - _cp["x"], _py - _cp["y"]) / _cp["radius"]
                CP_RATIOS.append(_r)
                if _r > 0.85:
                    CP_DANGER.append((tr.get("seed"), _old_cp, round(_r, 3)))
            if upd and upd[0] == "lap":
                lap_times.append(upd[2])
            off_frames += 1 if car.offRoad else 0
            if TRACE:
                _s, _lat, _i, _t = drv.track.project(car.x, car.y, None) if drv.track else (0,0,0,0)
                TRACE_F.write(json.dumps({"f": fr, "x": round(car.x,3), "y": round(car.y,3),
                    "ang": round(car.angle,3), "v": round(math.hypot(car.vx,car.vy),3),
                    "vx": round(car.vx,3), "vy": round(car.vy,3), "s": round(_s,2), "lat": round(_lat,2),
                    "off": int(car.offRoad), "dr": int(car.drifting), "bo": int(car.boosting),
                    "dc": round(car.driftCharge,3), "be": round(car.boostEnergy,3),
                    "thr": round(float(inp.get("throttle",0)),2), "st": round(float(inp.get("steer",0)),2)}) + "\n")
            drift_frames += 1 if car.drifting else 0
            boost_frames += 1 if car.boosting else 0
            sp = math.hypot(car.vx, car.vy)
            speeds.append(sp)
            max_speed = max(max_speed, sp)
            cp = track.checkpoints[car.nextCp]
            d = math.hypot(car.x - cp["x"], car.y - cp["y"])
            min_cp_clear = min(min_cp_clear, d / cp["radius"])
            if car.finished:
                status = "finished"
                break
    # charge sum is not accumulated here; use boostEnergy spent proxy
    return {
        "seed": tr.get("seed"), "status": status, "cpMaxRatio": round(max(CP_RATIOS), 3) if CP_RATIOS else None, "cpN": len(CP_RATIOS),
        "laps": car.lap, "lapTimes": [round(x, 3) for x in lap_times],
        "total": round(lap_times[0] + sum(lap_times[1:]), 3) if lap_times else None,
        "offFrames": off_frames, "boostSec": round(boost_frames / 20.0, 2),
        "driftSec": round(drift_frames / 20.0, 2), "boosts": car.boosts,
        "charge": round(charge_sum, 3), "path": round(path_len, 1),
        "avgV": round(sum(speeds) / max(len(speeds), 1), 2), "maxV": round(max_speed, 2),
        "minCpClear": round(min_cp_clear, 2),
    }


def main():
    path = sys.argv[1]
    limit = None
    verbose = "--verbose" in sys.argv
    params = None
    for i, a in enumerate(sys.argv):
        if a == "--limit":
            limit = int(sys.argv[i + 1])
        if a == "--params":
            params = json.load(open(sys.argv[i + 1]))
    tracks = json.load(open(path))
    if limit:
        tracks = tracks[:limit]
    rows = []
    for tr in tracks:
        CP_RATIOS.clear(); CP_DANGER.clear()
        r = run_one(tr, verbose, params)
        rows.append(r)
        if verbose:
            print(json.dumps(r, ensure_ascii=False))
    fin = [r for r in rows if r["status"] == "finished"]
    n = len(rows)
    print("seeds=%d finished=%d offFrames=%d avgLap=%.3f worstLap=%.2f driftSec=%.2f boostSec=%.2f boosts=%.1f minCp=%.2f"
          % (n, len(fin),
             sum(r["offFrames"] for r in rows),
             (sum(sum(r["lapTimes"]) / max(len(r["lapTimes"]), 1) for r in fin) / max(len(fin), 1)) if fin else 0,
             max((max(r["lapTimes"]) for r in fin), default=0),
             (sum(r["driftSec"] for r in rows) / n) if n else 0,
             (sum(r["boostSec"] for r in rows) / n) if n else 0,
             (sum(r["boosts"] for r in rows) / n) if n else 0,
             min((r["minCpClear"] for r in rows), default=0)),
          "cpMaxRatio=%.3f" % max((r.get("cpMaxRatio") or 0) for r in rows),
          "cpN=%d" % sum((r.get("cpN") or 0) for r in rows),
          "danger=%s" % CP_DANGER[:6])


if __name__ == "__main__":
    main()
