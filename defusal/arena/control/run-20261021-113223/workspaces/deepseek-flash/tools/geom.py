import math,heapq,json,sys
sys.path.insert(0,'/workspace')
# load map from catalog via node? reimplement from catalog constants
import subprocess
tiles=json.loads(subprocess.check_output(['node','-e',"const c=require('/workspace/catalog');console.log(JSON.stringify(Array.from(c.buildMap())))"]))
W,H=40,24
def wall(tx,ty):
    if tx<0 or ty<0 or tx>=W or ty>=H: return True
    return tiles[ty*W+tx]==1
def los(x1,y1,x2,y2):
    dx,dy=x2-x1,y2-y1;d=math.hypot(dx,dy)
    if d<1e-6: return True
    n=max(1,int(math.ceil(d/0.1)))
    for i in range(1,n):
        t=i/n
        if wall(math.floor(x1+dx*t),math.floor(y1+dy*t)): return False
    return True
def canfire(px,py,face,ex,ey,R):
    dx,dy=ex-px,ey-py; d=math.hypot(dx,dy)
    if d>R or d<1e-9: return False
    if not los(px,py,ex,ey): return False
    fa=math.atan2(face[1],face[0]); ta=math.atan2(dy,dx)
    diff=abs(((ta-fa+math.pi*3)%(math.pi*2))-math.pi)
    return diff<=math.radians(50)
C_HOLD=[(17.5,9.5),(19.5,9.5),(21.5,9.5),(18.5,8.5),(20.5,8.5)]
def covered(x,y,R,pos=C_HOLD,face=(0,1)):
    return any(canfire(px,py,face,x,y,R) for px,py in pos)
if __name__=='__main__':
    R=float(sys.argv[1]) if len(sys.argv)>1 else 22
    # print map with 'x' covered, 'S' spawn, 'P' plant
    for y in range(H):
        row=''
        for x in range(W):
            if wall(x,y): row+='#'
            else:
                c='x' if covered(x+.5,y+.5,R) else '.'
                if (x,y) in [(17,21),(18,21),(19,21),(20,21),(21,21)]: c='S'
                if (x,y) in [(9,6),(30,6)]: c='P'
                row+=c
        print('%2d %s'%(y,row))
    for name,(px,py) in [('A',(9.5,6.5)),('B',(30.5,6.5))]:
        print(name,'plant covered?',covered(px,py,R))
