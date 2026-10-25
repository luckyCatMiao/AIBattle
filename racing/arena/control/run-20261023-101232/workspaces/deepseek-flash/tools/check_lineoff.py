import json,io,math,sys,importlib.util
spec=importlib.util.spec_from_file_location('ag','agent.py'); ag=importlib.util.module_from_spec(spec); spec.loader.exec_module(ag)
for name,seat in [('r3-g1',0),('r3-g2',1)]:
    d=json.load(io.open('tools/r3/%s.json'%name,encoding='utf-8'))
    tr=ag.Track(d['track'])
    print('='*80,name)
    same=0; tot=0; target_inside=0; target_tot=0; vals=[]; tvals=[]
    for f in d['frames']:
        if f['tick']<30: continue
        c=f['cars'][seat]
        speed=math.hypot(c['vx'],c['vy']); s0,lat,idx,tang=tr.project(c['x'],c['y'],None)
        Ld=ag.clamp(2.6+0.9*speed,2.0,12.0)
        tx,ty,ttan=tr.pos_tan(s0+Ld)
        kt=tr.ksm_sign_at(s0+Ld)
        mag=min(1.0,abs(kt)*12.0)
        off_l=min(1.6,max(0.0,tr.half-1.5))*mag
        off_l*=ag.clamp((tr.half-0.9-abs(lat))/1.0,0.0,1.0)
        if off_l>0.01:
            nxs,nys=-math.sin(ttan),math.cos(ttan)
            sgn=1.0 if kt>0 else -1.0
            tx+=nxs*off_l*sgn; ty+=nys*off_l*sgn
        ts,tlat,_,_=tr.project(tx,ty,None)
        # inside direction: k>0 => inside is left = negative lat (agent convention lat>0 right)
        inside=-1 if kt>0 else 1
        # target lateral relative to centerline (agent lat)
        target_inside += 1 if tlat*inside>0 else 0
        target_tot+=1
        # actual lat sign (agent lat from project already)
        if abs(kt)>0.02:
            tot+=1
            if lat*inside>0: same+=1
            vals.append(lat*inside)
    print('actual inside %.0f%% mean %+.2f | target inside %.0f%%'%(100*same/tot,sum(vals)/len(vals),100*target_inside/target_tot))
