"""Check sim.py against validate.js output."""
import json
import subprocess

import sim

windows = 30
COUNTDOWN_FRAMES = 30
worst = 0.0
worst_field = None
for seed in (1, 7, 5011, 6022, 123456):
    out = subprocess.run(['node', 'validate.js', str(seed), str(windows)],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    track = sim.Track(data['track'])
    st0 = data['states'][0]
    cars = [sim.Car(st0['x'], st0['y'], st0['angle']),
            sim.Car(st0['x'], st0['y'], st0['angle'])]
    # restore real grid positions for both cars
    cars[0] = sim.Car(track.grid[0][0], track.grid[0][1], track.grid[0][2])
    cars[1] = sim.Car(track.grid[1][0], track.grid[1][1], track.grid[1][2])
    frame = 0
    for w, frames in enumerate(data['inputs']):
        for fr in frames:
            frame += 1
            if frame <= COUNTDOWN_FRAMES:
                continue
            u = fr[0]
            cars[0].throttle, cars[0].steer = u['throttle'], u['steer']
            cars[0].drift, cars[0].boost = u['drift'], u['boost']
            cars[1].throttle = cars[1].steer = 0.0
            cars[1].drift = cars[1].boost = False
            for car in cars:
                sim.update_car(track, car)
            sim.resolve_car_collision(cars[0], cars[1])
            for car in cars:
                sim.update_progress(track, car)
        exp = data['states'][w + 1]
        for f in ('x', 'y', 'angle', 'vx', 'vy', 'driftCharge', 'boostEnergy', 'progress'):
            got = getattr(cars[0], f)
            d = abs(got - exp[f])
            if d > worst:
                worst, worst_field = d, (seed, w, f, got, exp[f])
        for f in ('lap', 'nextCp', 'drifting', 'boosting', 'offRoad', 'finished'):
            if getattr(cars[0], f) != exp[f]:
                print('MISMATCH', seed, w, f, getattr(cars[0], f), exp[f])
    print('seed', seed, 'ok, worst so far', worst, worst_field)

print('FINAL worst', worst, worst_field)
