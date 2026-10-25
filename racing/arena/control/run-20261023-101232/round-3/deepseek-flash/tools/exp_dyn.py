# -*- coding: utf-8 -*-
"""Flat-ground dynamics probe (exact to simulation.updateCar, no track surface)."""
import math, sys
DT=0.05
R=dict(accel=17.,brake=26.,reverseAccel=8.,maxSpeed=14.,boostMaxSpeed=23.,boostAccel=30.,
 drag=0.6,gripNormal=0.80,gripDrift=0.985,turnRate=3.2,driftTurnBoost=1.6,driftMinSpeed=4.,
 driftChargeRate=0.55,boostDrain=0.6,wallRestitution=0.45,offRoadMax=7.,offRoadAccel=0.35,offRoadDrag=0.94)

def run(seq, n=120, v0=22.0):
    x=y=0.0; ang=0.0; vx=v0; vy=0.0; dc=0.0; be=0.5; drifting=False
    log=[]
    for i in range(n):
        throttle,steer,drift,boost=seq(i)
        f=(math.cos(ang),math.sin(ang)); right=(-f[1],f[0])
        vF=vx*f[0]+vy*f[1]; vL=vx*right[0]+vy*right[1]
        was=drifting
        drifting=drift and abs(vF)>R["driftMinSpeed"] and abs(steer)>0.15
        if throttle>0: vF+=R["accel"]*throttle*DT
        elif throttle<0:
            if vF>0.5: vF-=R["brake"]*DT
            else: vF=max(-5.,vF-R["reverseAccel"]*DT)
        vF*=math.exp(-R["drag"]*DT)
        sa=abs(vF)
        if sa>0.25:
            d=1. if vF>0 else -1.
            gain=min(1.,sa/8.)
            ang+=steer*R["turnRate"]*gain*(R["driftTurnBoost"] if drifting else 1.)*d*DT
        vL*=R["gripDrift"] if drifting else R["gripNormal"]
        if drifting:
            dc=min(1.,dc+(abs(vL)*0.12+sa*0.02)*R["driftChargeRate"]*DT)
        elif was:
            be=min(1.,be+dc); dc=0.
        want=boost and be>0.02
        if want:
            vF+=R["boostAccel"]*DT; be=max(0.,be-R["boostDrain"]*DT)
        cap=R["boostMaxSpeed"] if want else R["maxSpeed"]
        if vF>cap: vF=max(cap,vF-18*DT)
        vx=f[0]*vF+right[0]*vL; vy=f[1]*vF+right[1]*vL
        x+=vx*DT; y+=vy*DT
        if i%5==0 or i==n-1:
            log.append((i,x,y,math.hypot(vx,vy),vF,vL,ang,dc,be,drifting,want))
    return log

def show(name,seq,n=120,v0=22.0):
    print("==",name)
    for r in run(seq,n,v0):
        i,x,y,v,vF,vL,ang,dc,be,dr,bo=r
        print(" f%3d pos(%6.2f,%6.2f) v=%5.2f vF=%5.2f vL=%6.2f ang=%6.2f dc=%.3f be=%.3f dr=%d bo=%d"%(i,x,y,v,vF,vL,ang,dc,be,dr,bo))
    r=run(seq,n,v0)[-1]
    print(" final dx=%.2f dy=%.2f v=%.2f"%(r[1],r[2],r[3]))

show("steady steer=1 drift", lambda i:(1.,1.,True,True), 60)
show("alternating 0.4 / 4f drift", lambda i:(1.,(0.4 if (i//4)%2==0 else -0.4),True,True), 80)
show("alternating 0.4 / 4f nodrift", lambda i:(1.,(0.4 if (i//4)%2==0 else -0.4),False,True), 80)
