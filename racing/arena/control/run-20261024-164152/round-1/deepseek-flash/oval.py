import math, sim
def oval_track(R=10.0, L=40.0, hw=3.5, cx=64.0, cy=44.0):
    pts=[]
    # top straight (left to right), then right semicircle, bottom straight (right to left), left semicircle
    xa, xb = cx-L/2, cx+L/2
    n=400
    # parametric: walk CCW starting at (xa, cy-R)
    per=n
    seg1=L; seg2=math.pi*R; seg3=L; seg4=math.pi*R
    total=2*seg1+2*seg2
    for i in range(per):
        t=total*i/per
        if t<seg1:
            pts.append((xa+t, cy-R))
        elif t<seg1+seg2:
            a=(t-seg1)/R
            pts.append((xb+R*math.sin(a), cy-R*math.cos(a)))
        elif t<seg1+seg2+seg3:
            pts.append((xb-(t-seg1-seg2), cy+R))
        else:
            a=(t-seg1-seg2-seg3)/R
            pts.append((xa-R*math.sin(a), cy+R*math.cos(a)))
    # rasterise
    tiles=[1]*(128*88)
    for y in range(88):
        for x in range(128):
            d=min(math.hypot(x+0.5-px, y+0.5-py) for px,py in pts[::4])
            if d<=hw: tiles[y*128+x]=0
    cps=[]
    for i in range(16):
        p=pts[int(round(len(pts)*i/16))%len(pts)]
        cps.append({'x':p[0],'y':p[1],'radius':hw+0.6})
    # start at index 0 (xa, cy-R)
    pts=pts[:]
    return dict(width=128,height=88,tiles=tiles,points=[{'x':p[0],'y':p[1]} for p in pts],
                halfWidth=hw,length=total,checkpoints=cps,start={'x':xa,'y':cy-R,'angle':0},
                grid=[{'x':xa-4,'y':cy-R,'angle':0},{'x':xa-8,'y':cy-R,'angle':0}])
