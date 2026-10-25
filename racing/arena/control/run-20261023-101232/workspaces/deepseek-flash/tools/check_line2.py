import json,io,math,bisect,importlib.util
spec=importlib.util.spec_from_file_location('ag','agent.py'); ag=importlib.util.module_from_spec(spec); spec.loader.exec_module(ag)
for name in ['r3-g1','r3-g2']:
    d=json.load(io.open('tools/r3/%s.json'%name,encoding='utf-8'))
    tr=ag.Track(d['track'])
    print('='*80,name)
    for seat in range(2):
        same=0; tot=0; vals=[]
        for f in d['frames']:
            if f['tick']<30: continue
            c=f['cars'][seat]
            s,lat,_,_=tr.project(c['x'],c['y'],None)
            k=tr.ksm_sign_at(s)
            if abs(k)<0.02: continue
            tot+=1
            inside=1.0 if k>0 else -1.0   # lat>0 is right; k>0 is right turn (screen coords)
            if lat*inside>0: same+=1
            vals.append(lat*inside)
        print(' car',seat,d['seats'][seat],'inside %.0f%% of %d, mean toward inside %+.2f'%(100*same/tot,tot,sum(vals)/len(vals)))
