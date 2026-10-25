"""Fast offline race harness built on the exact sim.py physics."""
import math, json, subprocess, sys, os
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, _ROOT)
import sim
from planner import Line, wrap

TRACK_CACHE = {}
def get_tracks(seeds):
    need = [s for s in seeds if str(s) not in TRACK_CACHE]
    if need:
        out = subprocess.run(['node', 'dumptrack.js'] + [str(s) for s in need],
                             cwd=_ROOT, capture_output=True, text=True, check=True).stdout
        TRACK_CACHE.update(json.loads(out))
    return {str(s): TRACK_CACHE[str(s)] for s in seeds}

class FastTrack:
    def __init__(self, raw, margin=1.0):
        self.t = sim.Track(raw)
        self.hw = self.t.halfWidth
        self.length = self.t.length
        self.cp = self.t.checkpoints
        self.line = Line(self.t, margin=margin)
        self.n = self.t.points
        # curvature per centerline sample for speed profile
        self.kappa = self.line.kappa
        self.ln = self.line.length

    def nearest_hint(self, x, y, hint):
        pts = self.t.points; n = len(pts)
        best, bd = hint, 1e18
        for k in range(-30, 31):
            i = (hint + k) % n
            dx = pts[i][0]-x; dy = pts[i][1]-y
            d = dx*dx+dy*dy
            if d < bd: bd, best = d, i
        return best, math.sqrt(bd), self.t.cum[best]

def run(fast, ctrl, start_idx=0, max_seconds=120.0, laps=3, record=False, energy_free=False, track_state=None):
    t = fast.t
    gx, gy, ga = t.grid[start_idx]
    car = sim.Car(gx, gy, ga)
    hint = 0
    offroad = 0; frames = 0
    lap_frame = 30
    lap_times = []
    prev_lap = 0
    log = []
    while frames < max_seconds*20:
        frames += 1
        if frames <= 30:
            car.throttle = car.steer = 0.0; car.drift = car.boost = False
        else:
            th, st, dr, bo = ctrl.act(car, frames, fast)
            car.throttle, car.steer, car.drift, car.boost = th, st, dr, bo
        if energy_free: car.boostEnergy = 1.0
        sim.update_car(t, car)
        if car.offRoad: offroad += 1
        # progress with hint
        hint, d, s = fast.nearest_hint(car.x, car.y, hint)
        car.progress = car.lap*t.length + s
        if not car.finished:
            cp = t.checkpoints[car.nextCp]
            if math.hypot(car.x-cp[0], car.y-cp[1]) <= cp[2]:
                if car.nextCp == 0:
                    lt = (frames-lap_frame)/20.0
                    lap_times.append(lt); lap_frame = frames
                    car.lap += 1; car.nextCp = 1
                    if car.lap >= laps: car.finished = True
                else:
                    car.nextCp = (car.nextCp+1) % 16
        if record and frames % 2 == 0:
            log.append((frames/20.0, car.x, car.y, math.hypot(car.vx,car.vy), car.offRoad, car.boostEnergy, car.drifting))
        if car.finished: break
    return dict(finished=car.finished, time=(frames-30)/20.0, lap_times=lap_times,
                offroad_pct=offroad/max(1,frames-30)*100, log=log, progress=car.progress, frames=frames)
