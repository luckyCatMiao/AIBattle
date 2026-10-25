"""Offline race harness for tuning. Runs 3 laps, optionally with an opponent."""
import json
import math
import subprocess
import sys

import sim
from planner import Line, wrap
from controller import Controller
from controller2 import DriftController


def load_tracks(seeds):
    out = subprocess.run(['node', 'dumptrack.js'] + [str(s) for s in seeds],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class SimpleBot:
    """Baseline centreline follower used only for collision realism."""

    def __init__(self, track, drift=True, boost=True, gain=1.4, look=8.0):
        self.t = track
        self.drift = drift
        self.boost = boost
        self.gain = gain
        self.look = look
        self.s = 0.0

    def act(self, car, frame):
        t = self.t
        s, d = t.nearest_s(car.x, car.y)
        tx, ty, ta = t.point_at(s + self.look)
        desired = math.atan2(ty - car.y, tx - car.x)
        err = wrap(desired - car.angle)
        steer = max(-1.0, min(1.0, err * self.gain))
        # speed: slow for curvature ahead, else full throttle
        k = 0.0
        for dd in (3, 6, 10, 14, 20):
            _, _, a = t.point_at(s + dd)
            _, _, b = t.point_at(s + dd + 2)
            k = max(k, abs(wrap(b - a)) / 2)
        vt = min(13.5, 4.6 / k) if k > 0.01 else 13.5
        v = sim.speed(car)
        throttle = 1.0 if v < vt else -1.0
        return throttle, steer, self.drift, self.boost and car.boostEnergy > 0.1


_LINE_CACHE = {}


def get_line(track, track_raw):
    key = id(track_raw)
    if key not in _LINE_CACHE:
        _LINE_CACHE[key] = Line(track)
    return _LINE_CACHE[key]


def run_race(track_raw, ctrl_params=None, bot=None, max_seconds=300.0, verbose=False,
             laps=3, energy_free=False, ctrl_class=None, start_idx=0):
    track = sim.Track(track_raw)
    line = get_line(track, track_raw)
    ctrl = (ctrl_class or Controller)(line, ctrl_params)
    car = sim.Car(track.grid[start_idx][0], track.grid[start_idx][1], track.grid[start_idx][2])
    cars = [car]
    if bot is not None:
        c2 = sim.Car(track.grid[1][0], track.grid[1][1], track.grid[1][2])
        cars.append(c2)
    else:
        c2 = None
    frame = 0
    countdown = 30
    offroad = 0
    lap_times = []
    last_lap_frame = countdown
    finish_frame = None
    best_lap = None
    prev_lap = 0
    stuck_frames = 0
    while frame < max_seconds * 20:
        frame += 1
        if frame <= countdown:
            continue
        throttle, steer, drift, boost = ctrl.act(car, frame)
        car.throttle, car.steer, car.drift, car.boost = throttle, steer, drift, boost
        if c2 is not None:
            b = bot.act(c2, frame)
            c2.throttle, c2.steer, c2.drift, c2.boost = b
        if energy_free:
            car.boostEnergy = 1.0
        for c in cars:
            sim.update_car(track, c)
        if c2 is not None:
            sim.resolve_car_collision(car, c2)
        for c in cars:
            sim.update_progress(track, c)
        if car.offRoad:
            offroad += 1
        if car.lap != prev_lap:
            lt = (frame - last_lap_frame) / 20.0
            if best_lap is None or lt < best_lap:
                best_lap = lt
            last_lap_frame = frame
            prev_lap = car.lap
        if car.finished:
            finish_frame = frame
            break
    t = (frame - countdown) / 20.0
    return dict(
        finished=car.finished, time=t if car.finished else None,
        lap=car.lap, progress=car.progress, offroad_pct=offroad / max(1, frame - countdown) * 100,
        best=best_lap, frames=frame - countdown,
        track_len=track.length, kappa=[line.kappa[i] for i in range(0, line.n, max(1, line.n // 16))],
    )


if __name__ == '__main__':
    seeds = [int(x) for x in (sys.argv[1:] or '6011 6012 6021 6022 1 2 3 4 5 6 7 8'.split())]
    data = load_tracks(seeds)
    tot = 0.0
    for s in seeds:
        r = run_race(data[str(s)])
        print(f"seed {s:6d} L={r['track_len']:6.1f} fin={r['finished']} t={r['time']} "
              f"lap={r['lap']} off={r['offroad_pct']:5.1f}% best={r['best']}")
        if r['time']:
            tot += r['time']
    print('done')
