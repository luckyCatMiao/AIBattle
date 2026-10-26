import gzip,json,glob,sys
D=sys.argv[1]
from collections import defaultdict
agg=defaultdict(lambda:[0,0,0,0,0])  # w,l,d,gf,ga
games=[]
for fn in sorted(glob.glob(D+'/r1-g*.json.gz')):
    d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
    my=d['seats'].index('deepseek-g1'); n=d['teamSize']
    sc=d['scores']; gf=sc['deepseek-g1']; ga=sc['sol']
    r = 0 if gf>ga else (2 if gf<ga else 1)
    a=agg[n]; a[0]+= r==0; a[1]+= r==2; a[2]+= r==1; a[3]+=gf; a[4]+=ga
    games.append((n,my,gf,ga,fn.split('/')[-1]))
tot=[0,0,0,0,0]
for n in sorted(agg):
    a=agg[n]; print('n=%d  W%d L%d D%d  %d:%d'%(n,a[0],a[1],a[2],a[3],a[4]))
    for i in range(5): tot[i]+=a[i]
print('TOTAL W%d L%d D%d  %d:%d  winrate %.1f%%'%(tot[0],tot[1],tot[2],tot[3],tot[4],100.0*tot[0]/max(1,sum(tot[:3]))))
print('games:',games)
