import gzip,json,math,sys
sys.path.insert(0,'dev')
from replay import Match
for gid in ['r1-g1','r1-g2','r2-g1','r2-g2','r3-g1','r3-g2']:
    d=json.load(gzip.open('../../'+gid+'.json.gz','rt',encoding='utf-8'))
    wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
    m=Match(d['seed'],wins).run(); our=d['seats'].index('deepseek-flash'); opp=1-our
    band=[]; band_ready=[]
    for fr,st in enumerate(m.frames):
        s=math.hypot(st['px'][0]-st['px'][1],st['py'][0]-st['py'][1])
        if 0.545<=s<=1.885:
            band.append((fr,round(s,3),st['cd'][opp]))
            if st['cd'][opp]<=6: band_ready.append((fr,round(s,3),st['cd'][opp]))
    print(gid,'frames in kill band:',len(band),'with opp_cd<=6:',len(band_ready),band_ready[:12])
