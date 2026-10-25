import sys, math, json; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks
import sim
raw=get_tracks([int(sys.argv[1])])[sys.argv[1]]
t=sim.Track(raw)
car=sim.Car(*t.grid[0])
car.boostEnergy=1.0
i=0
for i in range(300):
    car.throttle=1.0; car.steer=0.3*math.sin(i*0.11); car.drift=(i%7)!=0; car.boost=True
    sim.update_car(t,car)
    sim.update_progress(t,car)
print(json.dumps(dict(x=car.x,y=car.y,ang=car.angle,vx=car.vx,vy=car.vy,be=car.boostEnergy,de=car.driftCharge,lap=car.lap,nextCp=car.nextCp,off=car.offRoad)))
